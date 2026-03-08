import { useState, useEffect, useRef } from 'react';
import { FaMicrophone, FaMicrophoneSlash, FaBolt, FaDesktop, FaVideo, FaVideoSlash, FaChevronLeft, FaUserPlus, FaSignOutAlt, FaSync, FaTimes, FaLink, FaShareSquare, FaComment, FaVolumeMute, FaHeadphones, FaCog, FaPhoneSlash } from 'react-icons/fa';
import { AnimatePresence, motion } from 'framer-motion';
import { useUI } from '../contexts/UIContext';
import { useAuth } from '../contexts/AuthContext';
import { useWebRTC } from '../hooks/useWebRTC';
import { useSound } from '../contexts/SoundContext';
import { useLanguage } from '../contexts/LanguageContext';
import { collection, onSnapshot, doc, deleteDoc, getDocs, query, orderBy, limit, addDoc, serverTimestamp, where } from 'firebase/firestore';
import ChatPanel from './Chat/ChatPanel';
import ChatOverlay from './Chat/ChatOverlay';
import MessageBarrage from './Chat/MessageBarrage';
// BrowserView removed

// ... (Existing interfaces)

// ... (Existing RemoteAudio and RemoteParticipant components until VoiceRoom)

// VoiceRoom export moved to bottom


interface VoiceRoomProps {
    roomId: string;
    onBack?: () => void;
}

interface RemoteParticipantProps {
    peerId: string;
    stream: MediaStream | undefined;
    name: string;
    isGameMode: boolean;
    globalSensitivity: number;
    isDeafened: boolean;
    db: any;
    onFullscreen?: () => void;
    isMaximized?: boolean;
    onMaximize?: () => void;
    roomId?: string;
    iceState?: string;
    connectionState?: RTCPeerConnectionState; // Added connectionState
}

function RemoteAudio({ track, volume, isDeafened, isDucking }: { track: MediaStreamTrack, volume: number, isDeafened: boolean, isDucking?: boolean }) {
    const audioRef = useRef<HTMLAudioElement>(null);
    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.srcObject = new MediaStream([track]);
            const finalVolume = isDeafened ? 0 : (isDucking ? (volume / 100) * 0.3 : (volume / 100));
            audioRef.current.volume = finalVolume;
        }
    }, [track, volume, isDeafened, isDucking]);
    return <audio ref={audioRef} autoPlay />;
}

