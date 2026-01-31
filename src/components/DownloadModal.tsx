import React from 'react';
import { FaWindows, FaApple, FaAndroid, FaTimes } from 'react-icons/fa';
import '../styles/auth.css'; // Reusing auth styles or creating new ones if needed

interface DownloadModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const DownloadModal: React.FC<DownloadModalProps> = ({ isOpen, onClose }) => {
    if (!isOpen) return null;

    const handleDownload = (platform: string) => {
        // Platforma göre indirme linkleri
        let downloadUrl = '';
        if (platform === 'Windows') {
            downloadUrl = '/downloads/SesliKonusma_Setup.exe';
        } else if (platform === 'Android') {
            downloadUrl = '/downloads/sesli-konusma-android.apk';
        } else {
            alert(`${platform} sürümü çok yakında!`);
            return;
        }

        // İndirme işlemini başlat
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = downloadUrl.split('/').pop() || 'download';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Kullanıcıya bilgi ver (Eğer dosya yoksa 404 verecektir ama en azından işlem başlar)
        // Gerçek senaryoda burası bir CDN linki olmalıdır.
    };

    return (
        <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div
                className="modal-content"
                onClick={e => e.stopPropagation()}
                style={{
                    background: 'var(--bg-secondary)',
                    padding: '32px',
                    borderRadius: '16px',
                    width: '400px',
                    maxWidth: '90%',
                    position: 'relative',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                    border: '1px solid var(--bg-tertiary)',
                    textAlign: 'center'
                }}
            >
                <button
                    onClick={onClose}
                    style={{
                        position: 'absolute',
                        top: '16px',
                        right: '16px',
                        color: 'var(--text-muted)',
                        fontSize: '20px',
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer'
                    }}
                >
                    <FaTimes />
                </button>

                <h2 style={{ color: 'var(--text-normal)', marginBottom: '8px', fontSize: '24px' }}>Uygulamayı İndir</h2>
                <p style={{ color: 'var(--text-muted)', marginBottom: '32px' }}>Cihazına uygun sürümü seç ve sohbete başla!</p>

                <div style={{ display: 'grid', gap: '16px' }}>
                    <button
                        onClick={() => handleDownload('Windows')}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '12px',
                            background: '#0078D7', // Windows Blue
                            color: 'white',
                            border: 'none',
                            padding: '12px',
                            borderRadius: '8px',
                            fontSize: '16px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'transform 0.2s'
                        }}
                        onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                        onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
                    >
                        <FaWindows size={24} /> Windows İndir
                    </button>

                    <button
                        onClick={() => handleDownload('iOS')}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '12px',
                            background: 'white', // Apple White (or black depending on theme, standard is often white/black)
                            color: 'black',
                            border: 'none',
                            padding: '12px',
                            borderRadius: '8px',
                            fontSize: '16px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'transform 0.2s'
                        }}
                        onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                        onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
                    >
                        <FaApple size={24} /> iOS İndir
                    </button>

                    <button
                        onClick={() => handleDownload('Android')}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '12px',
                            background: '#3DDC84', // Android Green
                            color: 'white',
                            border: 'none',
                            padding: '12px',
                            borderRadius: '8px',
                            fontSize: '16px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'transform 0.2s'
                        }}
                        onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                        onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
                    >
                        <FaAndroid size={24} /> Android İndir
                    </button>
                </div>
            </div>
        </div>
    );
};

export default DownloadModal;
