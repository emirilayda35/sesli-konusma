import React, { useEffect, useState } from 'react';
import { useRoomMessages, type Message } from '../../hooks/useRoomMessages';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../contexts/AuthContext';

interface BarrageMessage extends Message {
    lane: number;
    duration: number;
}

export default function MessageBarrage({ roomId, isRelative = false }: { roomId: string, isRelative?: boolean }) {
    const { messages } = useRoomMessages(roomId);
    const { currentUser } = useAuth();
    const [activeBarrage, setActiveBarrage] = useState<BarrageMessage[]>([]);
    const LANES = isRelative ? 4 : 8; // Number of horizontal tracks

    useEffect(() => {
        if (messages.length === 0) return;
        const lastMsg = messages[messages.length - 1];

        // Filter out own messages
        if (lastMsg.senderId === currentUser?.uid) return;

        // Loosen the filter slightly (5 seconds instead of 2) to account for network/clock skew
        const msgTime = lastMsg.createdAt?.seconds ? lastMsg.createdAt.seconds * 1000 : Date.now();
        const now = Date.now();
        if (now - msgTime > 5000) return;

        const lane = Math.floor(Math.random() * LANES);
        const duration = isRelative ? (10 + Math.random() * 5) : (12 + Math.random() * 6); // Slightly slower for better readability on big screens

        const newBarrage: BarrageMessage = {
            ...lastMsg,
            lane,
            duration
        };

        setActiveBarrage(prev => {
            if (prev.some(m => m.id === lastMsg.id)) return prev;
            return [...prev, newBarrage];
        });

        // Cleanup after animation duration + buffer
        const cleanup = setTimeout(() => {
            setActiveBarrage(prev => prev.filter(m => m.id !== lastMsg.id));
        }, (duration + 2) * 1000);

        return () => clearTimeout(cleanup);
    }, [messages, roomId, LANES, isRelative, currentUser]);

    return (
        <div className="message-barrage-container" style={{
            position: 'absolute',
            top: isRelative ? '20%' : '60px', // Lowered slightly so it's not behind the header
            left: 0,
            right: 0,
            bottom: 0,
            height: isRelative ? '40%' : '300px',
            pointerEvents: 'none',
            zIndex: 9999, // Extremely high z-index to be above everything
            overflow: 'hidden',
        }}>
            <AnimatePresence>
                {activeBarrage.map((msg) => (
                    <motion.div
                        key={`${msg.id}-${msg.lane}`}
                        initial={{ x: '100vw', opacity: 1 }}
                        animate={{ x: '-200%' }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: msg.duration, ease: "linear" }}
                        style={{
                            position: 'absolute',
                            top: `${msg.lane * (isRelative ? 45 : 35)}px`,
                            whiteSpace: 'nowrap',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            background: 'rgba(0, 0, 0, 0.75)',
                            backdropFilter: 'blur(10px)',
                            padding: '8px 20px',
                            borderRadius: '30px',
                            border: '1px solid rgba(255, 255, 255, 0.25)',
                            color: 'white',
                            fontSize: isRelative ? '1.2rem' : '1rem',
                            fontWeight: 700,
                            boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
                            textShadow: '0 2px 4px rgba(0,0,0,0.5)'
                        }}
                    >
                        {msg.photoURL && (
                            <img
                                src={msg.photoURL}
                                alt=""
                                style={{ width: isRelative ? 32 : 24, height: isRelative ? 32 : 24, borderRadius: '50%', objectFit: 'cover', border: '1px solid rgba(255,255,255,0.4)' }}
                            />
                        )}
                        <span style={{ color: '#e2b714', fontWeight: 800 }}>{msg.senderName}:</span>
                        <span>
                            {msg.type === 'gif' ? '🎬 GIF gönderdi' : msg.content}
                        </span>
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
}