function RemoteParticipant({ peerId, stream, name, isGameMode, globalSensitivity, isDeafened, db, onMaximize, onFullscreen, isMaximized, roomId, iceState, connectionState }: RemoteParticipantProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const screenRef = useRef<HTMLVideoElement>(null);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [displayName, setDisplayName] = useState(name);
    const [photoURL, setPhotoURL] = useState<string | null>(null);
    const [volume, setVolume] = useState(parseInt(localStorage.getItem('voice_outputVolume') || '100'));
    const { t } = useLanguage();

    // Track State
    const [cameraTrack, setCameraTrack] = useState<MediaStreamTrack | null>(null);
    const [screenTrack, setScreenTrack] = useState<MediaStreamTrack | null>(null);

    // Initial Play
    useEffect(() => {
        if (screenRef.current && screenTrack) screenRef.current.play().catch(e => console.log("Screen Play failed", e));
        if (videoRef.current && cameraTrack) videoRef.current.play().catch(e => console.log("Cam Play failed", e));
    }, [screenTrack, cameraTrack]);

    useEffect(() => {
        const handleSettingsUpdate = (e: any) => {
            if (e.detail.key === 'outputVolume') {
                setVolume(parseInt(e.detail.value));
            }
        };
        window.addEventListener('voice_settings_updated', handleSettingsUpdate);
        return () => window.removeEventListener('voice_settings_updated', handleSettingsUpdate);
    }, []);

    useEffect(() => {
        const unsub = onSnapshot(doc(db, 'users', peerId), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setPhotoURL(data.photoURL);
                if (data.displayName) setDisplayName(data.displayName);
            }
        });
        return () => unsub();
    }, [peerId]);

    // Track Analysis
    useEffect(() => {
        if (!stream) {
            setCameraTrack(null);
            setScreenTrack(null);
            return;
        }

        const updateTracks = () => {
            // Filter out tracks that are muted (camera/screen turned off via replaceTrack(null))
            const videoTracks = stream.getVideoTracks().filter(t => !t.muted && t.enabled && t.readyState !== 'ended');
            let cam: MediaStreamTrack | null = null;
            let scr: MediaStreamTrack | null = null;

            if (videoTracks.length === 0) {
                cam = null; scr = null;
            } else if (videoTracks.length === 1) {
                // Heuristic: Check settings or assume camera if no blatant screen markers
                const t = videoTracks[0];
                const settings = t.getSettings();
                // @ts-ignore - displaySurface is non-standard in some TS lib versions
                if (settings.displaySurface || t.label.toLowerCase().includes('screen') || t.label.toLowerCase().includes('window') || t.label.toLowerCase().includes('monitor')) {
                    scr = t;
                } else {
                    cam = t;
                }
            } else {
                // Multifple tracks: Assume one is screen, one is cam.
                // Usually screen is the newer one or has specific props.
                // We'll trust the label/settings again, or order.
                const potentialScreen = videoTracks.find(t => {
                    const s = t.getSettings();
                    // @ts-ignore
                    return s.displaySurface || t.label.toLowerCase().includes('screen');
                });

                if (potentialScreen) {
                    scr = potentialScreen;
                    cam = videoTracks.find(t => t.id !== potentialScreen.id) || null;
                } else {
                    // Fallback: 2nd track is screen?
                    cam = videoTracks[0];
                    scr = videoTracks[1];
                }
            }

            setCameraTrack(cam);
            setScreenTrack(scr);

            // Auto-attach
            if (cam && videoRef.current) videoRef.current.srcObject = new MediaStream([cam]);
            if (scr && screenRef.current) screenRef.current.srcObject = new MediaStream([scr]);
        };

        updateTracks();
        stream.addEventListener('addtrack', updateTracks);
        stream.addEventListener('removetrack', updateTracks);

        const handleTrackMute = () => {
            console.log("Track muted/unmuted");
            updateTracks();
        };

        stream.getTracks().forEach(t => {
            t.addEventListener('mute', handleTrackMute);
            t.addEventListener('unmute', handleTrackMute);
            t.addEventListener('ended', handleTrackMute);
        });

        return () => {
            stream.removeEventListener('addtrack', updateTracks);
            stream.removeEventListener('removetrack', updateTracks);
            stream.getTracks().forEach(t => {
                t.removeEventListener('mute', handleTrackMute);
                t.removeEventListener('unmute', handleTrackMute);
                t.removeEventListener('ended', handleTrackMute);
            });
        };
    }, [stream]);

    // Re-attach if refs change or tracks update
    useEffect(() => {
        if (cameraTrack && videoRef.current) {
            const currentStream = videoRef.current.srcObject as MediaStream;
            if (!currentStream || currentStream.getTracks()[0] !== cameraTrack) {
                videoRef.current.srcObject = new MediaStream([cameraTrack]);
                videoRef.current.play().catch(() => { });
            }
        } else if (!cameraTrack && videoRef.current) {
            videoRef.current.srcObject = null;
        }

        if (screenTrack && screenRef.current) {
            const currentStream = screenRef.current.srcObject as MediaStream;
            if (!currentStream || currentStream.getTracks()[0] !== screenTrack) {
                screenRef.current.srcObject = new MediaStream([screenTrack]);
                screenRef.current.play().catch(() => { });
            }
        } else if (!screenTrack && screenRef.current) {
            screenRef.current.srcObject = null;
        }
    }, [cameraTrack, screenTrack]);


    useEffect(() => {
        if (!stream || stream.getAudioTracks().length === 0) {
            setIsSpeaking(false);
            return;
        }
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        let source: MediaStreamAudioSourceNode;
        try {
            source = audioContext.createMediaStreamSource(stream);
        } catch (e) {
            console.error("Error creating remote media stream source:", e);
            return;
        }
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        let interval = setInterval(() => {
            if (!stream || stream.getAudioTracks().length === 0) {
                setIsSpeaking(false);
                return;
            }
            analyser.getByteFrequencyData(dataArray);
            const average = dataArray.reduce((p, c) => p + c, 0) / dataArray.length;
            const threshold = (100 - globalSensitivity) / 2;
            setIsSpeaking(average > threshold);
        }, 100);
        return () => {
            clearInterval(interval);
            audioContext.close();
        };
    }, [stream, globalSensitivity]);

    return (
        <div
            id={`peer-card-${peerId}`}
            className={`speaker-card ${isSpeaking ? 'speaking' : ''}`}
            style={{ background: 'var(--bg-secondary)', borderRadius: 12, position: 'relative', overflow: 'hidden', width: '100%', minHeight: 180, aspectRatio: '16/9', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `2px solid ${isSpeaking ? 'var(--brand)' : 'transparent'}` }}
        >
            {stream?.getAudioTracks().map((track, index) => {
                const shouldDuck = stream.getAudioTracks().length > 1 && index === 0;
                return <RemoteAudio key={track.id} track={track} volume={volume} isDeafened={isDeafened} isDucking={shouldDuck} />;
            })}

            {/* SCREEN SHARE LAYER (Main) */}
            {screenTrack && (
                <video
                    ref={screenRef}
                    autoPlay
                    playsInline
                    muted // Audio handled separately
                    style={{ width: '100%', height: '100%', objectFit: 'contain', position: 'absolute', top: 0, left: 0, zIndex: 5, background: '#000' }}
                    onLoadedMetadata={(e) => {
                        console.log(`[VIDEO_DEBUG] Screen metadata loaded: ${screenTrack.id}`);
                        const video = e.currentTarget;
                        video.play().catch(err => {
                            console.error("Play failed for screenTrack", err);
                            setTimeout(() => video.play().catch(e => console.error("Retry screen play failed", e)), 500);
                        });
                    }}
                />
            )}

            {/* CAMERA LAYER (If Screen is active, show as PIP or conditional. If no screen, Main) */}
            {/* CAMERA LAYER */}
            {cameraTrack ? (
                <>
                    <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        style={screenTrack ? {
                            width: '20%',
                            height: 'auto',
                            aspectRatio: '16/9',
                            objectFit: 'cover',
                            position: 'absolute',
                            bottom: 40,
                            right: 12,
                            zIndex: 10,
                            borderRadius: 8,
                            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                            border: '1px solid rgba(255,255,255,0.2)'
                        } : {
                            width: '100%',
                            height: '100%',
                            objectFit: 'contain',
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            zIndex: 4
                        }}
                        onLoadedMetadata={(e) => {
                            console.log(`[VIDEO_DEBUG] Metadata loaded: ${cameraTrack.id}`);
                            const video = e.currentTarget;
                            video.play().catch(err => {
                                console.error("Play failed for cameraTrack", err);
                                // On Android WebView, sometimes muted video requires a slight delay or user interaction
                                setTimeout(() => video.play().catch(e => console.error("Retry play failed", e)), 500);
                            });
                        }}
                        onResize={(e) => console.log(`[VIDEO_DEBUG] Resize: ${e.currentTarget.videoWidth}x${e.currentTarget.videoHeight}`)}
                        onWaiting={() => console.log(`[VIDEO_DEBUG] Waiting!`)}
                        onPlaying={() => console.log(`[VIDEO_DEBUG] Playing!`)}
                    />
                </>
            ) : null}

            {/* Connection Status Overlay */}
            {connectionState === 'connecting' && (
                <div className="connection-status-overlay" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 15, color: 'white' }}>
                    <div className="spinner" style={{ border: '4px solid rgba(255,255,255,0.3)', borderTop: '4px solid var(--brand)', borderRadius: '50%', width: '40px', height: '40px', animation: 'spin 1s linear infinite' }} />
                    <p style={{ marginTop: '10px' }}>{t('connecting')}</p>
                </div>
            )}

            {/* AVATAR LAYER (Fallback for Camera Identity) */}
            {/* Show avatar if: No Camera AND (No Screen OR Screen is active but we want identity) */}
            {/* Wait, if Screen is active, we don't need avatar as main trace. But user wants "Avatar should remain visible when Camera is off, Screen sharing is active" */}
            {/* So if Screen is ON and Camera is OFF, we show Avatar in PIP? Or just don't show Avatar? */}
            {/* User said: "Screen sharing must not override participant identity UI." */}
            {/* Let's show Avatar in PIP if Screen is ON and Camera is OFF. */}

            {/* FULLSCREEN BARRAGE */}
            {document.fullscreenElement?.id === `peer-card-${peerId}` && (
                <MessageBarrage roomId={roomId || ''} isRelative={true} />
            )}

            {(!cameraTrack) && (
                screenTrack ? (
                    // PIP Avatar
                    <div style={{
                        position: 'absolute',
                        bottom: 40,
                        right: 12,
                        zIndex: 10,
                        width: 48,
                        height: 48,
                    }}>
                        {photoURL ? (
                            <img src={photoURL} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', border: '2px solid white' }} />
                        ) : (
                            <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: 'var(--brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold', border: '2px solid white' }}>
                                {displayName.charAt(0)}
                            </div>
                        )}
                    </div>
                ) : (
                    // Main Avatar (No Screen, No Camera)
                    photoURL ? (
                        <img src={photoURL} alt="" className="avatar" style={{ width: isMaximized ? 120 : 80, height: isMaximized ? 120 : 80, borderRadius: '50%', objectFit: 'cover', zIndex: 3 }} />
                    ) : (
                        <div className="avatar" style={{ width: isMaximized ? 120 : 80, height: isMaximized ? 120 : 80, fontSize: isMaximized ? 48 : 32, zIndex: 3 }}>{displayName.charAt(0)}</div>
                    )
                )
            )}

            {!isMaximized && (
                <div className="video-card-controls" style={{ position: 'absolute', top: 12, right: 12, display: 'flex', gap: 8, opacity: 0, transition: 'opacity 0.2s', zIndex: 20 }}>
                    <button onClick={(e) => { e.stopPropagation(); onMaximize?.(); }} className="control-btn" title={t('maximize')}>
                        <FaBolt />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); onFullscreen?.(); }} className="control-btn" title={t('fullscreen')}>
                        <FaDesktop />
                    </button>
                </div>
            )}

            <div style={{ position: 'absolute', bottom: 12, left: 12, display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(0,0,0,0.6)', padding: '6px 12px', borderRadius: '4px', zIndex: 20 }}>
                <span style={{ fontWeight: 600 }}>{displayName}</span>
            </div>
            {!isGameMode && isSpeaking && (!cameraTrack && !screenTrack) && <div className="voice-wave"></div>}
        </div>
    );
}

