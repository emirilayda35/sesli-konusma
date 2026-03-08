import { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, limit } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { useSound } from '../contexts/SoundContext';

export interface Message {
    id: string;
    senderId: string;
    senderName: string;
    content: string;
    type: 'text' | 'audio' | 'gif';
    createdAt: any;
    photoURL?: string;
    mediaUrl?: string; // e.g. GIF image URL
}

export function useRoomMessages(roomId: string) {
    const { currentUser, userData } = useAuth();
    const [messages, setMessages] = useState<Message[]>([]);
    const { playSound } = useSound();
    const lastMsgIdRef = useRef<string | null>(null);

    useEffect(() => {
        if (!roomId) return;

        const q = query(
            collection(db, 'rooms', roomId, 'messages'),
            orderBy('createdAt', 'asc'),
            limit(100)
        );

        const unsub = onSnapshot(q, (snapshot) => {
            const newMessages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message));

            // Sound effect for new messages
            if (newMessages.length > 0) {
                const latest = newMessages[newMessages.length - 1];
                if (lastMsgIdRef.current && latest.id !== lastMsgIdRef.current && latest.senderId !== currentUser?.uid) {
                    playSound('notification');
                }
                lastMsgIdRef.current = latest.id;
            }

            setMessages(newMessages);
        });

        return () => unsub();
    }, [roomId, currentUser?.uid, playSound]);

    const sendMessage = async (text: string) => {
        if (!text.trim() || !currentUser) return;

        await addDoc(collection(db, 'rooms', roomId, 'messages'), {
            senderId: currentUser.uid,
            senderName: userData?.displayName || 'Anonim',
            photoURL: userData?.photoURL || null,
            content: text,
            type: 'text',
            createdAt: serverTimestamp()
        });
        playSound('message_sent');
    };

    const sendMediaMessage = async (type: 'gif', mediaUrl: string, content: string = '') => {
        if (!currentUser) return;

        await addDoc(collection(db, 'rooms', roomId, 'messages'), {
            senderId: currentUser.uid,
            senderName: userData?.displayName || 'Anonim',
            photoURL: userData?.photoURL || null,
            content: content,
            type: type,
            mediaUrl: mediaUrl,
            createdAt: serverTimestamp()
        });
        playSound('message_sent');
    };

    return { messages, sendMessage, sendMediaMessage };
}
