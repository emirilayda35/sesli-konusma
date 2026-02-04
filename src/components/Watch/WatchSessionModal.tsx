import { useState } from 'react';
import type { WatchPlatform } from '../../types/Watch';
import { WatchService } from '../../services/WatchService';
import { useAuth } from '../../contexts/AuthContext';
import { FaYoutube, FaVideo, FaTimes } from 'react-icons/fa';


interface WatchSessionModalProps {
    roomId: string;
    onClose: () => void;
}

export default function WatchSessionModal({ roomId, onClose }: WatchSessionModalProps) {
    const { currentUser } = useAuth();
    const [platform, setPlatform] = useState<WatchPlatform>('youtube');
    const [contentId, setContentId] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!contentId.trim() || !currentUser) return;

        setLoading(true);
        try {
            // Extract ID if youtube link
            let finalId = contentId.trim();
            if (platform === 'youtube') {
                try {
                    const url = new URL(finalId);
                    if (url.hostname.includes('youtube.com')) {
                        finalId = url.searchParams.get('v') || finalId;
                    } else if (url.hostname.includes('youtu.be')) {
                        finalId = url.pathname.slice(1);
                    }
                } catch (err) {
                    // Not a URL, strictly ID possibly
                }
            }

            await WatchService.startSession(roomId, currentUser.uid, platform, finalId);
            onClose();
        } catch (err) {
            console.error("Failed to start session:", err);
            alert("Oturum başlatılamadı.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose} style={{
            position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
            background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000
        }}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{
                background: '#1a1a1a', padding: 25, borderRadius: 12, width: '90%', maxWidth: 500,
                border: '1px solid #333', color: 'white'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
                    <h2 style={{ margin: 0 }}>Ortak İzleme Başlat</h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}><FaTimes size={20} /></button>
                </div>

                <div style={{ display: 'flex', gap: 10, marginBottom: 20, overflowX: 'auto', paddingBottom: 5 }}>
                    <PlatformButton active={platform === 'youtube'} onClick={() => setPlatform('youtube')} icon={<FaYoutube color="#FF0000" />} label="YouTube" />
                    <PlatformButton active={platform === 'netflix'} onClick={() => setPlatform('netflix')} label="Netflix" />
                    <PlatformButton active={platform === 'prime'} onClick={() => setPlatform('prime')} label="Prime" />
                    <PlatformButton active={platform === 'disney'} onClick={() => setPlatform('disney')} label="Disney+" />
                    <PlatformButton active={platform === 'custom'} onClick={() => setPlatform('custom')} icon={<FaVideo />} label="Diğer" />
                </div>

                <form onSubmit={handleSubmit}>
                    <div style={{ marginBottom: 15 }}>
                        <label style={{ display: 'block', marginBottom: 5, fontSize: '0.9rem', color: '#ccc' }}>
                            {platform === 'youtube' ? 'YouTube Bağlantısı veya ID' : 'İçerik Bağlantısı (URL)'}
                        </label>
                        <input
                            type="text"
                            value={contentId}
                            onChange={e => setContentId(e.target.value)}
                            placeholder={platform === 'youtube' ? 'https://www.youtube.com/watch?v=...' : 'https://www.netflix.com/watch/...'}
                            style={{ width: '100%', padding: '10px', borderRadius: 6, border: '1px solid #444', background: '#333', color: 'white' }}
                            required
                        />
                    </div>

                    {platform !== 'youtube' && (
                        <p style={{ fontSize: '0.8rem', color: '#aaa', marginBottom: 15, background: 'rgba(255,255,0,0.1)', padding: 10, borderRadius: 6 }}>
                            ⚠️ Not: Bu platform için senkronizasyon manuel zamanlayıcı ile sağlanır.
                            Video oynatıcı gösterilmez, sadece ortak sayaç görüntülenir.
                        </p>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                        <button type="button" onClick={onClose} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid #444', color: 'white', borderRadius: 6, cursor: 'pointer' }}>İptal</button>
                        <button type="submit" disabled={loading} style={{ padding: '8px 24px', background: '#5865F2', border: 'none', color: 'white', borderRadius: 6, cursor: 'pointer', opacity: loading ? 0.7 : 1 }}>
                            {loading ? 'Başlatılıyor...' : 'Oturumu Başlat'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

function PlatformButton({ active, onClick, icon, label }: any) {
    return (
        <button
            type="button"
            onClick={onClick}
            style={{
                flex: 1, minWidth: 80, padding: 10, borderRadius: 8, border: active ? '2px solid #5865F2' : '1px solid #333',
                background: active ? 'rgba(88, 101, 242, 0.1)' : '#222', color: 'white', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, fontSize: '0.85rem'
            }}
        >
            {icon}
            {label}
        </button>
    );
}
