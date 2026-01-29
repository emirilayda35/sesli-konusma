import React, { useState, useEffect, useRef } from 'react';
import { FaPaperPlane, FaMicrophone, FaStop, FaPlay, FaTrash } from 'react-icons/fa';
import { useUI } from '../contexts/UIContext';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, doc, where, deleteDoc, getDocs } from 'firebase/firestore';
import UserContextMenu from './UserContextMenu';
import '../styles/contextMenu.css';

interface Message {
    id: string;
    senderId: string;
    senderName: string;
    content: string;
    type: 'text' | 'audio';
    createdAt: any;
}

export default function GroupChat({ groupId }: { groupId: string }) {
    const { currentUser, userData } = useAuth();
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputText, setInputText] = useState('');
    const [isRecording, setIsRecording] = useState(false);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const scrollRef = useRef<HTMLDivElement>(null);
    const { showConfirm, showAlert } = useUI();
    const [memberProfiles, setMemberProfiles] = useState<Record<string, { name: string, photoURL: string }>>({});
    const [contextMenu, setContextMenu] = useState<{ user: any; position: { x: number; y: number } } | null>(null);

    useEffect(() => {
        const q = query(
            collection(db, 'groups', groupId, 'messages'),
            orderBy('createdAt', 'asc')
        );
        const unsub = onSnapshot(q, (snapshot) => {
            setMessages(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message)));
        });

        // Listen for group member profiles to keep names updated in real-time
        const unsubGroup = onSnapshot(doc(db, 'groups', groupId), (docSnap) => {
            if (docSnap.exists()) {
                const memberUids = docSnap.data().members || [];
                if (memberUids.length > 0) {
                    // Firebase 'in' query supports up to 30 items
                    const qMembers = query(collection(db, 'users'), where('uid', 'in', memberUids.slice(0, 30)));
                    return onSnapshot(qMembers, (snap) => {
                        const profiles: Record<string, { name: string, photoURL: string }> = {};
                        snap.docs.forEach(d => {
                            const data = d.data();
                            profiles[data.uid] = {
                                name: data.displayName || 'İsimsiz',
                                photoURL: data.photoURL || ''
                            };
                        });
                        setMemberProfiles(profiles);
                    });
                }
            }
        });

        return () => {
            unsub();
            unsubGroup();
        };
    }, [groupId]);

    useEffect(() => {
        scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSendText = async () => {
        if (!inputText.trim() || !currentUser) return;
        const text = inputText;
        setInputText('');
        await addDoc(collection(db, 'groups', groupId, 'messages'), {
            senderId: currentUser.uid,
            senderName: userData?.displayName || 'Anonim',
            content: text,
            type: 'text',
            createdAt: serverTimestamp()
        });
    };

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const recorder = new MediaRecorder(stream);
            mediaRecorderRef.current = recorder;
            chunksRef.current = [];

            recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
            recorder.onstop = async () => {
                const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
                const base64Audio = await blobToBase64(audioBlob);

                await addDoc(collection(db, 'groups', groupId, 'messages'), {
                    senderId: currentUser?.uid,
                    senderName: userData?.displayName || 'Anonim',
                    content: base64Audio,
                    type: 'audio',
                    createdAt: serverTimestamp()
                });
                stream.getTracks().forEach(t => t.stop());
            };

            recorder.start();
            setIsRecording(true);
            setTimeout(() => { if (recorder.state === 'recording') stopRecording(); }, 30000); // 30s limit
        } catch (err) {
            console.error(err);
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
        }
    };

    const handleDeleteMessage = (messageId: string) => {
        showConfirm(
            "Mesajı Sil",
            "Bu mesajı silmek istediğinden emin misin? Bu işlem geri alınamaz.",
            async () => {
                try {
                    await deleteDoc(doc(db, 'groups', groupId, 'messages', messageId));
                } catch (err) {
                    console.error("Error deleting message:", err);
                }
            },
            "Sil",
            true
        );
    };

    const handleAvatarClick = (senderId: string, event: React.MouseEvent) => {
        if (senderId === currentUser?.uid) return; // Don't show menu for own messages

        event.stopPropagation();
        const rect = (event.target as HTMLElement).getBoundingClientRect();
        const profile = memberProfiles[senderId];

        setContextMenu({
            user: {
                uid: senderId,
                displayName: profile?.name || 'Unknown',
                photoURL: profile?.photoURL,
                isOnline: false
            },
            position: { x: rect.right + 10, y: rect.top }
        });
    };

    const handleSendMessage = async (userId: string) => {
        showAlert('Mesaj', 'Zaten bir grup sohbetindesiniz!');
    };

    const handleVoiceCall = async (userId: string) => {
        try {
            const profile = memberProfiles[userId];
            const roomName = `${userData?.displayName} & ${profile?.name || 'Unknown'}`;

            const roomRef = await addDoc(collection(db, 'rooms'), {
                name: roomName,
                type: 'voice',
                participants: [currentUser?.uid, userId],
                createdBy: currentUser?.uid,
                createdAt: serverTimestamp()
            });

            // Removed blocking alert to prevent grey screen overlay

            window.dispatchEvent(new CustomEvent('select_room', { detail: { roomId: roomRef.id } }));
        } catch (error) {
            console.error('Voice call error:', error);
            showAlert('Hata', 'Sesli arama başlatılamadı.');
        }
    };

    const handleVideoCall = async (userId: string) => {
        try {
            const profile = memberProfiles[userId];
            const roomName = `${userData?.displayName} & ${profile?.name || 'Unknown'}`;

            const roomRef = await addDoc(collection(db, 'rooms'), {
                name: roomName,
                type: 'video',
                participants: [currentUser?.uid, userId],
                createdBy: currentUser?.uid,
                createdAt: serverTimestamp()
            });

            // Removed blocking alert to prevent grey screen overlay

            window.dispatchEvent(new CustomEvent('select_room', { detail: { roomId: roomRef.id } }));
        } catch (error) {
            console.error('Video call error:', error);
            showAlert('Hata', 'Görüntülü arama başlatılamadı.');
        }
    };

    const handleBlockUser = async (userId: string) => {
        showConfirm(
            'Kullanıcıyı Engelle',
            'Bu kullanıcıyı engellemek istediğinizden emin misiniz?',
            async () => {
                showAlert('Engellendi', 'Kullanıcı başarıyla engellendi.');
            },
            'Engelle',
            true
        );
    };

    const blobToBase64 = (blob: Blob): Promise<string> => {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
        });
    };

    return (
        <div className="chat-container" style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-primary)' }}>
            <div className="messages-list" style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {messages.map(msg => {
                    const profile = memberProfiles[msg.senderId];
                    const isOwn = msg.senderId === currentUser?.uid;

                    return (
                        <div key={msg.id} style={{
                            display: 'flex',
                            gap: '10px',
                            alignSelf: isOwn ? 'flex-end' : 'flex-start',
                            flexDirection: isOwn ? 'row-reverse' : 'row',
                            maxWidth: '80%'
                        }}>
                            <div
                                className="message-avatar-container"
                                onClick={(e) => handleAvatarClick(msg.senderId, e)}
                                style={{ cursor: isOwn ? 'default' : 'pointer' }}
                            >
                                {profile?.photoURL ? (
                                    <img src={profile.photoURL} alt="" className="message-avatar" />
                                ) : (
                                    <div className="message-avatar-placeholder">
                                        {(profile?.name || msg.senderName || '?')[0].toUpperCase()}
                                    </div>
                                )}
                            </div>
                            <div style={{
                                background: isOwn ? 'linear-gradient(135deg, #4752c4, #5865F2)' : 'var(--bg-tertiary)',
                                padding: '12px 16px',
                                borderRadius: isOwn ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                                position: 'relative',
                                boxShadow: '0 4px 15px rgba(0, 0, 0, 0.15)',
                                transition: 'all 0.2s ease',
                                border: isOwn ? 'none' : '1px solid var(--bg-accent)'
                            }}>
                                <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)', marginBottom: '4px' }}>
                                    {profile?.name || msg.senderName}
                                </div>
                                {msg.type === 'text' ? (
                                    <div>{msg.content}</div>
                                ) : (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                                        <audio
                                            src={msg.content}
                                            controls
                                            style={{
                                                height: '35px',
                                                borderRadius: '30px',
                                                opacity: 0.9
                                            }}
                                        />
                                    </div>
                                )}

                                {isOwn && (
                                    <button
                                        className="message-delete-btn"
                                        onClick={() => handleDeleteMessage(msg.id)}
                                        title="Mesajı sil"
                                    >
                                        <FaTrash size={10} />
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}
                <div ref={scrollRef} />
            </div>

            <div className="chat-input-wrapper" style={{ padding: '20px', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input
                    type="text"
                    className="settings-input"
                    style={{ margin: 0, borderRadius: '8px' }}
                    placeholder="Bir mesaj yaz..."
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSendText()}
                />

                <button
                    onClick={isRecording ? stopRecording : startRecording}
                    style={{
                        width: '40px', height: '40px', borderRadius: '50%', border: 'none',
                        background: isRecording ? 'var(--danger)' : 'var(--bg-accent)', color: 'white', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}
                >
                    {isRecording ? <FaStop /> : <FaMicrophone />}
                </button>

                <button
                    onClick={handleSendText}
                    style={{
                        width: '40px', height: '40px', borderRadius: '8px', border: 'none',
                        background: 'var(--brand)', color: 'white', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}
                >
                    <FaPaperPlane />
                </button>
            </div>

            {contextMenu && (
                <UserContextMenu
                    user={contextMenu.user}
                    position={contextMenu.position}
                    onClose={() => setContextMenu(null)}
                    onSendMessage={handleSendMessage}
                    onVoiceCall={handleVoiceCall}
                    onVideoCall={handleVideoCall}
                    onBlockUser={handleBlockUser}
                />
            )}
        </div>
    );
}