export default function VoiceRoom({ roomId, onBack }: VoiceRoomProps) {
    const { currentUser, userData, db } = useAuth();
    const { showAlert } = useUI();
    const [isMicOn, setIsMicOn] = useState(true);
    const [isDeafened, setIsDeafened] = useState(false);
    const [isGameMode, setIsGameMode] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [sensitivity, setSensitivity] = useState(parseInt(localStorage.getItem('voice_sensitivity') || '10'));
    const { playSound } = useSound();
    const { t } = useLanguage();

    const [isChatOpen, setIsChatOpen] = useState(false);
    const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth < 768);

    const [unreadMessages, setUnreadMessages] = useState(0);
    const lastMsgIdRef = useRef<string | null>(null);

    useEffect(() => {
        if (isChatOpen) {
            setUnreadMessages(0);
        }
    }, [isChatOpen]);

    useEffect(() => {
        const q = query(
            collection(db, 'rooms', roomId, 'messages'),
            orderBy('createdAt', 'asc'),
            limit(100)
        );

        const unsub = onSnapshot(q, (snapshot) => {
            if (snapshot.docs.length > 0) {
                const latestDoc = snapshot.docs[snapshot.docs.length - 1];
                const latest = { id: latestDoc.id, ...latestDoc.data() } as any;

                if (lastMsgIdRef.current && latest.id !== lastMsgIdRef.current && latest.senderId !== currentUser?.uid) {
                    if (!isChatOpen) {
                        setUnreadMessages(prev => prev + 1);
                    }
                }
                lastMsgIdRef.current = latest.id;
            }
        });

        return () => unsub();
    }, [roomId, currentUser?.uid, isChatOpen]);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => { playSound('join'); }, []);

    const { peers, peerNames, localStream, screenStream, toggleScreenShare, isCameraOn, toggleCamera, flipCamera, facingMode, forceRenegotiation, iceStates, connectionStates } = useWebRTC(
        roomId,
        currentUser?.uid || 'anonymous',
        currentUser?.displayName || 'Anonim',
        db
    );

    const [maximizedPeerId, setMaximizedPeerId] = useState<string | null>(null);
    const [rotation, setRotation] = useState(0);
    const [roomData, setRoomData] = useState<any>(null); // State for room data
    const [isExtraSettingsOpen, setIsExtraSettingsOpen] = useState(false);


    // Initialize callDuration to 0 for a fresh start every time the user joins
    const [callDuration, setCallDuration] = useState(0);
    const [isCallActive, setIsCallActive] = useState(false);

    useEffect(() => {
        // Fetch room data
        const unsubRoomData = onSnapshot(doc(db, 'rooms', roomId), (docSnap) => {
            if (docSnap.exists()) {
                setRoomData(docSnap.data());
            }
        });
        return () => unsubRoomData();
    }, [roomId, db]);

    useEffect(() => {
        // Start the call session when the first peer joins (or if we are the only one broadcasting immediately)
        if (peers.size > 0 && !isCallActive) {
            setIsCallActive(true);
        }
    }, [peers.size, isCallActive]);

    useEffect(() => {
        let interval: ReturnType<typeof setInterval>;
        if (isCallActive) {
            // Count up exactly 1 second at a time while the active session exists
            interval = setInterval(() => {
                setCallDuration(prev => prev + 1);
            }, 1000);
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [isCallActive]);

    const [isInviteMenuOpen, setIsInviteMenuOpen] = useState(false);
    const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
    const [friendsList, setFriendsList] = useState<any[]>([]);
    const [isFullscreenActive, setIsFullscreenActive] = useState(false);

    useEffect(() => {
        const handleFS = () => {
            setIsFullscreenActive(!!document.fullscreenElement);
        };
        document.addEventListener('fullscreenchange', handleFS);
        return () => document.removeEventListener('fullscreenchange', handleFS);
    }, []);

    useEffect(() => {
        if (isInviteModalOpen && userData?.friends?.length > 0) {
            const fetchFriends = async () => {
                try {
                    const q = query(collection(db, 'users'), where('uid', 'in', userData.friends.slice(0, 30)));
                    const snap = await getDocs(q);
                    setFriendsList(snap.docs.map(d => d.data()));
                } catch (e) {
                    console.error("Error fetching friends:", e);
                }
            };
            fetchFriends();
        } else if (!isInviteModalOpen) {
            setFriendsList([]);
        }
    }, [isInviteModalOpen, userData, db]);

    const handleSendInvite = async (friendId: string, friendName: string) => {
        try {
            const groupsRef = collection(db, 'groups');
            const q = query(groupsRef, where('members', 'array-contains', currentUser?.uid));
            const snapshot = await getDocs(q);

            let existingGroup: any = null;
            snapshot.forEach(docSnap => {
                const data = docSnap.data();
                if (data.members.length === 2 && data.members.includes(friendId)) {
                    existingGroup = { id: docSnap.id, ...data };
                }
            });

            let groupId = existingGroup?.id;
            if (!groupId) {
                const newGroup = await addDoc(groupsRef, {
                    name: `${userData?.displayName} & ${friendName}`,
                    members: [currentUser?.uid, friendId],
                    createdAt: serverTimestamp()
                });
                groupId = newGroup.id;
            }

            const link = `${window.location.origin}/?room=${roomId}`;
            await addDoc(collection(db, 'groups', groupId, 'messages'), {
                content: `${t('invite_message_prefix')} ${link}`,
                senderId: currentUser?.uid,
                senderName: userData?.displayName || currentUser?.email,
                createdAt: serverTimestamp(),
                type: 'text'
            });

            showAlert(t('invite'), t('invite_sent_to', { name: friendName }));
        } catch (err) {
            console.error(err);
            showAlert(t('error'), t('invite_send_error'));
        }
    };

    const formatDuration = (seconds: number) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const handleFullscreen = async (elementId: string) => {
        const element = document.getElementById(elementId);
        if (!element) return;
        try {
            if ((element as any).requestFullscreen) await (element as any).requestFullscreen();
            else if ((element as any).webkitRequestFullscreen) await (element as any).webkitRequestFullscreen();
            if (screen.orientation && (screen.orientation as any).lock) {
                await (screen.orientation as any).lock('landscape').catch(() => { });
            }
        } catch (err) {
            console.error("Fullscreen error:", err);
        }
    };

    useEffect(() => {
        const handleSettingsUpdate = (e: any) => {
            if (e.detail.key === 'sensitivity') setSensitivity(parseInt(e.detail.value));
        };
        const handleGlobalAudio = (e: any) => {
            if (e.detail.type === 'mic') setIsMicOn(!e.detail.value);
            else if (e.detail.type === 'deafen') setIsDeafened(e.detail.value);
        };
        window.addEventListener('voice_settings_updated', handleSettingsUpdate);
        window.addEventListener('global_audio_state', handleGlobalAudio);
        return () => {
            window.removeEventListener('voice_settings_updated', handleGlobalAudio);
            window.removeEventListener('global_audio_state', handleGlobalAudio);
        };
    }, []);

    const cameraInitialized = useRef(false);
    useEffect(() => {
        if (cameraInitialized.current) return;
        const unsubRoom = onSnapshot(doc(db, 'rooms', roomId), (docSnap) => {
            if (docSnap.exists() && !cameraInitialized.current) {
                const roomData = docSnap.data();
                if (roomData.type === 'video' && !isCameraOn) {
                    toggleCamera();
                    cameraInitialized.current = true;
                }
            }
        });
        return () => unsubRoom();
    }, [roomId, db, isCameraOn, toggleCamera]);

    useEffect(() => {
        if (!localStream || !isMicOn || localStream.getAudioTracks().length === 0) {
            setIsSpeaking(false);
            return;
        }
        const audioContext = new AudioContext();
        let source: MediaStreamAudioSourceNode;
        try {
            source = audioContext.createMediaStreamSource(localStream);
        } catch (e) {
            console.error("Error creating media stream source:", e);
            return;
        }
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        let interval: any;
        const checkVolume = () => {
            analyser.getByteFrequencyData(dataArray);
            const average = dataArray.reduce((p, c) => p + c, 0) / dataArray.length;
            const threshold = (100 - sensitivity) / 2;
            setIsSpeaking(average > threshold);
        };
        interval = setInterval(checkVolume, 100);
        return () => {
            clearInterval(interval);
            audioContext.close();
        };
    }, [localStream, isMicOn, sensitivity]);

    useEffect(() => {
        if (localStream) {
            localStream.getAudioTracks().forEach(track => { track.enabled = isMicOn; });
        }
    }, [isMicOn, localStream]);

    useEffect(() => {
        let wakeLock: any = null;
        const requestWakeLock = async () => {
            try {
                if ('wakeLock' in navigator) wakeLock = await (navigator as any).wakeLock.request('screen');
            } catch (err: any) { console.error(`${err.name}, ${err.message}`); }
        };
        requestWakeLock();
        return () => { if (wakeLock) wakeLock.release(); };
    }, []);

    const toggleMic = () => {
        playSound('click');
        setIsMicOn(prev => !prev);
    };

    const toggleDeafen = () => {
        playSound('click');
        setIsDeafened(prev => !prev);
    };

    const reconnect = () => {
        playSound('click');
        forceRenegotiation();
        showAlert(t('connection'), t('reconnecting_message'));
    };

    const handleLeaveRoom = async () => {
        playSound('click');
        const memberRef = doc(db, `rooms/${roomId}/members`, currentUser?.uid || 'anon');
        await deleteDoc(memberRef);
        const membersRef = collection(db, `rooms/${roomId}/members`);
        const snap = await getDocs(membersRef);
        if (snap.empty) {
            await deleteDoc(doc(db, 'rooms', roomId));
        }
        if (onBack) {
            onBack();
        } else {
            window.location.reload();
        }
    };


    return (
        <>
            <div className="voice-room" style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, display: 'flex', flexDirection: 'column', background: 'transparent' }}>
                <style>{`
                .speaker-card:hover .video-card-controls { opacity: 1 !important; }
                .control-btn { background: rgba(0,0,0,0.4); border: none; color: white; padding: 8px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; backdrop-filter: blur(4px); transition: all 0.2s ease; }
                .control-btn:hover { background: rgba(255,255,255,0.2); transform: scale(1.1); }
                .control-btn-main { width: 48px; height: 48px; border-radius: 50%; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; transition: all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
                .control-btn-main:hover { transform: scale(1.15) translateY(-4px); box-shadow: 0 10px 20px rgba(0,0,0,0.3); }
                .control-btn-main:active { transform: scale(0.95); }
                @media (max-width: 768px) {
                    .room-controls { gap: 8px !important; padding: 10px 14px !important; }
                    .control-btn-main { width: 42px; height: 42px; font-size: 1rem; }
                }
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            `}</style>

                <header className="room-header-floating" style={{
                    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 100,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 20px', background: 'linear-gradient(to bottom, rgba(0,0,0,0.7), rgba(0,0,0,0))',
                    color: 'white'
                }}>
                    <div className="room-info" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        {onBack && (
                            <button className="back-btn" onClick={() => { playSound('click'); onBack(); }} title={t('back')} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', cursor: 'pointer' }}>
                                <FaChevronLeft />
                            </button>
                        )}
                        <h2 style={{ margin: 0, fontSize: '1.2rem' }}>{roomData?.name || t('loading')}</h2>
                    </div>
                    <div className="room-actions" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        {isCallActive && (
                            <div style={{
                                background: 'rgba(0,0,0,0.4)',
                                padding: '6px 14px',
                                borderRadius: '20px',
                                fontSize: '0.9rem',
                                fontWeight: 600,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                color: 'white',
                                border: '1px solid var(--glass-border)'
                            }}>
                                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#43b581', boxShadow: '0 0 8px #43b581', animation: 'pulse 2s infinite' }} />
                                <span style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '1px' }}>{formatDuration(callDuration)}</span>
                            </div>
                        )}

                        {/* Participant names: current user + all peers, max 2 + overflow */}
                        {(() => {
                            const allNames = [userData?.displayName || t('you'), ...Array.from(peerNames.values())];
                            const shown = allNames.slice(0, 2);
                            const extra = allNames.length - 2;
                            return (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', justifyContent: 'center' }}>
                                    {shown.map((name, i) => (
                                        <span key={i} style={{ background: 'rgba(255,255,255,0.1)', borderRadius: '20px', padding: '3px 10px', fontSize: '0.82rem', fontWeight: 600, color: 'white', whiteSpace: 'nowrap' }}>{name}</span>
                                    ))}
                                    {extra > 0 && (
                                        <span style={{ background: 'rgba(255,255,255,0.08)', borderRadius: '20px', padding: '3px 10px', fontSize: '0.82rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>+{extra} {t('people')}</span>
                                    )}
                                </div>
                            );
                        })()}

                        <button
                            onClick={() => setIsInviteMenuOpen(true)}
                            className="action-btn"
                            title={t('invite')}
                            style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '8px', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '8px', color: 'white', cursor: 'pointer' }}
                        >
                            <FaUserPlus />
                            <span>{t('invite')}</span>
                        </button>
                        <button
                            className={`action-btn ${isChatOpen ? 'active' : ''}`}
                            onClick={() => setIsChatOpen(!isChatOpen)}
                            title={t('chat')}
                            style={{ background: isChatOpen ? 'var(--brand)' : 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '8px', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '8px', color: 'white', cursor: 'pointer', position: 'relative' }}
                        >
                            <FaComment />
                            <span>{t('chat')}</span>
                            {!isChatOpen && unreadMessages > 0 && (
                                <span className="unread-dot" style={{
                                    position: 'absolute',
                                    top: -6,
                                    right: -6,
                                    background: 'var(--danger)',
                                    color: 'white',
                                    fontSize: '0.7rem',
                                    fontWeight: 'bold',
                                    width: 20,
                                    height: 20,
                                    borderRadius: '50%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    boxShadow: '0 2px 5px rgba(0,0,0,0.3)',
                                    border: '2px solid var(--bg-primary)'
                                }}>{unreadMessages > 99 ? '99+' : unreadMessages}</span>
                            )}
                        </button>
                    </div>
                </header>

                <div className="room-content" style={{ flex: 1, display: 'flex', flexDirection: window.innerWidth < 768 ? 'column' : 'row', overflow: 'hidden' }}>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>

                        {/* Chat Overlay area (was BrowserView) */}
                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 }}>
                            <ChatOverlay roomId={roomId} />
                            {!isFullscreenActive && <MessageBarrage roomId={roomId} />}
                        </div>

                        <div className="participants-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
                            {!maximizedPeerId ? (
                                <div className="voice-grid" style={{
                                    flex: 1, display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))',
                                    gap: 16, padding: 20,
                                    justifyContent: 'center', alignContent: 'start', overflowY: 'auto'
                                }}>
                                    <div id="local-video-card" className={`speaker-card ${isSpeaking ? 'speaking' : ''}`} style={{ background: 'var(--bg-secondary)', borderRadius: 12, position: 'relative', overflow: 'hidden', width: '100%', minHeight: 180, aspectRatio: '16/9', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `2px solid ${isSpeaking ? 'var(--brand)' : 'transparent'}` }}>
                                        {screenStream ? (
                                            <video ref={(el) => { if (el && el.srcObject !== screenStream) el.srcObject = screenStream; }} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'contain', position: 'absolute', top: 0, left: 0 }} />
                                        ) : (isCameraOn && localStream && localStream.getVideoTracks().length > 0) ? (
                                            <video ref={(el) => { if (el && el.srcObject !== localStream) el.srcObject = localStream; }} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', transform: facingMode === 'user' ? 'scaleX(-1)' : 'none', position: 'absolute', top: 0, left: 0 }} />
                                        ) : userData?.photoURL ? (
                                            <img src={userData.photoURL} alt="" className="avatar" style={{ width: 80, height: 80, borderRadius: '50%', objectFit: 'cover' }} />
                                        ) : (
                                            <div className="avatar" style={{ width: 80, height: 80, fontSize: 32 }}>{userData?.displayName?.charAt(0) || currentUser?.email?.charAt(0) || t('S')}</div>
                                        )}

                                        <div className="video-card-controls" style={{ position: 'absolute', top: 12, right: 12, display: 'flex', gap: 8, opacity: 0, transition: 'opacity 0.2s', zIndex: 10 }}>
                                            <button onClick={() => setMaximizedPeerId('local')} className="control-btn" title={t('maximize')}><FaBolt /></button>
                                            <button onClick={() => handleFullscreen('local-video-card')} className="control-btn" title={t('fullscreen')}><FaDesktop /></button>
                                        </div>
                                        <div style={{ position: 'absolute', bottom: 12, left: 12, display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(0,0,0,0.6)', padding: '6px 12px', borderRadius: '4px' }}>
                                            <span style={{ fontWeight: 600 }}>{userData?.displayName || t('you')} ({t('you')})</span>
                                            {!isMicOn && <FaMicrophoneSlash style={{ color: 'var(--danger)' }} />}
                                        </div>

                                        {/* FULLSCREEN BARRAGE FOR LOCAL */}
                                        {document.fullscreenElement?.id === 'local-video-card' && (
                                            <MessageBarrage roomId={roomId} isRelative={true} />
                                        )}
                                    </div>

                                    {Array.from(peerNames.entries()).map(([peerId, name]) => (
                                        <RemoteParticipant
                                            key={peerId}
                                            peerId={peerId}
                                            stream={peers.get(peerId)}
                                            name={peerNames.get(peerId) || t('user')}
                                            isGameMode={isGameMode}
                                            globalSensitivity={sensitivity}
                                            isDeafened={isDeafened}
                                            db={db}
                                            isMaximized={maximizedPeerId === peerId}
                                            onMaximize={() => setMaximizedPeerId(maximizedPeerId === peerId ? null : peerId)}
                                            onFullscreen={() => handleFullscreen(`peer-card-${peerId}`)}
                                            roomId={roomId}
                                            iceState={iceStates.get(peerId)}
                                            connectionState={connectionStates.get(peerId)}
                                        />
                                    ))}
                                </div>
                            ) : (
                                <div className="focused-view" style={{ flex: 1, padding: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative', background: 'black' }}>
                                    {!isChatOpen && <ChatOverlay roomId={roomId} />}
                                    <div id={maximizedPeerId === 'local' ? 'local-video-card' : `peer-card-${maximizedPeerId}`} style={{ width: '100%', height: '100%', background: 'black', overflow: 'hidden', position: 'relative' }}>
                                        <div className="focused-content" style={{ width: '100%', height: '100%', transform: `rotate(${rotation}deg)`, transition: 'transform 0.3s ease', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            {maximizedPeerId === 'local' ? (
                                                <>
                                                    {screenStream ? (
                                                        <video ref={(el) => { if (el && el.srcObject !== screenStream) el.srcObject = screenStream; }} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                                    ) : (isCameraOn && localStream && localStream.getVideoTracks().length > 0) ? (
                                                        <video ref={(el) => { if (el && el.srcObject !== localStream) el.srcObject = localStream; }} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', transform: facingMode === 'user' ? 'scaleX(-1)' : 'none' }} />
                                                    ) : (
                                                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                            {userData?.photoURL ? (
                                                                <img src={userData.photoURL} alt="" className="avatar" style={{ width: 120, height: 120, borderRadius: '50%', objectFit: 'cover' }} />
                                                            ) : (
                                                                <div className="avatar" style={{ width: 120, height: 120, fontSize: 48 }}>{userData?.displayName?.charAt(0) || currentUser?.email?.charAt(0) || t('S')}</div>
                                                            )}
                                                        </div>
                                                    )}
                                                </>
                                            ) : (
                                                <RemoteParticipant
                                                    peerId={maximizedPeerId}
                                                    stream={peers.get(maximizedPeerId)}
                                                    name={peerNames.get(maximizedPeerId) || ''}
                                                    isGameMode={isGameMode}
                                                    globalSensitivity={sensitivity}
                                                    isDeafened={isDeafened}
                                                    db={db}
                                                    isMaximized={true}
                                                    connectionState={connectionStates.get(maximizedPeerId)}
                                                />
                                            )}
                                        </div>
                                        <div style={{ position: 'absolute', top: 20, right: 20, display: 'flex', gap: 12, zIndex: 20 }}>
                                            <button onClick={() => setRotation(r => r + 90)} className="control-btn" style={{ padding: '10px 15px' }} title={t('rotate')}>{t('rotate')}</button>
                                            <button onClick={() => handleFullscreen(maximizedPeerId === 'local' ? 'local-video-card' : `peer-card-${maximizedPeerId}`)} className="control-btn" style={{ padding: '10px 15px' }} title={t('fullscreen')}>{t('fullscreen')}</button>
                                            <button onClick={() => { setMaximizedPeerId(null); setRotation(0); }} className="control-btn" style={{ padding: '10px 15px', background: 'rgba(255,0,0,0.3)' }} title={t('close')}>{t('close')}</button>
                                        </div>
                                        <div style={{ position: 'absolute', bottom: 20, left: 20, background: 'rgba(0,0,0,0.6)', padding: '10px 20px', borderRadius: 8 }}>
                                            <span style={{ fontWeight: 600, fontSize: 18 }}>{maximizedPeerId === 'local' ? (userData?.displayName || t('you')) : (peerNames.get(maximizedPeerId) || '')}</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {isChatOpen && (
                        <div className="side-chat" style={{
                            width: isMobile ? '100%' : '350px',
                            height: '100%',
                            borderLeft: isMobile ? 'none' : '1px solid #333',
                            display: 'flex',
                            flexDirection: 'column',
                            zIndex: 20,
                            position: isMobile ? 'absolute' : 'relative',
                            top: 0,
                            left: 0,
                            right: 0,
                            background: 'var(--bg-primary)'
                        }}>
                            <ChatPanel roomId={roomId} onClose={() => setIsChatOpen(false)} />
                        </div>
                    )}
                </div>

                <div className="room-controls-wrapper" style={{ position: 'fixed', bottom: 24, left: isChatOpen && !isMobile ? 'calc(50% - 175px)' : '50%', transform: 'translateX(-50%)', zIndex: 1000, width: 'auto', display: 'flex', justifyContent: 'center', pointerEvents: 'none', transition: 'left 0.3s ease' }}>
                    <div className="room-controls" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', background: 'rgba(20, 20, 20, 0.7)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', borderRadius: 40, border: '1px solid rgba(255, 255, 255, 0.1)', boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)', pointerEvents: 'auto', position: 'relative' }}>

                        <button
                            className={`control-btn cam ${isCameraOn ? 'on' : 'off'}`}
                            onClick={() => {
                                if (screenStream) {
                                    showAlert(t('conflict'), t('camera_screen_conflict'));
                                    return;
                                }
                                toggleCamera();
                            }}
                            title={isCameraOn ? t('cam_off') : t('cam_on')}
                            style={{ background: isCameraOn ? 'var(--brand)' : 'rgba(255,255,255,0.1)', color: 'white', width: '48px', height: '48px', borderRadius: '50%', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}
                        >
                            {isCameraOn ? <FaVideo /> : <FaVideoSlash />}
                        </button>

                        <button
                            className={`control-btn mic ${isMicOn ? 'on' : 'off'}`}
                            onClick={toggleMic}
                            title={isMicOn ? t('mic_off') : t('mic_on')}
                            style={{ background: isMicOn ? 'rgba(255,255,255,0.1)' : 'var(--danger)', color: 'white', width: '48px', height: '48px', borderRadius: '50%', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}
                        >
                            {isMicOn ? <FaMicrophone /> : <FaMicrophoneSlash />}
                        </button>

                        <button
                            className={`control-btn deafen ${isDeafened ? 'active' : ''}`}
                            onClick={toggleDeafen}
                            title={isDeafened ? t('undeafen') : t('deafen')}
                            style={{ background: isDeafened ? 'var(--brand)' : 'rgba(255,255,255,0.1)', color: 'white', width: '48px', height: '48px', borderRadius: '50%', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}
                        >
                            {isDeafened ? <FaVolumeMute /> : <FaHeadphones />}
                        </button>

                        <button
                            className={`control-btn screen ${screenStream ? 'active' : ''}`}
                            onClick={() => {
                                if (isCameraOn && !screenStream) {
                                    showAlert(t('conflict'), t('screen_camera_conflict'));
                                    return;
                                }
                                toggleScreenShare();
                            }}
                            title={screenStream ? t('screen_share_off') : t('screen_share_on')}
                            style={{ background: screenStream ? 'var(--success)' : 'rgba(255,255,255,0.1)', color: 'white', width: '48px', height: '48px', borderRadius: '50%', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}
                        >
                            <FaDesktop />
                        </button>

                        {isMobile && isCameraOn && (
                            <button onClick={() => { playSound('click'); flipCamera(); }} className="control-btn-main" title={t('flip_camera')} style={{ background: 'rgba(255,255,255,0.1)', color: 'white' }}>
                                <FaSync />
                            </button>
                        )}

                        <button className="control-btn settings" onClick={() => setIsExtraSettingsOpen(!isExtraSettingsOpen)} title={t('advanced')}
                            style={{ background: 'rgba(255,255,255,0.1)', color: 'white', width: '48px', height: '48px', borderRadius: '50%', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>
                            <FaCog />
                        </button>

                        <button className="control-btn leave" onClick={handleLeaveRoom} title={t('leave')}
                            style={{ background: 'var(--danger)', color: 'white', width: '48px', height: '48px', borderRadius: '50%', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>
                            <FaPhoneSlash />
                        </button>
                    </div>

                    <AnimatePresence>
                        {isExtraSettingsOpen && (
                            <motion.div
                                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                className="extra-settings-popover"
                                style={{
                                    position: 'absolute',
                                    bottom: 'calc(100% + 15px)',
                                    right: '10px', // Adjust position relative to the settings button
                                    background: 'var(--bg-secondary)',
                                    border: '1px solid var(--glass-border)',
                                    borderRadius: '12px',
                                    padding: '8px',
                                    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '4px',
                                    minWidth: '180px',
                                    zIndex: 1100
                                }}
                            >
                                <button className="extra-btn" onClick={reconnect}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px',
                                        background: 'transparent', border: 'none', color: 'white',
                                        borderRadius: '8px', cursor: 'pointer', textAlign: 'left', fontWeight: 500,
                                        transition: 'background 0.2s'
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                ><FaSync /> {t('reconnect')}</button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            <AnimatePresence>
                {isInviteMenuOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        style={{
                            position: 'absolute',
                            top: '70px', // Position below the header
                            right: '20px', // Align with the invite button
                            background: 'var(--bg-secondary)',
                            border: '1px solid var(--glass-border)',
                            borderRadius: '12px',
                            padding: '8px',
                            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px',
                            minWidth: '220px',
                            zIndex: 1100
                        }}
                    >
                        <button
                            onClick={() => {
                                setIsInviteMenuOpen(false);
                                setIsInviteModalOpen(true);
                            }}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px',
                                background: 'transparent', border: 'none', color: 'white',
                                borderRadius: '8px', cursor: 'pointer', textAlign: 'left', fontWeight: 500,
                                transition: 'background 0.2s'
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                            <FaShareSquare size={16} color="var(--brand)" /> {t('invite_from_friends')}
                        </button>
                        <div style={{ height: '1px', background: 'var(--glass-border)', margin: '4px 0' }} />
                        <button
                            onClick={() => {
                                setIsInviteMenuOpen(false);
                                playSound('click');
                                const link = `${window.location.origin}/?room=${roomId}`;
                                navigator.clipboard.writeText(link);
                                showAlert(t('invite'), t('invite_link_copied'));
                            }}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px',
                                background: 'transparent', border: 'none', color: 'white',
                                borderRadius: '8px', cursor: 'pointer', textAlign: 'left', fontWeight: 500,
                                transition: 'background 0.2s'
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                            <FaLink size={16} /> {t('copy_link')}
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {isInviteModalOpen && (
                    <div style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)',
                        zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
                    }}>
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            style={{
                                background: 'var(--bg-secondary)',
                                borderRadius: '16px',
                                width: '100%',
                                maxWidth: '450px',
                                border: '1px solid var(--glass-border)',
                                boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
                                display: 'flex',
                                flexDirection: 'column',
                                maxHeight: '80vh'
                            }}
                        >
                            <div style={{ padding: '20px', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h3 style={{ margin: 0, color: 'white', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <FaUserPlus /> {t('invite_friends')}
                                </h3>
                                <button onClick={() => setIsInviteModalOpen(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex' }}>
                                    <FaTimes size={18} />
                                </button>
                            </div>
                            <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
                                {friendsList.length === 0 ? (
                                    <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '20px 0' }}>
                                        {t('no_friends_yet')}
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        {friendsList.map(friend => (
                                            <div key={friend.uid} style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--bg-tertiary)', padding: '12px', borderRadius: '12px' }}>
                                                {friend.photoURL ? (
                                                    <img src={friend.photoURL} alt="" style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover' }} />
                                                ) : (
                                                    <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold' }}>
                                                        {friend.displayName?.charAt(0) || friend.email?.charAt(0) || t('K')}
                                                    </div>
                                                )}
                                                <div style={{ flex: 1, overflow: 'hidden' }}>
                                                    <div style={{ fontWeight: 600, color: 'white', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{friend.displayName || t('user')}</div>
                                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{friend.email}</div>
                                                </div>
                                                <button
                                                    onClick={() => {
                                                        playSound('click');
                                                        handleSendInvite(friend.uid, friend.displayName || t('user'));
                                                    }}
                                                    style={{
                                                        background: 'var(--brand)', color: 'white', border: 'none',
                                                        padding: '8px 16px', borderRadius: '8px', cursor: 'pointer',
                                                        fontWeight: 600, transition: 'filter 0.2s'
                                                    }}
                                                    onMouseEnter={e => e.currentTarget.style.filter = 'brightness(1.1)'}
                                                    onMouseLeave={e => e.currentTarget.style.filter = 'brightness(1)'}
                                                >
                                                    {t('invite')}
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </>
    );
}
