import { useEffect, useRef, useState } from 'react';
import {
    collection,
    doc,
    setDoc,
    onSnapshot,
    addDoc,
    query,
    where,
    deleteDoc,
    getDocs
} from 'firebase/firestore';

const servers = {
    iceServers: [
        { urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] },
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
        { urls: 'stun:global.stun.twilio.com:3478' }
    ],
    iceCandidatePoolSize: 10,
};

export function useWebRTC(roomId: string, userId: string, userName: string, db: any) {
    const [peers, setPeers] = useState<Map<string, MediaStream>>(new Map());
    const [peerNames, setPeerNames] = useState<Map<string, string>>(new Map());
    const [isCameraOn, setIsCameraOn] = useState(false);
    const localStream = useRef<MediaStream | null>(null);
    const [activeStream, setActiveStream] = useState<MediaStream | null>(null);
    const pcRef = useRef<Map<string, RTCPeerConnection>>(new Map());
    const makingOfferRef = useRef<Map<string, boolean>>(new Map());
    const candidateQueueRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
    const [mountedAt] = useState(Date.now());

    useEffect(() => {
        async function setupStream() {
            const inputId = localStorage.getItem('voice_inputId') || 'default';
            const echo = localStorage.getItem('voice_echoCancellation') !== 'false';
            const noise = localStorage.getItem('voice_noiseSuppression') !== 'false';

            if (localStream.current) {
                // Don't stop all tracks, we might want to keep some? 
                // Actually the original code stopped all.
                // If we are just toggling video, stopping audio might be bad if we don't restart it quickly.
                // But getUserMedia returns a new stream with both if requested.
                // To toggle video smoothly, we usually just `enabled = false` or `stop` the track and `addTrack`.
                // For this refactor I will stick to the original logic of getting a new stream to be safe, 
                // but implementation below tries to be smart about replacing tracks.
            }

            try {
                // Stop existing tracks before getting new ones to release hardware
                if (localStream.current) {
                    localStream.current.getTracks().forEach(t => t.stop());
                }

                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        deviceId: inputId !== 'default' ? { exact: inputId } : undefined,
                        echoCancellation: echo,
                        noiseSuppression: noise,
                        autoGainControl: true
                    },
                    video: isCameraOn ? {
                        width: { ideal: 1280 },
                        height: { ideal: 720 },
                        frameRate: { ideal: 30 }
                    } : false
                });
                localStream.current = stream;
                setActiveStream(stream);

                // Update tracks in all active peer connections
                pcRef.current.forEach(pc => {
                    const audioTrack = stream.getAudioTracks()[0];
                    const videoTrack = stream.getVideoTracks()[0];

                    const audioSender = pc.getSenders().find(s => s.track?.kind === 'audio');
                    if (audioSender && audioTrack) {
                        try {
                            audioSender.replaceTrack(audioTrack);
                        } catch (e) {
                            console.error("Error replacing audio track", e);
                        }
                    } else if (!audioSender && audioTrack) {
                        // If no audio sender yet, add it (negotiation needed)
                        try {
                            pc.addTrack(audioTrack, stream);
                        } catch (e) {
                            console.error("Error adding audio track", e);
                        }
                    }

                    const videoSender = pc.getSenders().find(s => s.track?.kind === 'video' && !s.track.label.toLowerCase().includes('screen'));
                    if (videoSender && videoTrack) {
                        try {
                            videoSender.replaceTrack(videoTrack);
                        } catch (e) {
                            console.error("Error replacing video track", e);
                        }
                    } else if (videoTrack && !videoSender) {
                        try {
                            pc.addTrack(videoTrack, stream);
                        } catch (e) {
                            console.error("Error adding video track", e);
                        }
                    } else if (!videoTrack && videoSender) {
                        try {
                            // Instead of removing, we might want to just disable or send black frames 
                            // to avoid renegotiation, but removing is cleaner for "camera off".
                            pc.removeTrack(videoSender);
                        } catch (e) {
                            console.error("Error removing video track", e);
                        }
                    }
                });
            } catch (err) {
                console.error("Error getting user media:", err);
            }
        }

        const handleSettingsUpdate = (e: any) => {
            const { key } = e.detail;
            if (['inputId', 'echoCancellation', 'noiseSuppression'].includes(key)) {
                setupStream();
            }
        };

        window.addEventListener('voice_settings_updated', handleSettingsUpdate);

        // Initial setup
        setupStream();

        return () => {
            window.removeEventListener('voice_settings_updated', handleSettingsUpdate);
            if (localStream.current) {
                localStream.current.getTracks().forEach(t => t.stop());
            }
        };
    }, [isCameraOn]); // Re-run stream setup when camera toggles

    // Main Room Logic
    useEffect(() => {
        let membersUnsubscribe: () => void;
        let signalingUnsubscribe: () => void;
        let iceUnsubscribe: () => void;
        const memberDoc = doc(db, `rooms/${roomId}/members`, userId);

        async function setup() {
            // 2. Register in Room
            await setDoc(memberDoc, { name: userName, joinedAt: Date.now() });

            // 3. Listen for other members
            membersUnsubscribe = onSnapshot(collection(db, `rooms/${roomId}/members`), async (snapshot) => {
                snapshot.docChanges().forEach(async (change) => {
                    const data = change.doc.data();
                    const remoteUserId = change.doc.id;

                    if (change.type === 'added' || change.type === 'modified') {
                        if (remoteUserId !== userId) {
                            setPeerNames(prev => new Map(prev).set(remoteUserId, data.name));
                            if (change.type === 'added') {
                                createPeerConnection(remoteUserId);
                            }
                        }
                    }
                    if (change.type === 'removed') {
                        closePeerConnection(remoteUserId);
                        setPeerNames(prev => {
                            const next = new Map(prev);
                            next.delete(remoteUserId);
                            return next;
                        });
                    }
                });
            });

            // 4. Listen for signaling messages
            signalingUnsubscribe = onSnapshot(collection(db, `rooms/${roomId}/signaling`), async (snapshot) => {
                snapshot.docChanges().forEach(async (change) => {
                    if (change.type === 'added') {
                        const data = change.doc.data();
                        if (data.targetId === userId && data.createdAt > mountedAt) {
                            await handleSignaling(data);
                        }
                    }
                });
            });

            // 5. Listen for ICE candidates
            iceUnsubscribe = onSnapshot(collection(db, `rooms/${roomId}/iceCandidates`), (snapshot) => {
                snapshot.docChanges().forEach(async (change) => {
                    if (change.type === 'added') {
                        const data = change.doc.data();
                        if (data.targetId === userId && data.createdAt > mountedAt) {
                            await handleIce(data.senderId, data.candidate);
                        }
                    }
                });
            });
        }

        setup();

        return () => {
            if (membersUnsubscribe) membersUnsubscribe();
            if (signalingUnsubscribe) signalingUnsubscribe();
            if (iceUnsubscribe) iceUnsubscribe();
            pcRef.current.forEach(pc => pc.close());
            deleteDoc(memberDoc);
        };
    }, [roomId, userId, userName, db]);

    async function createPeerConnection(remoteUserId: string) {
        if (pcRef.current.has(remoteUserId)) return;

        const pc = new RTCPeerConnection(servers);
        pcRef.current.set(remoteUserId, pc);
        makingOfferRef.current.set(remoteUserId, false);

        // Polite/Impolite logic to handle glare (signaling collision)
        // The peer with the "higher" ID is polite and will wait.
        const isPolite = userId > remoteUserId;
        let ignoreOffer = false;

        if (localStream.current) {
            localStream.current.getTracks().forEach(track => {
                pc.addTrack(track, localStream.current!);
            });
        }

        pc.ontrack = (event) => {
            setPeers(prev => {
                const next = new Map(prev);
                const existingStream = next.get(remoteUserId);
                const remoteStream = existingStream || new MediaStream();

                if (event.streams && event.streams[0]) {
                    event.streams[0].getTracks().forEach(track => {
                        if (!remoteStream.getTracks().find(t => t.id === track.id)) {
                            remoteStream.addTrack(track);
                        }
                    });
                } else {
                    // Fallback for tracks added without a stream (uncommon but possible with addTrack(track))
                    // or if replaceTrack was used in a way that doesn't signal stream binding.
                    if (!remoteStream.getTracks().find(t => t.id === event.track.id)) {
                        remoteStream.addTrack(event.track);
                    }
                }

                next.set(remoteUserId, new MediaStream(remoteStream.getTracks()));
                return next;
            });
        };

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                addDoc(collection(db, `rooms/${roomId}/iceCandidates`), {
                    senderId: userId,
                    targetId: remoteUserId,
                    candidate: event.candidate.toJSON(),
                    createdAt: Date.now()
                });
            }
        };

        pc.onnegotiationneeded = async () => {
            try {
                makingOfferRef.current.set(remoteUserId, true);
                await pc.setLocalDescription();
                await addDoc(collection(db, `rooms/${roomId}/signaling`), {
                    type: 'offer',
                    senderId: userId,
                    targetId: remoteUserId,
                    description: pc.localDescription?.toJSON(),
                    createdAt: Date.now()
                });
            } catch (err) {
                console.error("Negotiation error:", err);
            } finally {
                makingOfferRef.current.set(remoteUserId, false);
            }
        };

        // We use a separate listener for signaling within this closure to manage state easier,
        // but since we already have a global listener, we need to ensure they don't fight.
        // Actually, the global listener is better for centralized management.
        // Let's stick to the global listener but update it to handle the new logic.
    }

    async function handleSignaling(data: any) {
        const { senderId, type, description, sdp } = data;
        let pc = pcRef.current.get(senderId);

        if (!pc) {
            await createPeerConnection(senderId);
            pc = pcRef.current.get(senderId);
        }
        if (!pc) return;

        const isPolite = userId > senderId;
        const makingOffer = makingOfferRef.current.get(senderId) || false;
        const offerCollision = type === 'offer' && (makingOffer || pc.signalingState !== 'stable');
        const ignoreOffer = !isPolite && offerCollision;

        if (ignoreOffer) {
            console.log(`[WebRTC] Ignoring offer from ${senderId} due to collision`);
            return;
        }

        try {
            if (type === 'offer') {
                const offerDescription = description || new RTCSessionDescription({ type: 'offer', sdp });

                if (offerCollision && isPolite) {
                    try {
                        await Promise.all([
                            pc.setLocalDescription({ type: 'rollback' }),
                            pc.setRemoteDescription(offerDescription)
                        ]);
                    } catch (rollbackErr) {
                        console.warn("Rollback failed, trying standard setRemote", rollbackErr);
                        await pc.setRemoteDescription(offerDescription);
                    }
                } else {
                    await pc.setRemoteDescription(offerDescription);
                }

                await pc.setLocalDescription();
                await addDoc(collection(db, `rooms/${roomId}/signaling`), {
                    type: 'answer',
                    senderId: userId,
                    targetId: senderId,
                    description: pc.localDescription?.toJSON(),
                    createdAt: Date.now()
                });
            } else if (type === 'answer') {
                await pc.setRemoteDescription(description || new RTCSessionDescription({ type: 'answer', sdp }));
            }
            if (type === 'offer' || type === 'answer') {
                const candidates = candidateQueueRef.current.get(senderId);
                if (candidates && candidates.length > 0) {
                    console.log(`[WebRTC] Flushing ${candidates.length} buffered candidates for ${senderId}`);
                    for (const candidate of candidates) {
                        try {
                            await pc.addIceCandidate(new RTCIceCandidate(candidate));
                        } catch (e) { console.error("Error adding buffered candidate", e); }
                    }
                    candidateQueueRef.current.delete(senderId);
                }
            }
        } catch (err) {
            console.error("Signaling error:", err);
        }
    }

    async function handleOffer(senderId: string, sdp: string) {
        // Legacy, handled by handleSignaling now
    }

    async function handleAnswer(senderId: string, sdp: string) {
        // Legacy, handled by handleSignaling now
    }

    async function handleIce(senderId: string, candidate: any) {
        const pc = pcRef.current.get(senderId);
        if (pc) {
            try {
                if (pc.remoteDescription && pc.remoteDescription.type) {
                    await pc.addIceCandidate(new RTCIceCandidate(candidate));
                } else {
                    // Buffer candidate
                    const queue = candidateQueueRef.current.get(senderId) || [];
                    queue.push(candidate);
                    candidateQueueRef.current.set(senderId, queue);
                    console.log(`[WebRTC] Buffered ICE candidate for ${senderId} (remoteDesc not ready)`);
                }
            } catch (e) {
                console.error('Error adding ice candidate', e);
            }
        }
    }

    function closePeerConnection(remoteUserId: string) {
        const pc = pcRef.current.get(remoteUserId);
        if (pc) {
            pc.close();
            pcRef.current.delete(remoteUserId);
            setPeers(prev => {
                const next = new Map(prev);
                next.delete(remoteUserId);
                return next;
            });
        }
    }

    const [screenStream, setScreenStream] = useState<MediaStream | null>(null);

    async function toggleScreenShare() {
        if (screenStream) {
            screenStream.getTracks().forEach(t => t.stop());
            setScreenStream(null);

            // Revert changes
            pcRef.current.forEach(pc => {
                const videoSender = pc.getSenders().find(s => s.track?.kind === 'video');
                if (videoSender) {
                    // Always remove track first to clean up state
                    pc.removeTrack(videoSender);

                    // If camera was on, we need to add it back as a NEW track to ensure clean negotiation
                    if (isCameraOn && localStream.current) {
                        const cameraTrack = localStream.current.getVideoTracks()[0];
                        if (cameraTrack) {
                            pc.addTrack(cameraTrack, localStream.current);
                        }
                    }
                }
            });
        } else {
            try {
                const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
                setScreenStream(stream);
                const screenTrack = stream.getVideoTracks()[0];

                pcRef.current.forEach(pc => {
                    const videoSender = pc.getSenders().find(s => s.track?.kind === 'video');
                    if (videoSender) {
                        // Remove existing video track (e.g. camera) to force renegotiation
                        pc.removeTrack(videoSender);
                    }

                    // Add screen track as a new track
                    pc.addTrack(screenTrack, stream);
                });

                screenTrack.onended = () => {
                    setScreenStream(null);
                    pcRef.current.forEach(pc => {
                        const videoSender = pc.getSenders().find(s => s.track?.kind === 'video');
                        if (videoSender) {
                            pc.removeTrack(videoSender);
                            if (isCameraOn && localStream.current) {
                                const cameraTrack = localStream.current.getVideoTracks()[0];
                                if (cameraTrack) {
                                    pc.addTrack(cameraTrack, localStream.current);
                                }
                            }
                        }
                    });
                };
            } catch (err) {
                console.error("Screen share error:", err);
            }
        }
    }

    function toggleCamera() {
        setIsCameraOn(prev => !prev);
    }

    return { peers, peerNames, localStream: activeStream, screenStream, toggleScreenShare, isCameraOn, toggleCamera };
}
