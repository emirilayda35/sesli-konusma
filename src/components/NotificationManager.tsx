import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, doc, updateDoc, arrayRemove } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { useSound } from '../contexts/SoundContext';
import { FaPhone, FaPhoneSlash, FaComment, FaVideo } from 'react-icons/fa';
import gsap from 'gsap';
import '../styles/notifications.css';

interface Toast {
    id: string;
    title: string;
    message: string;
    type: 'message' | 'call';
    groupId?: string;
    roomId?: string;
}

interface IncomingCall {
    roomId: string;
    callerName: string;
    type: 'voice' | 'video';
}

export default function NotificationManager() {
    const { currentUser, userData } = useAuth();
    const { playSound } = useSound();
    const [toasts, setToasts] = useState<Toast[]>([]);
    const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const mountedAt = useRef(Date.now());
    const groupListeners = useRef<Record<string, () => void>>({});
    const lastNotifiedMsgRef = useRef<Record<string, string>>({});

    useEffect(() => {
        if (!currentUser) return;

        // 1. Listen for calls
        const qCalls = query(
            collection(db, 'rooms'),
            where('participants', 'array-contains', currentUser.uid)
        );

        const unsubCalls = onSnapshot(qCalls, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                const data = change.doc.data();
                // Show if new and created by someone else
                if (change.type === 'added' && data.createdAt?.toMillis() > mountedAt.current && data.createdBy !== currentUser.uid) {
                    setIncomingCall({
                        roomId: change.doc.id,
                        callerName: data.name?.split('&')[0]?.trim() || 'Biri',
                        type: data.type || 'voice'
                    });
                    playSound('call_start');
                }

                // If room deleted, remove incoming call
                if (change.type === 'removed' && incomingCall?.roomId === change.doc.id) {
                    setIncomingCall(null);
                }
            });
        });

        // 2. Listen for messages via groups
        const qGroups = query(
            collection(db, 'groups'),
            where('members', 'array-contains', currentUser.uid)
        );

        const unsubGroups = onSnapshot(qGroups, (snapshot) => {
            snapshot.docs.forEach(groupDoc => {
                const groupData = groupDoc.data();
                const lastMsg = groupData.lastMessage;

                if (lastMsg && lastMsg.senderId !== currentUser.uid && lastMsg.timestamp?.toMillis() > mountedAt.current) {
                    const msgId = `${groupDoc.id}_${lastMsg.timestamp?.toMillis()}`;

                    if (!lastNotifiedMsgRef.current[groupDoc.id] || lastNotifiedMsgRef.current[groupDoc.id] !== msgId) {
                        lastNotifiedMsgRef.current[groupDoc.id] = msgId;

                        addToast({
                            id: msgId,
                            title: groupData.name,
                            message: `${lastMsg.senderName}: ${lastMsg.text}`,
                            type: 'message',
                            groupId: groupDoc.id
                        });

                        playSound('notification');
                        showSystemNotification(groupData.name, `${lastMsg.senderName}: ${lastMsg.text}`);
                    }
                }
            });
        });

        // 3. Request permissions
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }

        return () => {
            unsubCalls();
            unsubGroups();
        };
    }, [currentUser, playSound]);

    const addToast = (toast: Toast) => {
        setToasts(prev => [...prev.slice(-2), toast]); // Keep last 3

        // GSAP Animation happens after render
        setTimeout(() => {
            const el = document.getElementById(`toast-${toast.id}`);
            if (el) {
                gsap.fromTo(el, { x: 100, opacity: 0 }, { x: 0, opacity: 1, duration: 0.5, ease: 'power2.out' });
            }
        }, 0);

        setTimeout(() => {
            removeToast(toast.id);
        }, 5000);
    };

    const removeToast = (id: string) => {
        const el = document.getElementById(`toast-${id}`);
        if (el) {
            gsap.to(el, {
                x: 100, opacity: 0, duration: 0.3, onComplete: () => {
                    setToasts(prev => prev.filter(t => t.id !== id));
                }
            });
        } else {
            setToasts(prev => prev.filter(t => t.id !== id));
        }
    };

    const showSystemNotification = (title: string, body: string) => {
        if (document.visibilityState === 'hidden' && 'Notification' in window && Notification.permission === 'granted') {
            new Notification(title, { body, icon: '/logo192.png' });
        }
    };

    const handleAcceptCall = () => {
        if (!incomingCall) return;
        playSound('click');
        window.dispatchEvent(new CustomEvent('select_room', { detail: { roomId: incomingCall.roomId } }));
        setIncomingCall(null);
    };

    const handleDeclineCall = async () => {
        if (!incomingCall) return;
        playSound('click');
        // Optionally remove yourself from participants or mark as declined
        setIncomingCall(null);
    };

    const handleToastClick = (toast: Toast) => {
        if (toast.groupId) {
            window.dispatchEvent(new CustomEvent('select_group', { detail: { groupId: toast.groupId } }));
        }
        removeToast(toast.id);
    };

    return (
        <>
            {/* Toasts */}
            <div className="notification-toast-container" ref={containerRef}>
                {toasts.map(toast => (
                    <div
                        key={toast.id}
                        id={`toast-${toast.id}`}
                        className="notification-toast"
                        onClick={() => handleToastClick(toast)}
                    >
                        <div className="notification-icon">
                            {toast.type === 'message' ? <FaComment /> : <FaPhone />}
                        </div>
                        <div className="notification-content">
                            <div className="notification-title">{toast.title}</div>
                            <div className="notification-message">{toast.message}</div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Incoming Call Overlay */}
            {incomingCall && (
                <div className="call-overlay">
                    <div className="call-card">
                        <div className="call-avatar">
                            {incomingCall.type === 'video' ? <FaVideo /> : <FaPhone />}
                        </div>
                        <div className="call-name">{incomingCall.callerName}</div>
                        <div className="call-type">Arıyor... ({incomingCall.type === 'video' ? 'Görüntülü' : 'Sesli'})</div>
                        <div className="call-actions">
                            <button className="call-btn decline" onClick={handleDeclineCall}>
                                <FaPhoneSlash />
                            </button>
                            <button className="call-btn accept" onClick={handleAcceptCall}>
                                <FaPhone />
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
