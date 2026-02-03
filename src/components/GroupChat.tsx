import React, { useState, useEffect, useRef } from 'react';
import { FaPaperPlane, FaMicrophone, FaStop, FaTrash, FaVolumeUp, FaChevronLeft } from 'react-icons/fa';
import { useUI } from '../contexts/UIContext';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, doc, where, deleteDoc, setDoc, updateDoc } from 'firebase/firestore';
import UserContextMenu from './UserContextMenu';
import { useSound } from '../contexts/SoundContext';
import '../styles/contextMenu.css';

interface Message {
    id: string;
    senderId: string;
    senderName: string;
    content: string;
    type: 'text' | 'audio';
    createdAt: any;
}

export default function GroupChat({ groupId, onBack }: { groupId: string, onBack?: () => void }) {
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
    const { playSound } = useSound();
    const lastMsgIdRef = useRef<string | null>(null);

    const [groupName, setGroupName] = useState('');

    useEffect(() => {
        const q = query(
            collection(db, 'groups', groupId, 'messages'),
            orderBy('createdAt', 'asc')
        );
        const unsub = onSnapshot(q, (snapshot) => {
            const newMessages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message));

            // Notification for new incoming messages
            if (newMessages.length > 0) {
                const latest = newMessages[newMessages.length - 1];
                if (lastMsgIdRef.current && latest.id !== lastMsgIdRef.current && latest.senderId !== currentUser?.uid) {
                    playSound('notification');
                }
                lastMsgIdRef.current = latest.id;
            }

            setMessages(newMessages);
        });

        const unsubGroup = onSnapshot(doc(db, 'groups', groupId), (docSnap) => {
            if (docSnap.exists()) {
                setGroupName(docSnap.data().name);
                const memberUids = docSnap.data().members || [];
                if (memberUids.length > 0) {
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
    }, [groupId, currentUser?.uid, playSound]);

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

        // Update group document for global notifications
        await updateDoc(doc(db, 'groups', groupId), {
            lastMessage: {
                text: text,
                senderName: userData?.displayName || 'Anonim',
                senderId: currentUser.uid,
                timestamp: serverTimestamp()
            }
        });

        playSound('message_sent');
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

                // Update group document for global notifications
                await updateDoc(doc(db, 'groups', groupId), {
                    lastMessage: {
                        text: '[Sesli Mesaj]',
                        senderName: userData?.displayName || 'Anonim',
                        senderId: currentUser?.uid,
                        timestamp: serverTimestamp()
                    }
                });

                playSound('message_sent');
                stream.getTracks().forEach(t => t.stop());
            };

            recorder.start();
            setIsRecording(true);
            setTimeout(() => { if (recorder.state === 'recording') stopRecording(); }, 30000);
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
                    playSound('click');
                } catch (err) {
                    console.error("Error deleting message:", err);
                }
            },
            "Sil",
            true
        );
    };

    const handleAvatarClick = (senderId: string, event: React.MouseEvent) => {
        if (senderId === currentUser?.uid) return;
        event.stopPropagation();
        playSound('click');
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
            playSound('call_start');
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
            playSound('call_start');
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
                playSound('click');
            },
            'Engelle',
            true
        );
    };

    const handleJoinVoice = async () => {
        playSound('click');
        const voiceRoomId = `group_voice_${groupId}`;
        try {
            const roomRef = doc(db, 'rooms', voiceRoomId);
            await setDoc(roomRef, {
                name: `${groupName} (Sesli Kanal)`,
                type: 'voice',
                groupId: groupId,
                isGroupRoom: true,
                createdAt: serverTimestamp()
            }, { merge: true });

            window.dispatchEvent(new CustomEvent('select_room', { detail: { roomId: voiceRoomId } }));
        } catch (err) {
            console.error('Error joining group voice:', err);
        }
    };

    const blobToBase64 = (blob: Blob): Promise<string> => {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
        });
    };

    return (
        <div className="chat-container" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'transparent' }}>
            <style>{`
                .messages-list {
                    -webkit-overflow-scrolling: touch;
                    touch-action: pan-y;
                }
            `}</style>
            <div className="chat-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    {onBack && (
                        <button className="back-button" onClick={() => { playSound('click'); onBack(); }} style={{ marginBottom: 0, background: 'rgba(255,255,255,0.1)', padding: '8px 12px', borderRadius: '8px', color: 'white' }}>
                            <FaChevronLeft />
                            <span>Geri</span>
                        </button>
                    )}
                </div>
                <button
                    onClick={handleJoinVoice}
                    className="btn-primary"
                    style={{ padding: '6px 15px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                    <FaVolumeUp /> SESLİ KANAL
                </button>
            </div>
            <div className="messages-list" style={{ flex: '1 1 0', overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
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
                                    <img src={profile.photoURL} alt="" className="message-avatar avatar" />
                                ) : (
                                    <div className="message-avatar-placeholder avatar">
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

            {/* Input Form */}
            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    if (inputText.trim()) {
                        playSound('click');
                        handleSendText();
                    }
                }}
                className="chat-input-wrapper"
                style={{ padding: '20px', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', gap: '10px' }}
            >
                <input
                    type="text"
                    className="settings-input"
                    style={{ margin: 0, borderRadius: '8px', flex: 1 }}
                    placeholder="Bir mesaj yaz..."
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyPress={(e) => {
                        // Keep legacy handler just in case, but form submit should handle it
                    }}
                />

                <button
                    type="button"
                    onClick={() => {
                        playSound('click');
                        isRecording ? stopRecording() : startRecording();
                    }}
                    style={{
                        width: '40px', height: '40px', borderRadius: '50%', border: 'none',
                        background: isRecording ? 'var(--danger)' : 'var(--bg-accent)', color: 'white', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}
                >
                    {isRecording ? <FaStop /> : <FaMicrophone />}
                </button>

                <button
                    type="submit"
                    style={{
                        width: '40px', height: '40px', borderRadius: '8px', border: 'none',
                        background: 'var(--brand)', color: 'white', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}
                >
                    <FaPaperPlane />
                </button>
            </form>

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
