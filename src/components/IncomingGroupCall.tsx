import React, { useEffect, useState } from 'react';
import { FaPhone, FaPhoneSlash, FaUsers } from 'react-icons/fa';
import { useSound } from '../contexts/SoundContext';
import { useLanguage } from '../contexts/LanguageContext';

interface IncomingGroupCallProps {
    callId: string;
    callerName: string;
    callerPhotoURL?: string;
    groupId: string;
    roomId: string;
    onAccept: (roomId: string) => void;
    onDecline: () => void;
}

export default function IncomingGroupCall({
    callId,
    callerName,
    callerPhotoURL,
    groupId,
    roomId,
    onAccept,
    onDecline,
}: IncomingGroupCallProps) {
    const { playSound } = useSound();
    const { t } = useLanguage();
    const [timeLeft, setTimeLeft] = useState(30);

    // Auto-decline after 30s
    useEffect(() => {
        const timer = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    clearInterval(timer);
                    onDecline();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(timer);
    }, [onDecline]);

    // Try to play ringtone on arrival
    useEffect(() => {
        playSound('notification');
    }, [playSound]);

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(10,10,15,0.97)', backdropFilter: 'blur(12px)',
            zIndex: 999999, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', color: 'white',
            gap: 16,
        }}>
            <style>{`
                @keyframes ringPulse {
                    0%   { transform: scale(0.93); box-shadow: 0 0 0 0 rgba(35,165,89,0.7); }
                    70%  { transform: scale(1);    box-shadow: 0 0 0 36px rgba(35,165,89,0); }
                    100% { transform: scale(0.93); box-shadow: 0 0 0 0 rgba(35,165,89,0); }
                }
            `}</style>

            {/* Caller avatar */}
            <div style={{
                width: 120, height: 120, borderRadius: '50%',
                background: 'var(--brand, #5865F2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 52, fontWeight: 'bold',
                animation: 'ringPulse 1.5s ease-in-out infinite',
                marginBottom: 8, overflow: 'hidden', flexShrink: 0,
            }}>
                {callerPhotoURL ? (
                    <img src={callerPhotoURL} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                    callerName.charAt(0).toUpperCase()
                )}
            </div>

            <p style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.55)', margin: 0, letterSpacing: 1 }}>
                {t('group_voice_call_label')}
            </p>
            <h2 style={{ margin: '2px 0 4px 0', fontSize: '1.7rem', fontWeight: 700 }}>{callerName}</h2>
            <p style={{ color: 'rgba(255,255,255,0.55)', margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
                <FaUsers size={14} /> {t('group_call_invite_title')}
            </p>
            <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.3)' }}>{t('auto_decline_message', { time: timeLeft })}</p>

            <div style={{ display: 'flex', gap: 32, marginTop: 12 }}>
                {/* Decline */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                    <button
                        onClick={onDecline}
                        style={{
                            width: 68, height: 68, borderRadius: '50%', border: 'none',
                            background: '#f23f42', color: 'white', fontSize: 24,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', boxShadow: '0 4px 20px rgba(242,63,66,0.4)',
                            transition: 'transform 0.15s, box-shadow 0.15s',
                        }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.08)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; }}
                        title={t('decline')}
                    >
                        <FaPhoneSlash />
                    </button>
                    <span style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)' }}>{t('decline')}</span>
                </div>

                {/* Accept */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                    <button
                        onClick={() => onAccept(roomId)}
                        style={{
                            width: 68, height: 68, borderRadius: '50%', border: 'none',
                            background: '#23A559', color: 'white', fontSize: 24,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', boxShadow: '0 4px 20px rgba(35,165,89,0.4)',
                            transition: 'transform 0.15s, box-shadow 0.15s',
                        }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.08)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; }}
                        title={t('join')}
                    >
                        <FaPhone />
                    </button>
                    <span style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)' }}>{t('join')}</span>
                </div>
            </div>
        </div>
    );
}
