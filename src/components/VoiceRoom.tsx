import { useState, useEffect, useRef } from 'react';
import { FaMicrophone, FaMicrophoneSlash, FaBolt } from 'react-icons/fa';
import { useAuth } from '../contexts/AuthContext';
import { useWebRTC } from '../hooks/useWebRTC';
import { db } from '../firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';

interface VoiceRoomProps {
    roomId: string;
}

export default function VoiceRoom({ roomId }: VoiceRoomProps) {
    const { currentUser, userData } = useAuth();
    const [isMicOn, setIsMicOn] = useState(true);
    const [isGameMode, setIsGameMode] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [sensitivity, setSensitivity] = useState(parseInt(localStorage.getItem('voice_sensitivity') || '10'));

    const { peers, peerNames, localStream } = useWebRTC(
        roomId,
        currentUser?.uid || 'anonymous',
        currentUser?.displayName || 'Anonim'
    );

    useEffect(() => {
        const handleSettingsUpdate = (e: any) => {
            if (e.detail.key === 'sensitivity') {
                setSensitivity(parseInt(e.detail.value));
            }
        };
        window.addEventListener('voice_settings_updated', handleSettingsUpdate);
        return () => window.removeEventListener('voice_settings_updated', handleSettingsUpdate);
    }, []);

    // Voice detection for local user
    useEffect(() => {
        if (!localStream || !isMicOn) {
            setIsSpeaking(false);
            return;
        }

        const audioContext = new AudioContext();
        const source = audioContext.createMediaStreamSource(localStream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        let interval: any;

        const checkVolume = () => {
            analyser.getByteFrequencyData(dataArray);
            const average = dataArray.reduce((p, c) => p + c, 0) / dataArray.length;
            // Threshold calculation based on sensitivity (0-100)
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
                    console.log('Wake Lock active');
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
        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div className="voice-grid" style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, padding: 20 }}>

                {/* Local User Card */}
                <div className={`speaker-card ${isGameMode ? 'low-perf' : ''} ${isSpeaking ? 'speaking' : ''}`} style={{ background: 'var(--bg-secondary)', borderRadius: 12, position: 'relative', overflow: 'hidden', aspectRatio: '1/1', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `2px solid ${isSpeaking ? 'var(--brand)' : 'transparent'}` }}>
                    {userData?.photoURL ? (
                        <img src={userData.photoURL} alt="" style={{ width: 80, height: 80, borderRadius: '50%', objectFit: 'cover' }} />
                    ) : (
                        <div className="avatar" style={{ width: 80, height: 80, fontSize: 32 }}>
                            {userData?.displayName?.charAt(0) || currentUser?.email?.charAt(0) || 'S'}
                        </div>
                    )}
                    <div style={{ position: 'absolute', bottom: 12, left: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 600 }}>{userData?.displayName || 'Sen'} (Sen)</span>
                        {!isMicOn && <FaMicrophoneSlash style={{ color: 'var(--danger)' }} />}
                    </div>
                    {!isGameMode && isMicOn && isSpeaking && <div className="voice-wave"></div>}
                </div>

                {/* Remote Peers */}
                {Array.from(peers.entries()).map(([peerId, stream]) => (
                    <RemoteAudio
                        key={peerId}
                        peerId={peerId}
                        stream={stream}
                        name={peerNames.get(peerId) || 'Yükleniyor...'}
                        isGameMode={isGameMode}
                        globalSensitivity={sensitivity}
                    />
                ))}
            </div>

            <div className="room-controls" style={{ height: 80, background: 'var(--bg-tertiary)', borderRadius: '12px 12px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
                <button
                    onClick={() => {
                        const link = `${window.location.origin}/?room=${roomId}`;
                        navigator.clipboard.writeText(link);
                        alert('Davet linki kopyalandı!');
                    }}
                    className="control-circle"
                    style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--bg-accent)', color: 'white', fontSize: 13, fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer' }}
                >
                    DAVET
                </button>

                <button
                    onClick={() => setIsMicOn(!isMicOn)}
                    className={`control-circle`}
                    style={{ width: 48, height: 48, borderRadius: '50%', background: isMicOn ? 'var(--bg-accent)' : 'var(--danger)', color: 'white', fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer' }}
                >
                    {isMicOn ? <FaMicrophone /> : <FaMicrophoneSlash />}
                </button>

                <button
                    onClick={() => setIsGameMode(!isGameMode)}
                    className={`control-circle`}
                    style={{ width: 48, height: 48, borderRadius: '50%', background: isGameMode ? 'var(--brand)' : 'var(--bg-accent)', color: 'white', fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer' }}
                    title="Oyun Modu"
                >
                    <FaBolt />
                </button>

                <button
                    onClick={() => window.location.reload()}
                    className="control-circle"
                    style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--danger)', color: 'white', fontSize: 13, fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer' }}
                >
                    ÇIK
                </button>
            </div>
        </div>
    );
}

function RemoteAudio({ peerId, stream, name, isGameMode, globalSensitivity }: { peerId: string, stream: MediaStream, name: string, isGameMode: boolean, globalSensitivity: number }) {
    const audioRef = useRef<HTMLAudioElement>(null);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [photoURL, setPhotoURL] = useState<string | null>(null);
    const [volume, setVolume] = useState(parseInt(localStorage.getItem('voice_outputVolume') || '100'));

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
        return () => window.removeEventListener('voice_settings_updated', handleSettingsUpdate);
    }, []);

    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.volume = volume / 100;
        }
    }, [volume]);

    useEffect(() => {
        // Fetch user photo
        const fetchPhoto = async () => {
            const q = query(collection(db, 'users'), where('uid', '==', peerId));
            const snap = await getDocs(q);
            if (!snap.empty) {
                setPhotoURL(snap.docs[0].data().photoURL);
            }
        };
        fetchPhoto();

        if (audioRef.current && stream) {
            audioRef.current.srcObject = stream;
        }

        // Remote voice detection
        const audioContext = new AudioContext();
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        let interval: any;

        const checkVolume = () => {
            analyser.getByteFrequencyData(dataArray);
            const average = dataArray.reduce((p, c) => p + c, 0) / dataArray.length;
            const threshold = (100 - globalSensitivity) / 2;
            setIsSpeaking(average > threshold);
        };

        interval = setInterval(checkVolume, 100);

        return () => {
            clearInterval(interval);
            audioContext.close();
        };
    }, [stream, peerId, globalSensitivity]);

    return (
        <div className={`speaker-card ${isGameMode ? 'low-perf' : ''} ${isSpeaking ? 'speaking' : ''}`} style={{ background: 'var(--bg-secondary)', borderRadius: 12, position: 'relative', overflow: 'hidden', aspectRatio: '1/1', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `2px solid ${isSpeaking ? 'var(--brand)' : 'transparent'}` }}>
            <audio ref={audioRef} autoPlay />
            {photoURL ? (
                <img src={photoURL} alt="" style={{ width: 80, height: 80, borderRadius: '50%', objectFit: 'cover' }} />
            ) : (
                <div className="avatar" style={{ width: 80, height: 80, fontSize: 32 }}>{name.charAt(0)}</div>
            )}
            <div style={{ position: 'absolute', bottom: 12, left: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 600 }}>{name}</span>
            </div>
            {!isGameMode && isSpeaking && <div className="voice-wave"></div>}
        </div>
    );
}
