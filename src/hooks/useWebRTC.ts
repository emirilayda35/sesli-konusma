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
        {
            urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
        },
    ],
    iceCandidatePoolSize: 10,
};

export function useWebRTC(roomId: string, userId: string, userName: string, db: any) {
    const [peers, setPeers] = useState<Map<string, MediaStream>>(new Map());
    const [peerNames, setPeerNames] = useState<Map<string, string>>(new Map());
    const [isCameraOn, setIsCameraOn] = useState(false);
    const localStream = useRef<MediaStream | null>(null);
    const pcRef = useRef<Map<string, RTCPeerConnection>>(new Map());

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
                                createPeerConnection(remoteUserId, true);
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
                        if (data.targetId === userId) {
                            if (data.type === 'offer') {
                                await handleOffer(data.senderId, data.sdp);
                            } else if (data.type === 'answer') {
                                await handleAnswer(data.senderId, data.sdp);
                            }
                        }
                    }
                });
            });

            // 5. Listen for ICE candidates
            iceUnsubscribe = onSnapshot(collection(db, `rooms/${roomId}/iceCandidates`), (snapshot) => {
                snapshot.docChanges().forEach(async (change) => {
                    if (change.type === 'added') {
                        const data = change.doc.data();
                        if (data.targetId === userId) {
                            const pc = pcRef.current.get(data.senderId);
                            if (pc) {
                                try {
                                    await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
                                } catch (e) {
                                    console.error('Error adding ice candidate', e);
                                }
                            }
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

    async function createPeerConnection(remoteUserId: string, isOffer: boolean) {
        if (pcRef.current.has(remoteUserId)) return;

        const pc = new RTCPeerConnection(servers);
        pcRef.current.set(remoteUserId, pc);

        if (localStream.current) {
            localStream.current.getTracks().forEach(track => {
                pc.addTrack(track, localStream.current!);
            });
        }

        pc.ontrack = (event) => {
            setPeers(prev => {
                const next = new Map(prev);
                next.set(remoteUserId, event.streams[0]);
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

        // Automatic Negotiation Handling
        pc.onnegotiationneeded = async () => {
            try {
                // If we are unstable, we might need to wait or handle glare, 
                // but for simple cases, just processing it usually works if roles are clear.
                // To minimize glare, only the 'polite' peer (or initially the caller) should offer?
                // Or simply: just Offer.

                // For this implementation, we allow renegotiation.
                // However, infinite loops can happen if not careful.
                const offer = await pc.createOffer();
                if (pc.signalingState !== 'stable') return; // Prevent collision if already negotiating

                await pc.setLocalDescription(offer);
                await addDoc(collection(db, `rooms/${roomId}/signaling`), {
                    type: 'offer',
                    senderId: userId,
                    targetId: remoteUserId,
                    sdp: offer.sdp,
                    createdAt: Date.now()
                });
            } catch (err) {
                console.error("Negotiation error:", err);
            }
        };

        // We still trigger initial offer manually if we are the "caller" (isOffer=true)
        // just to be 100% sure the process starts immediately,
        // although onnegotiationneeded would fire after addTrack anyway.
        // But if there are no tracks initially (mic blocked), we still want to connect.
        if (isOffer) {
            // We can rely on onnegotiationneeded mostly, but let's just createDataChannel/offer manually
            // to ensure signaling happens.
            // Actually, to avoid double offer, let's verify if negotiation triggered?
            // Safer: Just call it. If signalingState becomes 'have-local-offer' quickly, the event handler will abort.
            try {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                await addDoc(collection(db, `rooms/${roomId}/signaling`), {
                    type: 'offer',
                    senderId: userId,
                    targetId: remoteUserId,
                    sdp: offer.sdp,
                    createdAt: Date.now()
                });
            } catch (e) {
                console.error("Initial offer error", e);
            }
        }
    }

    async function handleOffer(senderId: string, sdp: string) {
        await createPeerConnection(senderId, false);
        const pc = pcRef.current.get(senderId);
        if (!pc) return;

        await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp }));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        await addDoc(collection(db, `rooms/${roomId}/signaling`), {
            type: 'answer',
            senderId: userId,
            targetId: senderId,
            sdp: answer.sdp,
            createdAt: Date.now()
        });
    }

    async function handleAnswer(senderId: string, sdp: string) {
        const pc = pcRef.current.get(senderId);
        if (!pc) return;
        await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp }));
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

            // Revert to camera if on, or remove track
            pcRef.current.forEach(pc => {
                const videoSender = pc.getSenders().find(s => s.track?.kind === 'video');
                if (videoSender) {
                    if (isCameraOn && localStream.current) {
                        const cameraTrack = localStream.current.getVideoTracks()[0];
                        if (cameraTrack) {
                            videoSender.replaceTrack(cameraTrack).catch(e => console.error("Error reverting to camera", e));
                        } else {
                            pc.removeTrack(videoSender);
                        }
                    } else {
                        pc.removeTrack(videoSender);
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
                        // Replace existing video track (seamless)
                        videoSender.replaceTrack(screenTrack).catch(e => console.error("Error replacing with screen", e));
                    } else {
                        // Add new track (triggers negotiation)
                        pc.addTrack(screenTrack, stream);
                    }
                });

                screenTrack.onended = () => {
                    setScreenStream(null);
                    pcRef.current.forEach(pc => {
                        const videoSender = pc.getSenders().find(s => s.track?.kind === 'video');
                        if (videoSender) {
                            if (isCameraOn && localStream.current) {
                                const cameraTrack = localStream.current.getVideoTracks()[0];
                                if (cameraTrack) {
                                    videoSender.replaceTrack(cameraTrack).catch(e => console.error("Error reverting to camera", e));
                                } else {
                                    pc.removeTrack(videoSender);
                                }
                            } else {
                                pc.removeTrack(videoSender);
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

    return { peers, peerNames, localStream: localStream.current, screenStream, toggleScreenShare, isCameraOn, toggleCamera };
}
