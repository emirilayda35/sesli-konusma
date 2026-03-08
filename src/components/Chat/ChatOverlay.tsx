import React, { useEffect, useState } from 'react';
import { useRoomMessages, type Message } from '../../hooks/useRoomMessages';
import { AnimatePresence, motion } from 'framer-motion';

interface ChatOverlayProps {
    roomId: string;
}

export default function ChatOverlay({ roomId }: ChatOverlayProps) {
    const { messages } = useRoomMessages(roomId);
    const [visibleMessages, setVisibleMessages] = useState<Message[]>([]);

    useEffect(() => {
        if (messages.length === 0) return;
        const latest = messages[messages.length - 1];

        // Prevent duplicate adds if useEffect fires multiple times
        setVisibleMessages(prev => {
            if (prev.some(m => m.id === latest.id)) return prev;
            return [...prev, latest].slice(-5); // Keep last 5
        });

        // Remove this specific message after delay
        const timer = setTimeout(() => {
            setVisibleMessages(prev => prev.filter(m => m.id !== latest.id));
        }, 6000);

        return () => clearTimeout(timer);
    }, [messages]);

    return (
        <div className="chat-overlay" style={{
            position: 'absolute',
            bottom: '20px', left: '20px', width: '400px',
            pointerEvents: 'none',
            zIndex: 50,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
            gap: '8px'
        }}>
            <AnimatePresence mode='popLayout'>
                {visibleMessages.map((msg) => (
                    <motion.div
                        key={msg.id}
                        layout
                        initial={{ opacity: 0, y: 20, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                        transition={{ type: "spring", stiffness: 500, damping: 30 }}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            transformOrigin: 'bottom left'
                        }}
                    >
                        <div style={{
                            width: 32, height: 32, borderRadius: '50%', overflow: 'hidden',
                            background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.2)',
                            flexShrink: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                            {msg.photoURL ? (
                                <img src={msg.photoURL} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 12 }}>
                                    {msg.senderName.charAt(0)}
                                </div>
                            )}
                        </div>
                        <div style={{
                            background: 'rgba(0, 0, 0, 0.65)',
                            backdropFilter: 'blur(8px)',
                            padding: '8px 14px',
                            borderRadius: '16px',
                            borderBottomLeftRadius: '4px',
                            color: 'white',
                            textShadow: '0 1px 2px rgba(0,0,0,0.8)',
                            fontSize: '0.95rem',
                            border: '1px solid rgba(255,255,255,0.1)',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
                        }}>
                            <span style={{ fontWeight: 700, color: '#e2b714', marginRight: 6 }}>
                                {msg.senderName}:
                            </span>
                            {msg.type === 'gif' && msg.mediaUrl ? (
                                <div style={{ marginTop: '4px' }}>
                                    <img src={msg.mediaUrl} alt="GIF" style={{ maxWidth: '200px', borderRadius: '8px', display: 'block' }} />
                                </div>
                            ) : (
                                <span>{msg.content}</span>
                            )}
                        </div>
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
}
