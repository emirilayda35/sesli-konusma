import React, { useEffect, useState } from 'react';
import { db } from '../firebase';
import { doc, onSnapshot, deleteDoc } from 'firebase/firestore';
import { useSound } from '../contexts/SoundContext';
import { useUI } from '../contexts/UIContext';
import { FaPhoneSlash } from 'react-icons/fa';
import { useLanguage } from '../contexts/LanguageContext';

interface CallDialingOverlayProps {
    roomId: string;
    calleeName: string;
    onCancel: () => void;
    onAccepted: (roomId: string) => void;
}

export default function CallDialingOverlay({ roomId, calleeName, onCancel, onAccepted }: CallDialingOverlayProps) {
    const { playSound } = useSound();
    const { showAlert } = useUI();
    const { t } = useLanguage();
    const [dots, setDots] = useState('');

    useEffect(() => {
        const interval = setInterval(() => {
            setDots(d => d.length >= 3 ? '' : d + '.');
        }, 500);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        const unsub = onSnapshot(doc(db, 'rooms', roomId), (snap) => {
            if (!snap.exists()) {
                // Room was deleted
                onCancel();
                return;
            }
            const data = snap.data();
            if (data.status === 'accepted') {
                playSound('notification');
                onAccepted(roomId);
            } else if (data.status === 'declined') {
                showAlert(t('call'), t('call_declined', { name: calleeName }));
                onCancel();
                // Optionally delete the room docs here
            }
        });
        return () => unsub();
    }, [roomId, calleeName, onAccepted, onCancel, playSound, showAlert]);

    const handleEndCall = async () => {
        try {
            await deleteDoc(doc(db, 'rooms', roomId));
            onCancel();
        } catch (error) {
            console.error('Error ending call', error);
        }
    };

    return (
        <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(20,20,25,0.95)', backdropFilter: 'blur(10px)',
            zIndex: 1000, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', color: 'white'
        }}>
            <div style={{
                width: 120, height: 120, borderRadius: '50%', background: 'var(--brand)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 48, fontWeight: 'bold', marginBottom: 24,
                boxShadow: '0 0 40px rgba(88,101,242,0.4)',
                animation: 'pulse 1.5s infinite'
            }}>
                {calleeName.charAt(0).toUpperCase()}
            </div>

            <h2 style={{ margin: '0 0 10px 0', fontSize: '2rem' }}>{calleeName}</h2>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '1.2rem', marginBottom: 40 }}>
                {t('calling')}{dots}
            </p>

            <button
                onClick={handleEndCall}
                style={{
                    width: 64, height: 64, borderRadius: '50%', border: 'none',
                    background: 'var(--danger)', color: 'white', fontSize: 24,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', boxShadow: '0 4px 15px rgba(242, 63, 66, 0.4)',
                    transition: 'transform 0.2s'
                }}
                title={t('end_call')}
            >
                <FaPhoneSlash />
            </button>

            <style>{`
                @keyframes pulse {
                    0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(88,101,242,0.7); }
                    70% { transform: scale(1); box-shadow: 0 0 0 30px rgba(88,101,242,0); }
                    100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(88,101,242,0); }
                }
            `}</style>
        </div>
    );
}
