import { useState, useEffect, useRef } from 'react';
import { FaMicrophone, FaMicrophoneSlash, FaBolt, FaDesktop, FaVideo, FaVideoSlash, FaChevronLeft } from 'react-icons/fa';
import { useUI } from '../contexts/UIContext';
import { useAuth } from '../contexts/AuthContext';
import { useWebRTC } from '../hooks/useWebRTC';
import { useSound } from '../contexts/SoundContext';
import { collection, onSnapshot, doc, deleteDoc, getDocs } from 'firebase/firestore';

interface VoiceRoomProps {
    roomId: string;
    onBack?: () => void;
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

    useEffect(() => {
        playSound('join');
    }, []);

    const { peers, peerNames, localStream, screenStream, toggleScreenShare, isCameraOn, toggleCamera } = useWebRTC(
        roomId,
        currentUser?.uid || 'anonymous',
        currentUser?.displayName || 'Anonim',
        db
    );

    useEffect(() => {
        const handleSettingsUpdate = (e: any) => {
            if (e.detail.key === 'sensitivity') {
                setSensitivity(parseInt(e.detail.value));
            }
        };

        const handleGlobalAudio = (e: any) => {
            if (e.detail.type === 'mic') {
                setIsMicOn(!e.detail.value);
            } else if (e.detail.type === 'deafen') {
                setIsDeafened(e.detail.value);
            }
        };

        window.addEventListener('voice_settings_updated', handleSettingsUpdate);
        window.addEventListener('global_audio_state', handleGlobalAudio);
        return () => {
            window.removeEventListener('voice_settings_updated', handleSettingsUpdate);
            window.removeEventListener('global_audio_state', handleGlobalAudio);
        };
    }, []);

