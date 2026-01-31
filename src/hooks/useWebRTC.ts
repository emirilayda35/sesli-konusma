import { useEffect, useRef, useState } from 'react';
import {
    collection,
    doc,
    setDoc,
    onSnapshot,
    addDoc,
    deleteDoc,
} from 'firebase/firestore';

const servers = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
    ],
    iceCandidatePoolSize: 10,
};

export function useWebRTC(roomId: string, userId: string, userName: string, db: any) {
    const [peers, setPeers] = useState<Map<string, MediaStream>>(new Map());
    const [peerNames, setPeerNames] = useState<Map<string, string>>(new Map());
    const [isCameraOn, setIsCameraOn] = useState(false);

    // UI Refs
    const localStream = useRef<MediaStream | null>(null);
    const [activeStream, setActiveStream] = useState<MediaStream | null>(null);

    // Internal Refs for separation
    const audioStreamRef = useRef<MediaStream | null>(null);
    const videoStreamRef = useRef<MediaStream | null>(null);

    const pcRef = useRef<Map<string, RTCPeerConnection>>(new Map());
    const makingOfferRef = useRef<Map<string, boolean>>(new Map());
    const candidateQueueRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
    const [mountedAt] = useState(Date.now());
    const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
    const [isStreamReady, setIsStreamReady] = useState(false);
    const mixedAudioStreamRef = useRef<MediaStream | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const destinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
    const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const screenSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

    // --- Helper: Combine Streams & Update Peers ---
    const updateLocalAndPeers = async () => {
        // --- Audio Mixing Logic ---
        if (!audioContextRef.current) {
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
            destinationRef.current = audioContextRef.current.createMediaStreamDestination();
        }

        const ctx = audioContextRef.current;
        const dest = destinationRef.current!;

        // Clean up previous sources if they changed
        if (micSourceRef.current) {
            micSourceRef.current.disconnect();
            micSourceRef.current = null;
        }
        if (screenSourceRef.current) {
            screenSourceRef.current.disconnect();
            screenSourceRef.current = null;
        }

        // Connect Microphone
        if (audioStreamRef.current && audioStreamRef.current.getAudioTracks().length > 0) {
            try {
                micSourceRef.current = ctx.createMediaStreamSource(audioStreamRef.current);
                micSourceRef.current.connect(dest);
            } catch (e) { console.error("Mic mix error", e); }
        }

        // Connect Screen Audio
        if (screenStream && screenStream.getAudioTracks().length > 0) {
            try {
                screenSourceRef.current = ctx.createMediaStreamSource(screenStream);
                screenSourceRef.current.connect(dest);
            } catch (e) { console.error("Screen audio mix error", e); }
        }

        mixedAudioStreamRef.current = dest.stream;

        const newStream = new MediaStream();
        if (mixedAudioStreamRef.current) {
            mixedAudioStreamRef.current.getAudioTracks().forEach(t => newStream.addTrack(t));
        }
        if (videoStreamRef.current) {
            videoStreamRef.current.getTracks().forEach(t => newStream.addTrack(t));
        }

        localStream.current = newStream;
        setActiveStream(newStream); // Triggers React render
        setIsStreamReady(true);

        console.log('[WEBRTC_DEBUG] Combined Local Stream', {
            audio: newStream.getAudioTracks().length,
            video: newStream.getVideoTracks().length,
            mixed: !!mixedAudioStreamRef.current
        });

        // Update all connected peers
        pcRef.current.forEach(pc => {
            updatePeerTracks(pc, newStream, screenStream);
        });
    };

    // --- Effect 1: Audio Management ---
    useEffect(() => {
        let mounted = true;

        async function setupAudio() {
            // Stop existing audio tracks if any (e.g. settings change)
            if (audioStreamRef.current) {
                audioStreamRef.current.getTracks().forEach(t => t.stop());
                audioStreamRef.current = null;
            }

            try {
                const inputId = localStorage.getItem('voice_inputId') || 'default';
                const echo = localStorage.getItem('voice_echoCancellation') !== 'false';
                const noise = localStorage.getItem('voice_noiseSuppression') !== 'false';

                console.log('[WEBRTC_DEBUG] Setting up Audio...');
                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        deviceId: inputId !== 'default' ? { exact: inputId } : undefined,
                        echoCancellation: echo,
                        noiseSuppression: noise,
                        autoGainControl: true
                    },
                    video: false // STRICTLY AUDIO
                });

                if (!mounted) {
                    stream.getTracks().forEach(t => t.stop());
                    return;
                }

                console.log('[WEBRTC_DEBUG] Audio Stream Acquired', stream.id);
                audioStreamRef.current = stream;
                updateLocalAndPeers();

            } catch (err: any) {
                console.error("[WEBRTC_DEBUG] Error getting audio:", err);
                if (err.name === 'NotReadableError') {
                    alert("Mikrofon kullanımda! Lütfen diğer uygulamaları kapatın.");
                }
            }
        }

        const handleSettingsUpdate = (e: any) => {
            if (['inputId', 'echoCancellation', 'noiseSuppression'].includes(e.detail.key)) {
                setupAudio();
            }
        };

        window.addEventListener('voice_settings_updated', handleSettingsUpdate);
        setupAudio();

        return () => {
            mounted = false;
            window.removeEventListener('voice_settings_updated', handleSettingsUpdate);
            if (audioStreamRef.current) {
                audioStreamRef.current.getTracks().forEach(t => t.stop());
            }
        };
    }, []); // Run once + on custom event

    // --- Effect 2: Video Management ---
    useEffect(() => {
        let mounted = true;

        async function setupVideo() {
            if (!isCameraOn) {
                // Camera OFF logic
                if (videoStreamRef.current) {
                    console.log('[WEBRTC_DEBUG] Stopping Camera');
                    videoStreamRef.current.getTracks().forEach(t => t.stop());
                    videoStreamRef.current = null;
                    updateLocalAndPeers();
                }
                return;
            }

            // Camera ON logic
            console.log('[WEBRTC_DEBUG] Starting Camera...');

            // Wait for hardware release (prevents Device in use errors)
            await new Promise(r => setTimeout(r, 250));

            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: false, // STRICTLY VIDEO
                    video: {
                        width: { ideal: 1280 },
                        height: { ideal: 720 },
                        frameRate: { ideal: 30 }
                    }
                });

                if (!mounted) {
                    stream.getTracks().forEach(t => t.stop());
                    return;
                }

                console.log('[WEBRTC_DEBUG] Video Stream Acquired', stream.id);
                videoStreamRef.current = stream;
                updateLocalAndPeers();

            } catch (err: any) {
                console.error("[WEBRTC_DEBUG] Error getting video:", err);
                setIsCameraOn(false); // Reset UI state
                if (err.name === 'NotReadableError' || err.message?.includes('Device in use')) {
                    alert("Kamera kullanımda! Lütfen diğer uygulamaları (Zoom, Skype vb.) kapatıp sayfayı yenileyin.");
                }
            }
        }

        setupVideo();

        return () => {
            mounted = false;
            if (videoStreamRef.current) {
                videoStreamRef.current.getTracks().forEach(t => t.stop());
            }
        };
    }, [isCameraOn]);

    // Helper to add/replace tracks strictly
    function updatePeerTracks(pc: RTCPeerConnection, stream: MediaStream | null, currentScreenStream: MediaStream | null) {
        const senders = pc.getSenders();

        // Priority: Screen Share Video > Camera Video
        let activeVideoTrack: MediaStreamTrack | null = null;
        if (currentScreenStream && currentScreenStream.getVideoTracks().length > 0) {
            activeVideoTrack = currentScreenStream.getVideoTracks()[0];
        } else if (stream && stream.getVideoTracks().length > 0) {
            activeVideoTrack = stream.getVideoTracks()[0];
        }

        // Active Audio Track (Always mixed if localStream is updated via updateLocalAndPeers)
        let activeAudioTrack: MediaStreamTrack | null = null;
        if (stream && stream.getAudioTracks().length > 0) {
            activeAudioTrack = stream.getAudioTracks()[0];
        }

        const videoSender = senders.find(s => s.track?.kind === 'video' || s.track === null);
        const audioSender = senders.find(s => s.track?.kind === 'audio' || s.track === null);

        // Update Video
        if (activeVideoTrack) {
            if (videoSender) {
                if (videoSender.track?.id !== activeVideoTrack.id) {
                    videoSender.replaceTrack(activeVideoTrack).catch(e => console.warn("Video replace fail", e));
                }
            } else {
                pc.addTrack(activeVideoTrack, currentScreenStream || stream!);
            }
        } else if (videoSender) {
            videoSender.replaceTrack(null).catch(e => console.warn("Video clear fail", e));
        }

        // Update Audio
        if (activeAudioTrack) {
            if (audioSender) {
                if (audioSender.track?.id !== activeAudioTrack.id) {
                    audioSender.replaceTrack(activeAudioTrack).catch(e => console.warn("Audio replace fail", e));
                }
            } else {
                pc.addTrack(activeAudioTrack, stream!);
            }
        } else if (audioSender) {
            audioSender.replaceTrack(null).catch(e => console.warn("Audio clear fail", e));
        }
    }

    // Main Room Logic
    useEffect(() => {
        let membersUnsubscribe: () => void;
        let signalingUnsubscribe: () => void;
        let iceUnsubscribe: () => void;
        const memberDoc = doc(db, `rooms/${roomId}/members`, userId);

        async function setup() {
            await setDoc(memberDoc, { name: userName, joinedAt: Date.now() });

            membersUnsubscribe = onSnapshot(collection(db, `rooms/${roomId}/members`), (snapshot) => {
                snapshot.docChanges().forEach((change) => {
                    const data = change.doc.data();
                    const remoteUserId = change.doc.id;

                    if (change.type === 'added' || change.type === 'modified') {
                        if (remoteUserId !== userId) {
                            setPeerNames(prev => new Map(prev).set(remoteUserId, data.name));
                            if (change.type === 'added') {
                                if (!pcRef.current.has(remoteUserId)) {
                                    createPeerConnection(remoteUserId);
                                }
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

            signalingUnsubscribe = onSnapshot(collection(db, `rooms/${roomId}/signaling`), (snapshot) => {
                snapshot.docChanges().forEach((change) => {
                    if (change.type === 'added') {
                        const data = change.doc.data();
                        if (data.targetId === userId && data.createdAt > mountedAt) {
                            handleSignaling(data);
                        }
                    }
                });
            });

            iceUnsubscribe = onSnapshot(collection(db, `rooms/${roomId}/iceCandidates`), (snapshot) => {
                snapshot.docChanges().forEach((change) => {
                    if (change.type === 'added') {
                        const data = change.doc.data();
                        if (data.targetId === userId && data.createdAt > mountedAt) {
                            handleIce(data.senderId, data.candidate);
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
        console.log(`[WEBRTC_DEBUG] Creating PeerConnection for ${remoteUserId}`);

        const pc = new RTCPeerConnection(servers);
        pcRef.current.set(remoteUserId, pc);
        makingOfferRef.current.set(remoteUserId, false);

        // Add initial tracks
        if (localStream.current || screenStream) {
            updatePeerTracks(pc, localStream.current, screenStream);
        }

        pc.ontrack = (event) => {
            console.log(`[WEBRTC_DEBUG] ontrack from ${remoteUserId}: ${event.track.kind}, enabled=${event.track.enabled}`);
            event.track.enabled = true;

            const newStream = new MediaStream();
            setPeers(prev => {
                const next = new Map(prev);
                const existingStream = next.get(remoteUserId);
                if (existingStream) {
                    existingStream.getTracks().forEach(t => {
                        if (t.id !== event.track.id) newStream.addTrack(t);
                    });
                }
                newStream.addTrack(event.track);
                return next.set(remoteUserId, newStream);
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

        pc.oniceconnectionstatechange = () => {
            console.log(`[WEBRTC_DEBUG] ICE State ${remoteUserId}: ${pc.iceConnectionState}`);
        };

        pc.onconnectionstatechange = () => {
            console.log(`[WEBRTC_DEBUG] Connection State ${remoteUserId}: ${pc.connectionState}`);
        };

        pc.onnegotiationneeded = async () => {
            console.log(`[WEBRTC_DEBUG] Negotiation needed for ${remoteUserId}`);
            try {
                makingOfferRef.current.set(remoteUserId, true);
                console.log('[WEBRTC_DEBUG] Creating offer');
                await pc.setLocalDescription();
                await addDoc(collection(db, `rooms/${roomId}/signaling`), {
                    type: 'offer',
                    senderId: userId,
                    targetId: remoteUserId,
                    description: pc.localDescription?.toJSON(),
                    createdAt: Date.now()
                });
            } catch (err) {
                console.error("[WEBRTC_DEBUG] Negotiation error:", err);
            } finally {
                makingOfferRef.current.set(remoteUserId, false);
            }
        };
    }

    async function handleSignaling(data: any) {
        const { senderId, type, description, sdp } = data;
        let pc = pcRef.current.get(senderId);

        if (!pc) {
            await createPeerConnection(senderId);
            pc = pcRef.current.get(senderId);
        }
        if (!pc) return;

        console.log(`[WEBRTC_DEBUG] Received Signal ${type} from ${senderId}`);

        const isPolite = userId > senderId;
        const makingOffer = makingOfferRef.current.get(senderId) || false;
        const offerCollision = type === 'offer' && (makingOffer || pc.signalingState !== 'stable');
        const ignoreOffer = !isPolite && offerCollision;

        if (ignoreOffer) {
            console.log(`[WEBRTC_DEBUG] Ignoring offer conflict with ${senderId}`);
            return;
        }

        try {
            if (type === 'offer') {
                const offerDescription = description || new RTCSessionDescription({ type: 'offer', sdp });

                if (offerCollision && isPolite) {
                    await Promise.all([
                        pc.setLocalDescription({ type: 'rollback' }),
                        pc.setRemoteDescription(offerDescription)
                    ]);
                } else {
                    await pc.setRemoteDescription(offerDescription);
                }

                console.log('[WEBRTC_DEBUG] Creating answer');
                await pc.setLocalDescription();
                await addDoc(collection(db, `rooms/${roomId}/signaling`), {
                    type: 'answer',
                    senderId: userId,
                    targetId: senderId,
                    description: pc.localDescription?.toJSON(),
                    createdAt: Date.now()
                });
            } else if (type === 'answer') {
                if (pc.signalingState === 'stable') {
                    console.warn(`[WEBRTC_DEBUG] Signaling state already stable, ignoring answer from ${senderId}`);
                    return;
                }
                await pc.setRemoteDescription(description || new RTCSessionDescription({ type: 'answer', sdp }));
            }

            const candidates = candidateQueueRef.current.get(senderId);
            if (candidates) {
                console.log(`[WEBRTC_DEBUG] Flushing ${candidates.length} queued candidates for ${senderId}`);
                for (const candidate of candidates) {
                    await pc.addIceCandidate(new RTCIceCandidate(candidate));
                }
                candidateQueueRef.current.delete(senderId);
            }
        } catch (err) {
            console.error("[WEBRTC_DEBUG] Signaling error:", err);
        }
    }

    async function handleIce(senderId: string, candidate: any) {
        const pc = pcRef.current.get(senderId);
        if (pc) {
            console.log(`[WEBRTC_DEBUG] Adding ICE candidate from ${senderId}`);
            try {
                if (pc.remoteDescription && pc.remoteDescription.type) {
                    await pc.addIceCandidate(new RTCIceCandidate(candidate));
                } else {
                    console.log(`[WEBRTC_DEBUG] Queueing ICE candidate from ${senderId}`);
                    const queue = candidateQueueRef.current.get(senderId) || [];
                    queue.push(candidate);
                    candidateQueueRef.current.set(senderId, queue);
                }
            } catch (e) {
                console.error('[WEBRTC_DEBUG] Error adding ice candidate', e);
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

    async function toggleScreenShare() {
        if (screenStream) {
            screenStream.getTracks().forEach(t => t.stop());
            setScreenStream(null);
            updateLocalAndPeers(); // Trigger remix and update
        } else {
            console.log("[WEBRTC_DEBUG] Requesting Screen Share...");
            try {
                const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

                // Constraints for screen share
                const constraints: any = {
                    video: {
                        cursor: "always",
                        displaySurface: "monitor"
                    },
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        sampleRate: 44100
                    }
                };

                // Mobile fallback: simplified constraints
                let stream;
                try {
                    stream = await navigator.mediaDevices.getDisplayMedia(constraints);
                } catch (firstErr) {
                    console.warn("[WEBRTC_DEBUG] Screen share first attempt failed, trying simple constraints", firstErr);
                    stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: !isMobile });
                }

                setScreenStream(stream);
                updateLocalAndPeers(); // This will mix audio and update peers

                stream.getVideoTracks()[0].onended = () => {
                    setScreenStream(null);
                    updateLocalAndPeers();
                };
            } catch (err) {
                console.error("Screen share error:", err);
                if ((err as any).name === 'NotAllowedError') {
                    // Ignore, user cancelled
                } else {
                    alert("Ekran paylaşımı başlatılamadı. Lütfen tarayıcı izinlerini kontrol edin.");
                }
            }
        }
    }

    function toggleCamera() {
        setIsCameraOn(prev => !prev);
    }

    return { peers, peerNames, localStream: activeStream, screenStream, toggleScreenShare, isCameraOn, toggleCamera };
}
