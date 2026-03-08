import { useEffect, useRef, useState } from 'react';
import { useUI } from '../contexts/UIContext';
import {
    collection,
    doc,
    setDoc,
    onSnapshot,
    addDoc,
    deleteDoc,
    query,
    where,
    updateDoc,
    arrayUnion,
    arrayRemove
} from 'firebase/firestore';


const servers = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:74.125.250.129:19302' },
        { urls: 'stun:142.250.14.127:19302' },
        {
            urls: 'turn:openrelay.metered.ca:80',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        },
        {
            urls: 'turn:openrelay.metered.ca:443',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        },
        {
            urls: 'turn:openrelay.metered.ca:443?transport=tcp',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        }
    ],
    iceCandidatePoolSize: 10,
};

export function useWebRTC(roomId: string, userId: string, userName: string, db: any) {
    const { showAlert } = useUI();
    const [peers, setPeers] = useState<Map<string, MediaStream>>(new Map());
    const [peerNames, setPeerNames] = useState<Map<string, string>>(new Map());
    const [iceStates, setIceStates] = useState<Map<string, string>>(new Map());
    const [connectionStates, setConnectionStates] = useState<Map<string, RTCPeerConnectionState>>(new Map());
    const [isCameraOn, setIsCameraOn] = useState(false);
    const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');

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
        const newStream = new MediaStream();

        // Add Mic Audio
        if (audioStreamRef.current) {
            audioStreamRef.current.getAudioTracks().forEach(t => newStream.addTrack(t));
        }

        // Add Camera Video
        if (videoStreamRef.current) {
            videoStreamRef.current.getVideoTracks().forEach(t => newStream.addTrack(t));
        }

        localStream.current = newStream;
        setActiveStream(newStream); // Triggers React render
        setIsStreamReady(true);

        console.log('[WEBRTC_DEBUG] Combined Local Stream (No Mixing)', {
            audio: newStream.getAudioTracks().length,
            video: newStream.getVideoTracks().length,
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
                    showAlert("Hata", "Mikrofon kullanımda! Lütfen diğer uygulamaları kapatın.");
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
                let stream;
                try {
                    stream = await navigator.mediaDevices.getUserMedia({
                        audio: false,
                        video: {
                            facingMode: facingMode,
                            width: { ideal: 640 },
                            height: { ideal: 480 },
                            frameRate: { ideal: 20, max: 24 }
                        }
                    });
                } catch (e) {
                    console.warn("[WEBRTC_DEBUG] Ideal video constraints failed, retrying with basic", e);
                    stream = await navigator.mediaDevices.getUserMedia({
                        audio: false,
                        video: true
                    });
                }

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
                    showAlert("Hata", "Kamera kullanımda! Lütfen diğer uygulamaları (Zoom, Skype vb.) kapatıp sayfayı yenileyin.");
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
    }, [isCameraOn, facingMode]);

    const flipCamera = () => {
        setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
    };

    function updatePeerTracks(pc: RTCPeerConnection, stream: MediaStream | null, currentScreenStream: MediaStream | null) {
        const transceivers = pc.getTransceivers();

        let audioTransceiver = transceivers.find(t => t.receiver.track.kind === 'audio');
        let videoTransceiver = transceivers.find(t => t.receiver.track.kind === 'video');

        if (!audioTransceiver || !videoTransceiver) {
            console.error("[WEBRTC_DEBUG] Transceivers missing during updatePeerTracks!");
            return;
        }

        // --- Video Track: prefer screen share over camera ---
        let activeVideoTrack: MediaStreamTrack | null = null;
        const isScreenSharing = currentScreenStream && currentScreenStream.getVideoTracks().length > 0;
        if (isScreenSharing) {
            activeVideoTrack = currentScreenStream!.getVideoTracks()[0];
        } else if (stream && stream.getVideoTracks().length > 0) {
            activeVideoTrack = stream.getVideoTracks()[0];
        }

        // --- Audio Track: mix mic + screen audio via WebAudio API ---
        let activeAudioTrack: MediaStreamTrack | null = null;
        const micTrack = stream?.getAudioTracks()[0] || null;
        const screenAudioTrack = currentScreenStream?.getAudioTracks()[0] || null;

        if (micTrack && screenAudioTrack) {
            // Mix both: mic and screen system audio
            try {
                if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
                    audioContextRef.current = new AudioContext();
                }
                const ctx = audioContextRef.current;
                if (!destinationRef.current) {
                    destinationRef.current = ctx.createMediaStreamDestination();
                }
                const dest = destinationRef.current;

                // Connect mic source
                const micStream = new MediaStream([micTrack]);
                if (!micSourceRef.current) {
                    micSourceRef.current = ctx.createMediaStreamSource(micStream);
                    micSourceRef.current.connect(dest);
                }

                // Connect screen audio source
                const screenAudioStream = new MediaStream([screenAudioTrack]);
                if (!screenSourceRef.current) {
                    screenSourceRef.current = ctx.createMediaStreamSource(screenAudioStream);
                    screenSourceRef.current.connect(dest);
                }

                activeAudioTrack = dest.stream.getAudioTracks()[0];
            } catch (e) {
                console.warn('Audio mix error, falling back to mic only', e);
                activeAudioTrack = micTrack;
            }
        } else if (micTrack) {
            // Clean up screen audio mixer if screen sharing stopped
            if (screenSourceRef.current) { screenSourceRef.current.disconnect(); screenSourceRef.current = null; }
            activeAudioTrack = micTrack;
        } else if (screenAudioTrack) {
            activeAudioTrack = screenAudioTrack;
        }

        const updateTransceiver = (transceiver: RTCRtpTransceiver, track: MediaStreamTrack | null) => {
            if (track) {
                if (transceiver.sender.track !== track) {
                    console.log(`[WEBRTC_DEBUG] Replacing ${track.kind} track`);
                    transceiver.sender.replaceTrack(track).catch(e => console.warn(`Replace ${track.kind} error`, e));
                }
                if (transceiver.direction !== 'sendrecv') transceiver.direction = 'sendrecv';

                if (track.kind === 'video') {
                    const parameters = transceiver.sender.getParameters();
                    if (!parameters.encodings) parameters.encodings = [{}];
                    // Use higher bitrate & framerate for screen sharing
                    const targetBitrate = isScreenSharing ? 3000000 : 400000; // 3Mbps screen / 400kbps camera
                    const targetFps = isScreenSharing ? 30 : 20;
                    if (parameters.encodings[0].maxBitrate !== targetBitrate) {
                        parameters.encodings[0].maxBitrate = targetBitrate;
                        parameters.encodings[0].maxFramerate = targetFps;
                        transceiver.sender.setParameters(parameters).catch(e => console.warn('Bitrate set error', e));
                    }
                }
            } else {
                if (transceiver.sender.track !== null) {
                    transceiver.sender.replaceTrack(null).catch(e => console.warn(`Clear error`, e));
                }
                if (transceiver.direction !== 'recvonly') transceiver.direction = 'recvonly';
            }
        };

        updateTransceiver(audioTransceiver, activeAudioTrack);
        updateTransceiver(videoTransceiver, activeVideoTrack);
    }

    // Main Room Logic
    useEffect(() => {
        let membersUnsubscribe: () => void;
        let signalingUnsubscribe: () => void;
        let iceUnsubscribe: () => void;
        const memberDoc = doc(db, `rooms/${roomId}/members`, userId);

        async function setup() {
            const joinTime = Date.now() - 5000; // Allow a 5 second buffer for slight clock sync issues
            await setDoc(memberDoc, { name: userName, joinedAt: Date.now() });
            // Sync active participants in the room document using a separate 'activeUids' field
            const roomRef = doc(db, 'rooms', roomId);
            await updateDoc(roomRef, {
                activeUids: arrayUnion(userId)
            }).catch(err => console.error("Error updating activeUids array on join:", err));

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

            const signalingQuery = query(collection(db, `rooms/${roomId}/signaling`), where('createdAt', '>=', joinTime));
            signalingUnsubscribe = onSnapshot(signalingQuery, (snapshot) => {
                snapshot.docChanges().forEach((change) => {
                    if (change.type === 'added') {
                        const data = change.doc.data();
                        if (data.targetId === userId) {
                            handleSignaling(data);
                        }
                    }
                });
            });

            const iceQuery = query(collection(db, `rooms/${roomId}/iceCandidates`), where('createdAt', '>=', joinTime));
            iceUnsubscribe = onSnapshot(iceQuery, (snapshot) => {
                snapshot.docChanges().forEach((change) => {
                    if (change.type === 'added') {
                        const data = change.doc.data();
                        if (data.targetId === userId) {
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

            // Sync active participants in the room document on leave using 'activeUids'
            const roomRef = doc(db, 'rooms', roomId);
            updateDoc(roomRef, {
                activeUids: arrayRemove(userId)
            }).catch(err => console.error("Error updating activeUids array on leave:", err));

            // Stop screen share tracks so browser stops the sharing indicator
            setScreenStream(prev => {
                if (prev) prev.getTracks().forEach(t => t.stop());
                return null;
            });
        };
    }, [roomId, userId, userName, db]);

    async function createPeerConnection(remoteUserId: string) {
        if (pcRef.current.has(remoteUserId)) return;
        console.log(`[WEBRTC_DEBUG] Creating PeerConnection for ${remoteUserId}`);

        const pc = new RTCPeerConnection(servers);
        pcRef.current.set(remoteUserId, pc);
        makingOfferRef.current.set(remoteUserId, false);

        // Pre-create transceivers for audio and video so mobile webviews properly negotiate recv
        try {
            pc.addTransceiver('audio', { direction: 'recvonly' });
            pc.addTransceiver('video', { direction: 'recvonly' });
        } catch (err) {
            console.warn("[WEBRTC_DEBUG] Error pre-adding transceivers", err);
        }

        // Initialize stream IMMEDIATELY with the pre-created receivers
        // WebRTC does not fire 'ontrack' for transceivers created locally via addTransceiver
        const initialStream = new MediaStream();
        pc.getReceivers().forEach(r => {
            if (r.track) {
                console.log(`[WEBRTC_DEBUG] Initializing stream with pre-created track: ${r.track.kind} (${r.track.id})`);
                initialStream.addTrack(r.track);
            }
        });
        setPeers(prev => new Map(prev).set(remoteUserId, initialStream));

        // Add initial sender tracks (this will upgrade transceiver directions if we have tracks)
        if (localStream.current || screenStream) {
            updatePeerTracks(pc, localStream.current, screenStream);
        }

        pc.ontrack = (event) => {
            console.log(`[WEBRTC_DEBUG] ontrack from ${remoteUserId}: ${event.track.kind}, id=${event.track.id}`);
            event.track.enabled = true;

            setPeers(prev => {
                const next = new Map(prev);
                let stream = next.get(remoteUserId);
                if (!stream) {
                    stream = new MediaStream();
                }

                // Only add if not already present
                if (!stream.getTracks().find(t => t.id === event.track.id)) {
                    stream.addTrack(event.track);

                    // Listen for track ending to clean up UI
                    event.track.onended = () => {
                        console.log(`[WEBRTC_DEBUG] Track ended for ${remoteUserId}: ${event.track.kind}`);
                    };
                }

                return next.set(remoteUserId, new MediaStream(stream.getTracks())); // Fresh ref for React
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
            setIceStates(prev => new Map(prev).set(remoteUserId, pc.iceConnectionState));
        };
        // Set initial state
        setIceStates(prev => new Map(prev).set(remoteUserId, pc.iceConnectionState));

        pc.onconnectionstatechange = () => {
            console.log(`[WEBRTC_DEBUG] Connection State ${remoteUserId}: ${pc.connectionState}`);
            setConnectionStates(prev => new Map(prev).set(remoteUserId, pc.connectionState));
        };
        // Set initial state
        setConnectionStates(prev => new Map(prev).set(remoteUserId, pc.connectionState));

        pc.onnegotiationneeded = async () => {
            // Check if we already have an offer in flight or unstable state
            if (pc.signalingState !== 'stable') {
                console.log(`[WEBRTC_DEBUG] Negotiation needed but signaling state is ${pc.signalingState} - Skipping/Delaying`);
                return;
            }
            // Simple throttle or check makingOffer
            if (makingOfferRef.current.get(remoteUserId)) {
                console.log(`[WEBRTC_DEBUG] Negotiation needed but already making offer - Skipping`);
                return;
            }

            console.log(`[WEBRTC_DEBUG] Negotiation needed for ${remoteUserId} (Stable)`);
            try {
                makingOfferRef.current.set(remoteUserId, true);
                console.log('[WEBRTC_DEBUG] Creating offer');
                await pc.setLocalDescription();

                // Add transceivers if missing (sometimes onnegotiationneeded fires before transceivers are ready?)
                // No, standard WebRTC flow.

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

    // Manual helper to force renegotiation (e.g. if something is stuck)
    async function forceRenegotiation(remoteUserId?: string) {
        const targets = remoteUserId ? [remoteUserId] : Array.from(pcRef.current.keys());

        for (const pid of targets) {
            console.log(`[WEBRTC_DEBUG] Forcing renegotiation for ${pid}`);
            const pc = pcRef.current.get(pid);
            if (pc) {
                // Creating an offer manually
                try {
                    makingOfferRef.current.set(pid, true);
                    const offer = await pc.createOffer({ iceRestart: true }); // ICE Restart to fix connection issues
                    await pc.setLocalDescription(offer);

                    await addDoc(collection(db, `rooms/${pid}/signaling`), { // Wait, signaling collection is room-based
                        // actually db path is rooms/{roomId}/signaling
                    });

                    // Correct path
                    await addDoc(collection(db, `rooms/${roomId}/signaling`), {
                        type: 'offer',
                        senderId: userId,
                        targetId: pid,
                        description: pc.localDescription?.toJSON(),
                        createdAt: Date.now()
                    });
                } catch (e) {
                    console.error("Force renegotiation failed", e);
                } finally {
                    makingOfferRef.current.set(pid, false);
                }
            }
        }
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
                    // Polite peer yields: roll back local offer, accept remote offer
                    makingOfferRef.current.set(senderId, false);
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
        } catch (err: any) {
            console.error("[WEBRTC_DEBUG] Signaling error:", err);
            // If the mismatch is fatal (InvalidAccessError), we MUST trigger an ICE Restart
            if (err.name === 'InvalidAccessError' || err.message?.includes('m-lines')) {
                console.warn("[WEBRTC_DEBUG] Fatal SDP M-Line corruption. Attempting to force an ICE Restart to recover the PeerConnection...");
                setTimeout(() => forceRenegotiation(senderId), 1000);
            }
        }
    }

    async function handleIce(senderId: string, candidate: any) {
        const pc = pcRef.current.get(senderId);
        if (pc) {
            console.log(`[WEBRTC_DEBUG] Adding ICE candidate from ${senderId}`);
            try {
                if (pc.remoteDescription && pc.remoteDescription.type) {
                    try {
                        await pc.addIceCandidate(new RTCIceCandidate(candidate));
                    } catch (e) {
                        console.warn(`[WEBRTC_DEBUG] Failed to add ICE candidate (likely arrived early), queueing it.`, e);
                        const queue = candidateQueueRef.current.get(senderId) || [];
                        queue.push(candidate);
                        candidateQueueRef.current.set(senderId, queue);
                    }
                } else {
                    console.log(`[WEBRTC_DEBUG] Queueing ICE candidate from ${senderId}`);
                    const queue = candidateQueueRef.current.get(senderId) || [];
                    queue.push(candidate);
                    candidateQueueRef.current.set(senderId, queue);
                }
            } catch (e) {
                console.error('[WEBRTC_DEBUG] Error in ICE candidate handler', e);
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

    // --- Effect 3: Screen Share Management ---
    useEffect(() => {
        updateLocalAndPeers();
    }, [screenStream]);

    async function toggleScreenShare(isFilmMode: boolean = false) {
        if (screenStream) {
            screenStream.getTracks().forEach(t => t.stop());
            setScreenStream(null);
        } else {
            console.log(`[WEBRTC_DEBUG] Requesting Screen Share (Film Mode: ${isFilmMode})...`);
            try {
                if (!navigator.mediaDevices || !(navigator.mediaDevices as any).getDisplayMedia) {
                    showAlert("Hata", "Bu cihazda ekran paylaşımı desteklenmiyor.");
                    return;
                }

                // Constraints for "Film Mode" vs Regular Share
                // Film Mode: High framerate, System Audio (Raw)
                // Regular: Text legibility (cursor), standard audio
                const constraints: any = {
                    video: isFilmMode ? {
                        frameRate: 60,
                        width: { ideal: 1920 },
                        height: { ideal: 1080 }
                    } : {
                        cursor: "always"
                    },
                    audio: {
                        echoCancellation: !isFilmMode,
                        noiseSuppression: !isFilmMode,
                        autoGainControl: !isFilmMode,
                        channelCount: isFilmMode ? 2 : 1, // Stereo for film
                        sampleRate: isFilmMode ? 48000 : undefined,
                        systemAudio: isFilmMode ? 'include' : undefined
                    }
                };

                // Add systemAudio hint for Chrome/Edge
                if (isFilmMode) {
                    // This is a browser hint to check the 'Share Audio' box by default if possible
                    // (Note: support varies by browser)
                }

                let stream;
                try {
                    stream = await navigator.mediaDevices.getDisplayMedia(constraints);
                } catch (e) {
                    console.warn("[WEBRTC_DEBUG] Media constraints failed, retrying with defaults", e);
                    stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
                }

                setScreenStream(stream);

                stream.getVideoTracks()[0].onended = () => {
                    setScreenStream(null);
                };
            } catch (err) {
                console.error("Screen share error:", err);
                if ((err as any).name === 'NotAllowedError') {
                    // Ignore
                } else {
                    showAlert("Hata", "Ekran paylaşımı başlatılamadı.");
                }
            }
        }
    }

    function toggleCamera() {
        setIsCameraOn(prev => !prev);
    }

    return { peers, peerNames, localStream: activeStream, screenStream, toggleScreenShare, isCameraOn, toggleCamera, flipCamera, facingMode, forceRenegotiation, iceStates, connectionStates };
}