    // Auto-enable camera for video calls
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
    }, [roomId, db]);

    // Voice detection for local user
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

    // Handle local mic track
    useEffect(() => {
        if (localStream) {
            localStream.getAudioTracks().forEach(track => {
                track.enabled = isMicOn;
            });
        }
    }, [isMicOn, localStream]);

    // Screen Wake Lock API
    useEffect(() => {
        let wakeLock: any = null;
        const requestWakeLock = async () => {
            try {
                if ('wakeLock' in navigator) {
                    wakeLock = await (navigator as any).wakeLock.request('screen');
                }
            } catch (err: any) {
                console.error(`${err.name}, ${err.message}`);
            }
        };

        requestWakeLock();
        return () => {
            if (wakeLock) wakeLock.release();
        };
    }, []);

    return (
        <div className="voice-room" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: 'transparent' }}>
            <div className="voice-header" style={{ justifyContent: 'flex-start' }}>
                {onBack && (
                    <button className="back-button" onClick={() => { playSound('click'); onBack(); }} style={{ marginBottom: 0 }}>
                        <FaChevronLeft />
                        <span>Geri</span>
                    </button>
                )}
            </div>
            <div className="voice-grid" style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 450px))', gap: 16, padding: 20, justifyContent: 'center', alignContent: 'center' }}>

                {/* Local User Card */}
                <div className={`speaker-card ${isSpeaking ? 'speaking' : ''}`} style={{ background: 'var(--bg-secondary)', borderRadius: 12, position: 'relative', overflow: 'hidden', width: '100%', aspectRatio: '16/9', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `2px solid ${isSpeaking ? 'var(--brand)' : 'transparent'}` }}>
                    {screenStream ? (
                        <video
                            ref={(el) => { if (el) el.srcObject = screenStream; }}
                            autoPlay
                            muted
                            playsInline
                            style={{ width: '100%', height: '100%', objectFit: 'contain', position: 'absolute', top: 0, left: 0 }}
                        />
                    ) : (isCameraOn && localStream && localStream.getVideoTracks().length > 0) ? (
                        <video
                            ref={(el) => { if (el) el.srcObject = localStream; }}
                            autoPlay
                            muted
                            playsInline
                            style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)', position: 'absolute', top: 0, left: 0 }}
                        />
                    ) : userData?.photoURL ? (
                        <img src={userData.photoURL} alt="" className="avatar" style={{ width: 80, height: 80, borderRadius: '50%', objectFit: 'cover' }} />
                    ) : (
                        <div className="avatar" style={{ width: 80, height: 80, fontSize: 32 }}>
                            {userData?.displayName?.charAt(0) || currentUser?.email?.charAt(0) || 'S'}
                        </div>
                    )}
                    <div style={{ position: 'absolute', bottom: 12, left: 12, display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(0,0,0,0.6)', padding: '6px 12px', borderRadius: '4px' }}>
                        <span style={{ fontWeight: 600 }}>{userData?.displayName || 'Sen'} (Sen)</span>
                        {!isMicOn && <FaMicrophoneSlash style={{ color: 'var(--danger)' }} />}
                    </div>
                </div>

                {/* Remote Participants */}
                {Array.from(peerNames.entries()).map(([peerId, name]) => (
                    <RemoteParticipant
                        key={peerId}
                        peerId={peerId}
                        stream={peers.get(peerId)}
                        name={name}
                        isGameMode={isGameMode}
                        globalSensitivity={sensitivity}
                        isDeafened={isDeafened}
                        db={db}
                    />
                ))}
            </div>

            <div className="room-controls" style={{
                height: 80,
                background: 'var(--bg-tertiary)',
                borderRadius: '12px 12px 0 0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 20,
                ...(window.innerWidth <= 768 ? {
                    position: 'fixed',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: 'auto',
                    padding: '16px',
                    background: 'rgba(30, 31, 34, 0.95)',
                    backdropFilter: 'blur(10px)',
                    zIndex: 1000,
                    borderTop: '1px solid rgba(255,255,255,0.1)'
                } : {})
            }}>
                <button
                    onClick={() => {
                        playSound('click');
                        const link = `${window.location.origin}/?room=${roomId}`;
                        navigator.clipboard.writeText(link);
                        showAlert('Davet', 'Davet linki kopyalandı!');
                    }}
                    className="control-circle"
                    style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--bg-primary)', color: 'white', fontSize: 13, fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer' }}
                >
                    DAVET
                </button>

                <button
                    onClick={() => { playSound('click'); setIsMicOn(!isMicOn); }}
                    className={`control-circle`}
                    style={{ width: 48, height: 48, borderRadius: '50%', background: isMicOn ? 'var(--bg-primary)' : 'var(--danger)', color: 'white', fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer' }}
                >
                    {isMicOn ? <FaMicrophone /> : <FaMicrophoneSlash />}
                </button>

                <button
                    onClick={() => { playSound('click'); toggleScreenShare(); }}
                    className={`control-circle`}
                    style={{ width: 48, height: 48, borderRadius: '50%', background: screenStream ? 'var(--brand)' : 'var(--bg-primary)', color: 'white', fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer' }}
                    title="Ekran Paylaş"
                >
                    <FaDesktop />
                </button>

                <button
                    onClick={() => { playSound('click'); toggleCamera(); }}
                    className={`control-circle`}
                    style={{ width: 48, height: 48, borderRadius: '50%', background: isCameraOn ? 'var(--brand)' : 'var(--bg-primary)', color: 'white', fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer' }}
                    title={isCameraOn ? "Kamerayı Kapat" : "Kamerayı Aç"}
                >
                    {isCameraOn ? <FaVideo /> : <FaVideoSlash />}
                </button>

                <button
                    onClick={() => { playSound('click'); setIsGameMode(!isGameMode); }}
                    className={`control-circle`}
                    style={{ width: 48, height: 48, borderRadius: '50%', background: isGameMode ? 'var(--brand)' : 'var(--bg-primary)', color: 'white', fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer' }}
                    title="Oyun Modu"
                >
                    <FaBolt />
                </button>

                <button
                    onClick={async () => {
                        playSound('click');
                        const memberRef = doc(db, `rooms/${roomId}/members`, currentUser?.uid || 'anon');
                        await deleteDoc(memberRef);

                        // Check if room is empty
                        const membersRef = collection(db, `rooms/${roomId}/members`);
                        const snap = await getDocs(membersRef);
                        if (snap.empty) {
                            await deleteDoc(doc(db, 'rooms', roomId));
                        }

                        window.location.reload();
                    }}
                    className="control-circle"
                    style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--danger)', color: 'white', fontSize: 13, fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer' }}
                >
                    ÇIK
                </button>
            </div>
        </div>
    );
}

interface RemoteParticipantProps {
    peerId: string;
    stream: MediaStream | undefined;
    name: string;
    isGameMode: boolean;
    globalSensitivity: number;
    isDeafened: boolean;
    db: any;
}

function RemoteParticipant({ peerId, stream, name, isGameMode, globalSensitivity, isDeafened, db }: RemoteParticipantProps) {
    const audioRef = useRef<HTMLAudioElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [displayName, setDisplayName] = useState(name);
    const [photoURL, setPhotoURL] = useState<string | null>(null);
    const [volume, setVolume] = useState(parseInt(localStorage.getItem('voice_outputVolume') || '100'));
    const [hasVideo, setHasVideo] = useState(false);

    useEffect(() => {
        const handleSettingsUpdate = (e: any) => {
            if (e.detail.key === 'outputVolume') {
                setVolume(parseInt(e.detail.value));
            }
            if (e.detail.key === 'outputId' && audioRef.current) {
                const sinkId = e.detail.value;
                if ((audioRef.current as any).setSinkId && sinkId !== 'default') {
                    (audioRef.current as any).setSinkId(sinkId);
                }
            }
        };
        window.addEventListener('voice_settings_updated', handleSettingsUpdate);

        // Apply saved output device on mount
        const savedOutputId = localStorage.getItem('voice_outputId');
        if (savedOutputId && savedOutputId !== 'default' && audioRef.current && (audioRef.current as any).setSinkId) {
            (audioRef.current as any).setSinkId(savedOutputId).catch((e: any) => console.error("Error setting sink on mount", e));
        }

        return () => window.removeEventListener('voice_settings_updated', handleSettingsUpdate);
    }, []);

    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.volume = isDeafened ? 0 : (volume / 100);
        }
    }, [volume, isDeafened]);

    useEffect(() => {
        const unsub = onSnapshot(doc(db, 'users', peerId), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setPhotoURL(data.photoURL);
                if (data.displayName) setDisplayName(data.displayName);
            }
        });

        if (stream) {
            if (audioRef.current) audioRef.current.srcObject = stream;

            // Video handling
            const checkTracks = () => {
                const hasVid = stream.getVideoTracks().length > 0;
                setHasVideo(hasVid);
                // Force assignment if valid
                if (hasVid && videoRef.current) {
                    videoRef.current.srcObject = stream;
                }
            };

            checkTracks();
            stream.onaddtrack = () => {
                console.log(`[VoiceRoom] Stream addtrack for ${peerId}`);
                checkTracks();
            };
            stream.onremovetrack = checkTracks;

            // Also force immediate assignment if already has video
            if (stream.getVideoTracks().length > 0 && videoRef.current) {
                videoRef.current.srcObject = stream;
            }

        } else {
            setHasVideo(false);
        }

        return () => unsub();
    }, [peerId, stream]);

    // Separate effect to bind video ref when it mounts (if hasVideo becomes true)
    useEffect(() => {
        if (hasVideo && videoRef.current && stream) {
            videoRef.current.srcObject = stream;
        }
    }, [hasVideo, stream]);

    useEffect(() => {
        if (!stream || stream.getAudioTracks().length === 0) {
            setIsSpeaking(false);
            return;
        }

        const audioContext = new AudioContext();
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
            if (stream.getAudioTracks().length === 0) {
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
        <div className={`speaker-card ${isSpeaking ? 'speaking' : ''}`} style={{ background: 'var(--bg-secondary)', borderRadius: 12, position: 'relative', overflow: 'hidden', width: '100%', aspectRatio: '16/9', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `2px solid ${isSpeaking ? 'var(--brand)' : 'transparent'}` }}>
            <audio ref={audioRef} autoPlay />
            {hasVideo ? (
                <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', top: 0, left: 0 }}
                    onLoadedMetadata={(e) => {
                        console.log(`[VoiceRoom] Video loaded metadata ${peerId}`, e.currentTarget.videoWidth, e.currentTarget.videoHeight);
                        e.currentTarget.play().catch(console.error);
                    }}
                    onCanPlay={() => console.log(`[VoiceRoom] Video CanPlay ${peerId}`)}
                    onWaiting={() => console.log(`[VoiceRoom] Video Waiting ${peerId}`)}
                    onStalled={() => console.log(`[VoiceRoom] Video Stalled ${peerId}`)}
                    onError={(e) => console.error(`[VoiceRoom] Video Error ${peerId}`, e)}
                />
            ) : photoURL ? (
                <img src={photoURL} alt="" className="avatar" style={{ width: 80, height: 80, borderRadius: '50%', objectFit: 'cover' }} />
            ) : (
                <div className="avatar" style={{ width: 80, height: 80, fontSize: 32 }}>{displayName.charAt(0)}</div>
            )}
            <div style={{ position: 'absolute', bottom: 12, left: 12, display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(0,0,0,0.6)', padding: '6px 12px', borderRadius: '4px' }}>
                <span style={{ fontWeight: 600 }}>{displayName}</span>
            </div>
            {!isGameMode && isSpeaking && !hasVideo && <div className="voice-wave"></div>}
        </div>
    );
}
