import { useState, useEffect, useRef } from 'react';
import type { WatchSession } from '../../types/Watch';
import { WatchService } from '../../services/WatchService';
import { useAuth } from '../../contexts/AuthContext';
import { open } from '@tauri-apps/plugin-shell';
import { FaPlay, FaPause, FaExternalLinkAlt, FaUndo, FaRedo } from 'react-icons/fa';

interface ExternalPlayerProps {
    roomId: string; // Needed for updates
    watchSession: WatchSession;
}

export default function ExternalPlayer({ roomId, watchSession }: ExternalPlayerProps) {
    const { currentUser } = useAuth();
    const isHost = currentUser?.uid === watchSession.hostUid;

    // Local simulated time for display
    const [displayTime, setDisplayTime] = useState(watchSession.playbackState.currentTime);
    const intervalRef = useRef<any>(null);

    // Sync display time with remote state
    useEffect(() => {
        // If paused, just snap to remote time
        if (watchSession.playbackState.status === 'paused') {
            setDisplayTime(watchSession.playbackState.currentTime);
            if (intervalRef.current) clearInterval(intervalRef.current);
            return;
        }

        // If playing, calculate current time based on drift
        if (watchSession.playbackState.status === 'playing') {
            const timeSinceUpdate = (Date.now() - watchSession.playbackState.lastUpdated) / 1000;
            const computedTime = watchSession.playbackState.currentTime + (timeSinceUpdate * watchSession.playbackState.playbackRate);
            setDisplayTime(computedTime);

            // Start local interval to increment nicely
            if (intervalRef.current) clearInterval(intervalRef.current);
            intervalRef.current = setInterval(() => {
                setDisplayTime(prev => prev + 1);
            }, 1000);
        }

        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [watchSession.playbackState]);

    const formatTime = (seconds: number) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        return `${h > 0 ? h + ':' : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };



    const handleOpenPlatform = async () => {
        let url = watchSession.contentId;
        if (!url.startsWith('http')) {
            // fast fix if only ID passed
            if (watchSession.platform === 'netflix') url = `https://www.netflix.com/watch/${watchSession.contentId}`;
            if (watchSession.platform === 'prime') url = `https://www.amazon.com/gp/video/detail/${watchSession.contentId}`;
            if (watchSession.platform === 'disney') url = `https://www.disneyplus.com/video/${watchSession.contentId}`;
        }

        try {
            await open(url);
        } catch (err) {
            console.error("Link açılamadı:", err);
            // Fallback for web if shell plugin is not available (dev mode)
            window.open(url, '_blank');
        }
    };

    const handlePlayPause = () => {
        if (!isHost) return;
        const newStatus = watchSession.playbackState.status === 'playing' ? 'paused' : 'playing';

        // When pausing, we should fix the time to what is currently displayed/calculated
        // to ensure everyone pauses at roughly the same reference point.
        // But for manual sync, precise frame matching isn't possible regardless.
        // We'll update with the simulated time.

        const currentTime = displayTime;

        WatchService.updatePlaybackState(roomId, {
            status: newStatus,
            currentTime: currentTime
        });
    };

    const handleSeek = (seconds: number) => {
        if (!isHost) return;
        const newTime = Math.max(0, displayTime + seconds);
        WatchService.updatePlaybackState(roomId, {
            currentTime: newTime,
            // If seeking, usually we stay in current play state, or pause? 
            // Let's keep state but update time.
        });
        setDisplayTime(newTime);
    };

    return (
        <div style={{
            width: '100%', height: '100%',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            background: 'linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%)',
            color: 'white', padding: 20
        }}>
            <h2 style={{ marginBottom: 20, textAlign: 'center' }}>
                {watchSession.platform.toUpperCase()} İzleniyor
            </h2>

            <div style={{
                background: 'rgba(255,255,255,0.05)', padding: 20, borderRadius: 12,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 15,
                width: '100%', maxWidth: 400
            }}>
                <button
                    onClick={handleOpenPlatform}
                    style={{
                        background: '#e50914', // Netflix Red generic
                        color: 'white', border: 'none', padding: '12px 24px', borderRadius: 8,
                        fontSize: '1rem', fontWeight: 'bold', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 10
                    }}
                >
                    <FaExternalLinkAlt /> Platformda Aç
                </button>

                <p style={{ fontSize: '0.9rem', opacity: 0.7, textAlign: 'center' }}>
                    Bu platform otomatik senkronizasyonu desteklemez.<br />
                    Videoyu açın ve aşağıdaki zamanlayıcıya göre manuel olarak ilerletin.
                </p>

                <div style={{
                    fontSize: '3rem', fontFamily: 'monospace', fontWeight: 'bold',
                    color: watchSession.playbackState.status === 'playing' ? '#4caf50' : '#ff9800',
                    textShadow: '0 2px 10px rgba(0,0,0,0.5)'
                }}>
                    {formatTime(displayTime)}
                </div>

                <div style={{
                    fontSize: '1.2rem', fontWeight: 600,
                    color: watchSession.playbackState.status === 'playing' ? '#4caf50' : '#ff9800'
                }}>
                    {watchSession.playbackState.status === 'playing' ? 'OYNATILIYOR' : 'DURAKLATILDI'}
                </div>

                {isHost && (
                    <div style={{ display: 'flex', gap: 15, marginTop: 10 }}>
                        <button onClick={() => handleSeek(-10)} className="control-btn" title="-10s">
                            <FaUndo /> 10s
                        </button>
                        <button
                            onClick={handlePlayPause}
                            className="control-btn-main"
                            style={{ width: 60, height: 60, fontSize: 24, background: 'white', color: 'black' }}
                        >
                            {watchSession.playbackState.status === 'playing' ? <FaPause /> : <FaPlay />}
                        </button>
                        <button onClick={() => handleSeek(10)} className="control-btn" title="+10s">
                            <FaRedo /> 10s
                        </button>
                    </div>
                )}
                {!isHost && (
                    <div style={{ fontStyle: 'italic', opacity: 0.5 }}>
                        Host kontrolleri bekleniyor...
                    </div>
                )}
            </div>

            <style>{`
                .control-btn {
                    background: rgba(255,255,255,0.1); border: none; color: white;
                    padding: 10px; border-radius: 50%; width: 40px; height: 40px;
                    cursor: pointer; display: flex; alignItems: center; justifyContent: center;
                    transition: all 0.2s;
                }
                .control-btn:hover { background: rgba(255,255,255,0.2); transform: scale(1.1); }
                .control-btn-main {
                    border: none; border-radius: 50%; display: flex; alignItems: center; justifyContent: center;
                    cursor: pointer; transition: all 0.2s;
                }
                .control-btn-main:hover { transform: scale(1.1); box-shadow: 0 0 15px rgba(255,255,255,0.3); }
            `}</style>
        </div>
    );
}
