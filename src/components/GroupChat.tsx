import React, { useState, useEffect, useRef } from 'react';
import { useUI } from '../contexts/UIContext';
import { useAuth } from '../contexts/AuthContext';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, doc, where, deleteDoc, setDoc, updateDoc, getDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase';
import { FaPaperPlane, FaMicrophone, FaStop, FaTrash, FaVolumeUp, FaChevronLeft, FaCheckDouble, FaPaperclip, FaReply, FaRegSmile, FaTimes, FaSmile, FaSearch, FaPen, FaCheck, FaPhone, FaUserPlus } from 'react-icons/fa';
import UserContextMenu from './UserContextMenu';
import EmojiPicker from 'emoji-picker-react';
import { useSound } from '../contexts/SoundContext';
import { useLanguage } from '../contexts/LanguageContext';
import '../styles/contextMenu.css';

const TENOR_API_KEY = 'LIVDSRZULELA';

interface Message {
    id: string;
    senderId: string;
    senderName: string;
    content: string;
    type: 'text' | 'audio' | 'media' | 'gif';
    createdAt: any;
    readBy?: string[];
    mediaUrl?: string;
    mediaType?: 'image' | 'video' | 'file';
    fileName?: string;
    replyTo?: string;
    reactions?: Record<string, string[]>; // emoji -> array of user IDs
}

const renderMessageText = (text: string) => {
    // Basic regex for URLs
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = text.split(urlRegex);

    return (
        <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {parts.map((part, i) => {
                if (part.match(urlRegex)) {
                    // Check if it's a YouTube link
                    const ytRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
                    const ytMatch = part.match(ytRegex);

                    if (ytMatch && ytMatch[1]) {
                        const videoId = ytMatch[1];
                        return (
                            <span key={i}>
                                <a href={part} target="_blank" rel="noopener noreferrer" style={{ color: '#ffe082', textDecoration: 'underline', wordBreak: 'break-all' }}>{part}</a>
                                <div style={{ marginTop: '8px', width: '100%', maxWidth: '400px' }}>
                                    <iframe
                                        width="100%"
                                        height="225"
                                        style={{ borderRadius: '8px', border: 'none', background: '#000' }}
                                        src={`https://www.youtube.com/embed/${videoId}`}
                                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                        allowFullScreen
                                        title="YouTube Preview"
                                    />
                                </div>
                            </span>
                        );
                    }

                    // Check if it's a Spotify track link
                    const spotifyRegex = /spotify\.com\/track\/([a-zA-Z0-9]+)/i;
                    const spotifyMatch = part.match(spotifyRegex);
                    if (spotifyMatch && spotifyMatch[1]) {
                        const trackId = spotifyMatch[1];
                        return (
                            <span key={i}>
                                <a href={part} target="_blank" rel="noopener noreferrer" style={{ color: '#ffe082', textDecoration: 'underline', wordBreak: 'break-all' }}>{part}</a>
                                <div style={{ marginTop: '8px', width: '100%', maxWidth: '400px' }}>
                                    <iframe
                                        style={{ borderRadius: '12px', border: 'none' }}
                                        src={`https://open.spotify.com/embed/track/${trackId}?utm_source=generator`}
                                        width="100%"
                                        height="152"
                                        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                                        loading="lazy"
                                    />
                                </div>
                            </span>
                        );
                    }

                    // Generic link
                    return <a key={i} href={part} target="_blank" rel="noopener noreferrer" style={{ color: '#ffe082', textDecoration: 'underline', wordBreak: 'break-all' }}>{part}</a>;
                }
                return <span key={i}>{part}</span>;
            })}
        </div>
    );
};

export default function GroupChat({ groupId, onBack }: { groupId: string, onBack?: () => void }) {
    const { currentUser, userData } = useAuth();
    const { t } = useLanguage();
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputText, setInputText] = useState('');
    const [isRecording, setIsRecording] = useState(false);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const scrollRef = useRef<HTMLDivElement>(null);
    const { showConfirm, showAlert } = useUI();
    const [memberProfiles, setMemberProfiles] = useState<Record<string, { name: string, photoURL: string }>>({});

    const [selectedFileForUpload, setSelectedFileForUpload] = useState<File | null>(null);
    const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
    const [contextMenu, setContextMenu] = useState<{ user: any; position: { x: number; y: number } } | null>(null);
    const { playSound } = useSound();
    const lastMsgIdRef = useRef<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploadProgress, setUploadProgress] = useState<number | null>(null);
    const [replyingToMessage, setReplyingToMessage] = useState<Message | null>(null);
    const [showEmojiPicker, setShowEmojiPicker] = useState<string | null>(null);

    const [showChatEmojiPicker, setShowChatEmojiPicker] = useState(false);
    const [showGifPicker, setShowGifPicker] = useState(false);
    const [gifSearch, setGifSearch] = useState('');
    const [gifs, setGifs] = useState<any[]>([]);

    const [pendingAudioBlob, setPendingAudioBlob] = useState<Blob | null>(null);
    const [pendingAudioUrl, setPendingAudioUrl] = useState<string | null>(null);
    const pendingAudioStreamRef = useRef<MediaStream | null>(null);

    const [groupName, setGroupName] = useState('');
    const [groupMembers, setGroupMembers] = useState<string[]>([]);
    const [joinedAtMap, setJoinedAtMap] = useState<Record<string, number>>({}); // uid -> ms timestamp
    const [isEditingName, setIsEditingName] = useState(false);
    const [editNameValue, setEditNameValue] = useState('');

    // Add member modal state
    const [showAddMemberModal, setShowAddMemberModal] = useState(false);
    const [friendSearch, setFriendSearch] = useState('');
    const [selectedFriendUids, setSelectedFriendUids] = useState<Set<string>>(new Set());
    const [allFriendProfiles, setAllFriendProfiles] = useState<Record<string, { name: string, photoURL: string }>>({});


    const handleRenameGroup = async () => {
        if (!editNameValue.trim() || editNameValue.trim() === groupName) {
            setIsEditingName(false);
            return;
        }
        try {
            await updateDoc(doc(db, 'groups', groupId), { name: editNameValue.trim() });
        } catch (err) {
            console.error('Rename error:', err);
        }
        setIsEditingName(false);
    };

    // Load friends list for the add-member modal
    useEffect(() => {
        if (!userData?.friends?.length) return;
        const friendUids: string[] = userData.friends.slice(0, 30);
        const q = query(collection(db, 'users'), where('uid', 'in', friendUids));
        const unsub = onSnapshot(q, (snap) => {
            const profiles: Record<string, { name: string, photoURL: string }> = {};
            snap.docs.forEach(d => {
                const data = d.data();
                profiles[data.uid] = { name: data.displayName || 'İsimsiz', photoURL: data.photoURL || '' };
            });
            setAllFriendProfiles(profiles);
        });
        return () => unsub();
    }, [userData?.friends]);

    const handleAddMembers = async () => {
        if (!currentUser || selectedFriendUids.size === 0) return;
        const toAdd = Array.from(selectedFriendUids).filter(uid => !groupMembers.includes(uid));
        if (toAdd.length === 0) { setShowAddMemberModal(false); return; }
        try {
            const now = Date.now();
            const joinedAtUpdates: Record<string, number> = {};
            toAdd.forEach(uid => { joinedAtUpdates[`joinedAt.${uid}`] = now; });
            await updateDoc(doc(db, 'groups', groupId), {
                members: [...groupMembers, ...toAdd],
                ...joinedAtUpdates,
            });
            // Post a system message about the new members
            const names = toAdd.map(uid => allFriendProfiles[uid]?.name || 'Kullanıcı').join(', ');
            await addDoc(collection(db, 'groups', groupId, 'messages'), {
                senderId: 'system',
                senderName: 'Sistem',
                content: `${userData?.displayName || 'Biri'} gruba şu kişileri ekledi: ${names}`,
                type: 'text',
                createdAt: serverTimestamp(),
                readBy: [currentUser.uid],
                reactions: {}
            });
        } catch (err) {
            console.error('Add member error:', err);
        }
        setSelectedFriendUids(new Set());
        setShowAddMemberModal(false);
    };

    const handleGroupVoiceCall = async () => {
        if (!currentUser) return;
        playSound('click');

        const voiceRoomId = `group_voice_${groupId}`;
        try {
            // Ensure the voice room doc exists
            await setDoc(doc(db, 'rooms', voiceRoomId), {
                name: `${groupName} (Sesli Kanal)`,
                type: 'voice',
                groupId: groupId,
                isGroupRoom: true,
                createdAt: serverTimestamp()
            }, { merge: true });

            // Write the group call signal to Firestore — receivers will pick this up and ring
            const responses: Record<string, string> = {};
            responses[currentUser.uid] = 'accepted'; // Caller auto-accepts
            const callRef = await addDoc(collection(db, 'groupCalls'), {
                callerId: currentUser.uid,
                callerName: userData?.displayName || 'Kullanıcı',
                callerPhotoURL: userData?.photoURL || '',
                groupId: groupId,
                roomId: voiceRoomId,
                members: groupMembers,
                responses,
                status: 'ringing',
                createdAt: serverTimestamp(),
            });

            // Auto-end the call signal after 35 seconds if still ringing
            setTimeout(async () => {
                try {
                    const { getDoc: gd, updateDoc: ud } = await import('firebase/firestore');
                    const snap = await gd(callRef);
                    if (snap.exists() && snap.data().status === 'ringing') {
                        await ud(callRef, { status: 'ended' });
                    }
                } catch (_) { /* ignore */ }
            }, 35000);

            // Navigate the caller to the voice room immediately
            window.dispatchEvent(new CustomEvent('select_room', { detail: { roomId: voiceRoomId } }));
        } catch (err) {
            console.error('Error starting group voice call:', err);
            showAlert('Hata', 'Sesli görüşme başlatılamadı.');
        }
    };


    useEffect(() => {
        console.log("GroupChat mounted for group:", groupId, "User ID:", currentUser?.uid);
        const q = query(
            collection(db, 'groups', groupId, 'messages'),
            orderBy('createdAt', 'asc')
        );
        const unsub = onSnapshot(q, (snapshot) => {
            const newMessages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message));

            // Notification and Read Receipt for new incoming messages
            const unreadMessagesToMark = [];

            if (newMessages.length > 0) {
                const latest = newMessages[newMessages.length - 1];
                if (lastMsgIdRef.current && latest.id !== lastMsgIdRef.current && latest.senderId !== currentUser?.uid) {
                    playSound('notification');
                }
                lastMsgIdRef.current = latest.id;

                for (const msg of newMessages) {
                    if (msg.senderId !== currentUser?.uid && currentUser?.uid && (!msg.readBy || !msg.readBy.includes(currentUser.uid))) {
                        // We need to mark this as read by the current user
                        unreadMessagesToMark.push(msg.id);
                    }
                }
            }

            // Store ALL messages — filtering happens at render time so joinedAtMap is always current
            setMessages(newMessages);

            // Batch update read status for performance
            if (unreadMessagesToMark.length > 0 && currentUser?.uid) {
                unreadMessagesToMark.forEach(async (id) => {
                    import('firebase/firestore').then(({ updateDoc, doc, arrayUnion }) => {
                        updateDoc(doc(db, 'groups', groupId, 'messages', id), {
                            readBy: arrayUnion(currentUser.uid)
                        }).catch(e => console.error("Error updating read status", e));
                    });
                });
            }
        });

        const unsubGroup = onSnapshot(doc(db, 'groups', groupId), (docSnap) => {
            if (docSnap.exists()) {
                setGroupName(docSnap.data().name);
                const memberUids: string[] = docSnap.data().members || [];
                setGroupMembers(memberUids);
                // Store joinedAt timestamps
                const jat: Record<string, number> = docSnap.data().joinedAt || {};
                setJoinedAtMap(jat);
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
        if (!showGifPicker) return;
        const fetchGifs = async () => {
            try {
                const endpoint = gifSearch.trim()
                    ? `https://g.tenor.com/v1/search?q=${encodeURIComponent(gifSearch)}&key=${TENOR_API_KEY}&limit=20`
                    : `https://g.tenor.com/v1/trending?key=${TENOR_API_KEY}&limit=20`;
                const res = await fetch(endpoint);
                const data = await res.json();
                if (data && data.results) {
                    setGifs(data.results);
                }
            } catch (error) {
                console.error("Error fetching GIFs:", error);
            }
        };
        const timeoutId = setTimeout(fetchGifs, 500); // Debounce
        return () => clearTimeout(timeoutId);
    }, [gifSearch, showGifPicker]);

    useEffect(() => {
        const timeoutId = setTimeout(() => {
            if (scrollRef.current) {
                scrollRef.current.scrollIntoView({ behavior: 'smooth' });
            }
        }, 100);
        return () => clearTimeout(timeoutId);
    }, [messages]);

    const handleSendText = async () => {
        if (!inputText.trim() || !currentUser) return;
        const text = inputText;
        setInputText('');

        const payload: any = {
            senderId: currentUser.uid,
            senderName: userData?.displayName || 'Anonim',
            content: text,
            type: 'text',
            createdAt: serverTimestamp(),
            readBy: [currentUser.uid]
        };
        if (replyingToMessage) {
            payload.replyTo = replyingToMessage.id;
            setReplyingToMessage(null);
        }

        await addDoc(collection(db, 'groups', groupId, 'messages'), payload);

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

    const handleSendGif = async (url: string) => {
        if (!currentUser) return;
        const payload: any = {
            senderId: currentUser.uid,
            senderName: userData?.displayName || 'Anonim',
            content: '',
            type: 'gif',
            mediaUrl: url,
            createdAt: serverTimestamp(),
            readBy: [currentUser.uid]
        };
        if (replyingToMessage) {
            payload.replyTo = replyingToMessage.id;
            setReplyingToMessage(null);
        }

        await addDoc(collection(db, 'groups', groupId, 'messages'), payload);

        await updateDoc(doc(db, 'groups', groupId), {
            lastMessage: {
                text: 'GIF gönderdi',
                senderName: userData?.displayName || 'Anonim',
                senderId: currentUser.uid,
                timestamp: serverTimestamp()
            }
        });

        playSound('message_sent');
    };

    const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file || !currentUser) return;

        // Reset input so the same file can be selected again if needed
        event.target.value = '';

        setSelectedFileForUpload(file);
        if (file.type.startsWith('image/')) {
            setFilePreviewUrl(URL.createObjectURL(file));
        } else {
            setFilePreviewUrl(null);
        }
    };

    const cancelFileUpload = () => {
        setSelectedFileForUpload(null);
        if (filePreviewUrl) {
            URL.revokeObjectURL(filePreviewUrl);
            setFilePreviewUrl(null);
        }
    };

    const confirmFileUpload = async () => {
        if (!selectedFileForUpload || !currentUser) return;

        const file = selectedFileForUpload;

        // Clear modal state
        setSelectedFileForUpload(null);
        if (filePreviewUrl) {
            URL.revokeObjectURL(filePreviewUrl);
            setFilePreviewUrl(null);
        }

        const type = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : 'file';
        const storageRef = ref(storage, `chat_media/${groupId}/${Date.now()}_${file.name}`);
        const uploadTask = uploadBytesResumable(storageRef, file);

        setUploadProgress(0);

        uploadTask.on(
            'state_changed',
            (snapshot) => {
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                setUploadProgress(progress);
            },
            (error) => {
                console.error("Upload failed:", error);
                showAlert('Hata', 'Dosya yüklenemedi.');
                setUploadProgress(null);
            },
            async () => {
                const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);

                const payload: any = {
                    senderId: currentUser.uid,
                    senderName: userData?.displayName || 'Anonim',
                    content: '',
                    type: 'media',
                    mediaUrl: downloadURL,
                    mediaType: type,
                    fileName: file.name,
                    createdAt: serverTimestamp(),
                    reactions: {},
                    readBy: [currentUser.uid]
                };
                if (replyingToMessage) {
                    payload.replyTo = replyingToMessage.id;
                    setReplyingToMessage(null);
                }

                await addDoc(collection(db, 'groups', groupId, 'messages'), payload);

                await updateDoc(doc(db, 'groups', groupId), {
                    lastMessage: {
                        text: `${type === 'image' ? '📷 Fotoğraf' : type === 'video' ? '🎥 Video' : '📎 Dosya'} gönderdi`,
                        senderName: userData?.displayName || 'Anonim',
                        senderId: currentUser.uid,
                        timestamp: serverTimestamp()
                    }
                });

                setUploadProgress(null);
                playSound('message_sent');
            }
        );
    };

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const recorder = new MediaRecorder(stream);
            mediaRecorderRef.current = recorder;
            chunksRef.current = [];

            recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
            // Don't send immediately – store blob for preview/confirmation
            recorder.onstop = () => {
                const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
                const audioUrl = URL.createObjectURL(audioBlob);
                setPendingAudioBlob(audioBlob);
                setPendingAudioUrl(audioUrl);
                pendingAudioStreamRef.current = stream;
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

    const confirmSendAudio = async () => {
        if (!pendingAudioBlob || !currentUser) return;
        const base64Audio = await blobToBase64(pendingAudioBlob);
        const payload: any = {
            senderId: currentUser.uid,
            senderName: userData?.displayName || 'Anonim',
            content: base64Audio,
            type: 'audio',
            createdAt: serverTimestamp(),
            readBy: [currentUser.uid]
        };
        if (replyingToMessage) { payload.replyTo = replyingToMessage.id; setReplyingToMessage(null); }
        await addDoc(collection(db, 'groups', groupId, 'messages'), payload);
        await updateDoc(doc(db, 'groups', groupId), {
            lastMessage: { text: '[Sesli Mesaj]', senderName: userData?.displayName || 'Anonim', senderId: currentUser.uid, timestamp: serverTimestamp() }
        });
        playSound('message_sent');
        discardPendingAudio();
    };

    const discardPendingAudio = () => {
        if (pendingAudioUrl) URL.revokeObjectURL(pendingAudioUrl);
        pendingAudioStreamRef.current?.getTracks().forEach(t => t.stop());
        setPendingAudioBlob(null);
        setPendingAudioUrl(null);
        pendingAudioStreamRef.current = null;
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
                status: 'calling', // NEW STATE: Caller holds while callee is ringing
                participants: [currentUser?.uid, userId],
                createdBy: currentUser?.uid,
                createdAt: serverTimestamp()
            });
            playSound('call_start');
            // Trigger local dialing UI instead of entering room immediately
            window.dispatchEvent(new CustomEvent('dialing_room', {
                detail: { roomId: roomRef.id, type: 'voice', calleeName: profile?.name || 'Unknown', calleeId: userId }
            }));
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
                status: 'calling', // NEW STATE
                participants: [currentUser?.uid, userId],
                createdBy: currentUser?.uid,
                createdAt: serverTimestamp()
            });
            playSound('call_start');
            // Trigger local dialing UI instead of entering room immediately
            window.dispatchEvent(new CustomEvent('dialing_room', {
                detail: { roomId: roomRef.id, type: 'video', calleeName: profile?.name || 'Unknown', calleeId: userId }
            }));
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

    const blobToBase64 = (blob: Blob): Promise<string> => {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
        });
    };

    const handleReact = async (msgId: string, emoji: string) => {
        const msg = messages.find(m => m.id === msgId);
        if (!msg || !currentUser) return;

        const currentReactions = msg.reactions || {};
        const newReactions = { ...currentReactions };

        const hasReacted = newReactions[emoji]?.includes(currentUser.uid);

        if (hasReacted) {
            newReactions[emoji] = newReactions[emoji].filter(id => id !== currentUser.uid);
            if (newReactions[emoji].length === 0) delete newReactions[emoji];
        } else {
            if (!newReactions[emoji]) newReactions[emoji] = [];
            newReactions[emoji].push(currentUser.uid);
        }

        await updateDoc(doc(db, 'groups', groupId, 'messages', msgId), {
            reactions: newReactions
        });
        setShowEmojiPicker(null);
    };

    // Compute visible messages at render time — this ensures joinedAtMap is always current
    const myJoinedAt = currentUser ? joinedAtMap[currentUser.uid] : undefined;
    const visibleMessages = myJoinedAt
        ? messages.filter(m => {
            if (m.senderId === 'system') return true;
            const msgMs = m.createdAt?.seconds
                ? m.createdAt.seconds * 1000
                : (typeof m.createdAt?.toMillis === 'function' ? m.createdAt.toMillis() : 0);
            return msgMs >= myJoinedAt;
        })
        : messages;

    // Scroll to bottom whenever visible messages change (on open and new messages)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => {
        const el = document.querySelector('.group-messages-list') as HTMLDivElement | null;
        if (el) el.scrollTop = el.scrollHeight;
    }, [visibleMessages.length]);

    return (
        <div className="chat-container" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)' }}>
            {/* Group Header with Rename */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--glass-border)', flexShrink: 0 }}>
                {onBack && (
                    <button
                        onClick={() => { playSound('click'); onBack(); }}
                        className="back-button"
                        style={{ margin: 0, fontSize: '1rem', color: 'var(--text-normal)' }}
                    >
                        <FaChevronLeft size={16} />
                    </button>
                )}
                <span style={{ flex: 1, fontWeight: 700, fontSize: '0.95rem', color: 'white', overflow: 'hidden', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {/* Participants: max 2 with avatar+name + hoverable +N badge */}
                    {(() => {
                        const otherUids = groupMembers.filter(uid => uid !== currentUser?.uid);
                        if (otherUids.length === 0) return <span>{groupName}</span>;
                        const shown = otherUids.slice(0, 2);
                        const extraUids = otherUids.slice(2);

                        const PlusNBadge = ({ uids }: { uids: string[] }) => {
                            const [hov, setHov] = React.useState(false);
                            return (
                                <span style={{ position: 'relative', flexShrink: 0 }} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}>
                                    <span style={{ background: 'rgba(255,255,255,0.08)', borderRadius: '20px', padding: '2px 8px', fontSize: '0.78rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', cursor: 'default' }}>+{uids.length} kişi</span>
                                    {hov && (
                                        <div style={{ position: 'absolute', left: 0, top: '110%', zIndex: 9999, background: 'var(--bg-secondary)', border: '1px solid var(--glass-border)', borderRadius: 10, padding: '8px 10px', minWidth: 150, boxShadow: '0 4px 20px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                                            {uids.map(uid => {
                                                const p = memberProfiles[uid];
                                                if (!p) return null;
                                                return (
                                                    <span key={uid} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                        {p.photoURL ? <img src={p.photoURL} alt="" style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0 }} /> : <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--brand)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', color: 'white', flexShrink: 0 }}>{p.name[0].toUpperCase()}</span>}
                                                        <span style={{ fontSize: '0.85rem', whiteSpace: 'nowrap' }}>{p.name}</span>
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    )}
                                </span>
                            );
                        };

                        return (
                            <>
                                {shown.map(uid => {
                                    const p = memberProfiles[uid];
                                    if (!p) return null;
                                    return (
                                        <span key={uid} style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0, maxWidth: '140px', overflow: 'hidden' }}>
                                            {p.photoURL ? (
                                                <img src={p.photoURL} alt="" style={{ width: 24, height: 24, borderRadius: '50%', flexShrink: 0 }} />
                                            ) : (
                                                <span style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--brand)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', flexShrink: 0, color: 'white' }}>
                                                    {p.name[0].toUpperCase()}
                                                </span>
                                            )}
                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                                        </span>
                                    );
                                })}
                                {extraUids.length > 0 && <PlusNBadge uids={extraUids} />}
                            </>
                        );
                    })()}

                    {/* Action buttons */}
                    <button
                        onClick={handleGroupVoiceCall}
                        style={{ background: 'transparent', border: 'none', color: 'var(--success, #23A559)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '3px', flexShrink: 0 }}
                        title="Arama Başlat"
                    >
                        <FaPhone size={13} />
                    </button>
                    <button
                        onClick={() => setShowAddMemberModal(true)}
                        style={{ background: 'transparent', border: 'none', color: 'var(--brand)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '3px', flexShrink: 0 }}
                        title="Kişi Ekle"
                    >
                        <FaUserPlus size={13} />
                    </button>
                </span>
            </div>

            {/* Add Member Modal */}
            {showAddMemberModal && (
                <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(10,10,15,0.85)', backdropFilter: 'blur(8px)',
                    zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center'
                }} onClick={() => setShowAddMemberModal(false)}>
                    <div onClick={e => e.stopPropagation()} style={{
                        background: 'var(--bg-secondary)', borderRadius: '14px',
                        padding: '24px', width: '340px', maxWidth: '95vw',
                        boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
                        border: '1px solid var(--glass-border)', display: 'flex', flexDirection: 'column', gap: '14px'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Kişi Ekle</h3>
                            <button onClick={() => setShowAddMemberModal(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18 }}>✕</button>
                        </div>
                        <input
                            placeholder="Arkadaş ara..."
                            value={friendSearch}
                            onChange={e => setFriendSearch(e.target.value)}
                            style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--glass-border)', borderRadius: '8px', padding: '8px 12px', color: 'white', outline: 'none', fontSize: '0.9rem' }}
                            autoFocus
                        />
                        <div style={{ maxHeight: '240px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {Object.entries(allFriendProfiles)
                                .filter(([uid, p]) => {
                                    if (groupMembers.includes(uid)) return false;
                                    if (!friendSearch.trim()) return true;
                                    return p.name.toLowerCase().includes(friendSearch.toLowerCase());
                                })
                                .map(([uid, p]) => {
                                    const isSelected = selectedFriendUids.has(uid);
                                    return (
                                        <div
                                            key={uid}
                                            onClick={() => setSelectedFriendUids(prev => {
                                                const next = new Set(prev);
                                                if (next.has(uid)) next.delete(uid); else next.add(uid);
                                                return next;
                                            })}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: '10px',
                                                padding: '8px 10px', borderRadius: '8px', cursor: 'pointer',
                                                background: isSelected ? 'var(--brand)' : 'var(--bg-tertiary)',
                                                transition: 'background 0.15s'
                                            }}
                                        >
                                            {p.photoURL ? (
                                                <img src={p.photoURL} alt="" style={{ width: 30, height: 30, borderRadius: '50%', flexShrink: 0 }} />
                                            ) : (
                                                <span style={{ width: 30, height: 30, borderRadius: '50%', background: isSelected ? 'rgba(255,255,255,0.2)' : 'var(--brand)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', color: 'white', flexShrink: 0 }}>
                                                    {p.name[0].toUpperCase()}
                                                </span>
                                            )}
                                            <span style={{ fontWeight: 500, fontSize: '0.9rem' }}>{p.name}</span>
                                        </div>
                                    );
                                })}
                            {Object.keys(allFriendProfiles).filter(uid => !groupMembers.includes(uid)).length === 0 && (
                                <p style={{ color: 'var(--text-muted)', textAlign: 'center', fontSize: '0.85rem', margin: '12px 0' }}>
                                    Eklenebilecek arkadaş yok
                                </p>
                            )}
                        </div>
                        {selectedFriendUids.size > 0 && (
                            <button
                                onClick={handleAddMembers}
                                style={{ background: 'var(--brand)', border: 'none', borderRadius: '8px', padding: '10px', color: 'white', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer' }}
                            >
                                {selectedFriendUids.size} Kişiyi Ekle
                            </button>
                        )}
                    </div>
                </div>
            )}
            <div className="messages-list group-messages-list" style={{
                flex: 1,
                overflowY: 'scroll',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                touchAction: 'pan-y',
                WebkitOverflowScrolling: 'touch',
                overscrollBehavior: 'contain'
            }}>
                {visibleMessages.map(msg => {
                    const profile = memberProfiles[msg.senderId];
                    const isOwn = msg.senderId === currentUser?.uid;

                    // Calculate if message is read by everyone in the group except the sender
                    // Since Firebase queries can be slow, we'll use memberProfiles which contains fetched active members for this view
                    const allMemberIds = Object.keys(memberProfiles).filter(id => id !== currentUser?.uid);
                    let isReadByAll = false;

                    if (allMemberIds.length > 0 && msg.readBy) {
                        isReadByAll = allMemberIds.every(id => msg.readBy!.includes(id));
                    }

                    const repliedMsg = msg.replyTo ? messages.find(m => m.id === msg.replyTo) : null;
                    const reactionsArray = Object.entries(msg.reactions || {});

                    // Format message timestamp
                    const msgTime = msg.createdAt?.seconds ? new Date(msg.createdAt.seconds * 1000).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '';

                    return (
                        <div key={msg.id}
                            onMouseLeave={() => setShowEmojiPicker(null)}
                            style={{
                                display: 'flex',
                                gap: '10px',
                                alignSelf: isOwn ? 'flex-end' : 'flex-start',
                                flexDirection: isOwn ? 'row-reverse' : 'row',
                                maxWidth: '80%'
                            }}>
                            <div
                                className="message-avatar-container"
                                onClick={(e) => { if (msg.senderId !== 'system') handleAvatarClick(msg.senderId, e); }}
                                style={{ cursor: (isOwn || msg.senderId === 'system') ? 'default' : 'pointer' }}
                            >
                                {profile?.photoURL ? (
                                    <img src={profile.photoURL} alt="" className="message-avatar avatar" />
                                ) : (
                                    <div className="message-avatar-placeholder avatar">
                                        {(profile?.name || msg.senderName || '?')[0].toUpperCase()}
                                    </div>
                                )}
                            </div>
                            <div
                                className="message-bubble-wrapper"
                                style={{
                                    background: isOwn ? 'linear-gradient(135deg, rgba(71,82,196,0.75), rgba(88,101,242,0.65))' : 'var(--bg-tertiary)',
                                    padding: '8px 12px',
                                    borderRadius: isOwn ? '12px 12px 3px 12px' : '12px 12px 12px 3px',
                                    position: 'relative',
                                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.12)',
                                    transition: 'all 0.2s ease',
                                    border: isOwn ? 'none' : '1px solid var(--bg-accent)',
                                    display: 'flex',
                                    flexDirection: 'column'
                                }}>
                                {/* Hover Toolbar */}
                                <div className="message-hover-toolbar" style={{
                                    position: 'absolute',
                                    top: '-15px',
                                    [isOwn ? 'left' : 'right']: '10px',
                                    background: 'var(--bg-secondary)',
                                    border: '1px solid var(--glass-border)',
                                    borderRadius: '8px',
                                    padding: '4px',
                                    display: 'flex',
                                    gap: '4px',
                                    opacity: 0,
                                    transition: 'opacity 0.2s',
                                    zIndex: 10
                                }}>
                                    <button onClick={() => setShowEmojiPicker(showEmojiPicker === msg.id ? null : msg.id)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }} title="Tepki Ver"><FaRegSmile size={14} /></button>
                                    <button onClick={() => setReplyingToMessage(msg)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }} title="Yanıtla"><FaReply size={14} /></button>
                                </div>

                                {/* Emoji Picker */}
                                {showEmojiPicker === msg.id && (
                                    <div style={{
                                        position: 'absolute',
                                        top: '-45px',
                                        [isOwn ? 'left' : 'right']: '10px',
                                        background: 'var(--bg-primary)',
                                        border: '1px solid var(--glass-border)',
                                        borderRadius: '20px',
                                        padding: '6px 10px',
                                        display: 'flex',
                                        gap: '8px',
                                        zIndex: 11,
                                        boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
                                    }}>
                                        {['👍', '❤️', '😂', '😮', '😢', '🔥'].map(emoji => (
                                            <button key={emoji} onClick={() => handleReact(msg.id, emoji)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '18px', padding: 0, margin: 0, transition: 'transform 0.1s' }} onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.2)'} onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}>
                                                {emoji}
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {/* Replied Message Snippet */}
                                {repliedMsg && (
                                    <div
                                        onClick={() => {
                                            const el = document.getElementById(`msg-${repliedMsg.id}`);
                                            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                        }}
                                        style={{
                                            fontSize: '0.75rem',
                                            color: 'rgba(255,255,255,0.7)',
                                            background: 'rgba(0,0,0,0.15)',
                                            padding: '6px 10px',
                                            borderRadius: '4px',
                                            marginBottom: '6px',
                                            borderLeft: '3px solid var(--brand)',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px'
                                        }}>
                                        <FaReply size={10} />
                                        <span style={{ fontWeight: 'bold' }}>{repliedMsg.senderName}</span>
                                        <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '150px' }}>
                                            {repliedMsg.type === 'text' ? repliedMsg.content : (repliedMsg.type === 'media' ? t('media_label') : t('voice_message_label'))}
                                        </span>
                                    </div>
                                )}

                                <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)', marginBottom: '4px' }}>
                                    {profile?.name || msg.senderName}
                                </div>
                                {msg.type === 'text' ? (
                                    renderMessageText(msg.content)
                                ) : msg.type === 'media' ? (
                                    <div style={{ marginTop: '8px' }}>
                                        {msg.mediaType === 'image' && (
                                            <a href={msg.mediaUrl} target="_blank" rel="noopener noreferrer">
                                                <img src={msg.mediaUrl} alt={msg.fileName} style={{ maxWidth: '100%', maxHeight: '300px', borderRadius: '8px', cursor: 'pointer' }} />
                                            </a>
                                        )}
                                        {msg.mediaType === 'video' && (
                                            <video src={msg.mediaUrl} controls style={{ maxWidth: '100%', maxHeight: '300px', borderRadius: '8px' }} />
                                        )}
                                        {msg.mediaType === 'file' && (
                                            <a href={msg.mediaUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', color: 'inherit', textDecoration: 'none' }}>
                                                <FaPaperclip size={20} />
                                                <span style={{ wordBreak: 'break-all' }}>{msg.fileName || t('attach_file')}</span>
                                            </a>
                                        )}
                                    </div>
                                ) : msg.type === 'gif' ? (
                                    <div style={{ marginTop: '8px' }}>
                                        <img src={msg.mediaUrl} alt="GIF" style={{ maxWidth: '100%', borderRadius: '12px', display: 'block' }} />
                                    </div>
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

                                {/* Bottom info bar: Timestamp & Read Receipts */}
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'flex-end',
                                    gap: '4px',
                                    marginTop: '4px',
                                }}>
                                    <span style={{
                                        fontSize: '0.65rem',
                                        color: isOwn ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.5)',
                                        marginRight: isOwn ? '2px' : '0'
                                    }}>
                                        {msgTime}
                                    </span>
                                    {isOwn && (
                                        <>
                                            <FaCheckDouble
                                                size={12}
                                                color={isReadByAll ? '#00e676' : 'rgba(255,255,255,0.5)'}
                                                title={isReadByAll ? t('read_by_all') : t('delivered')}
                                                style={{ filter: isReadByAll ? 'drop-shadow(0 0 2px rgba(0,230,118,0.5))' : 'none' }}
                                            />
                                            <button
                                                className="message-delete-btn"
                                                onClick={() => handleDeleteMessage(msg.id)}
                                                title={t('delete_message')}
                                                style={{ marginLeft: 4, background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', padding: 0 }}
                                            >
                                                <FaTrash size={10} />
                                            </button>
                                        </>
                                    )}
                                </div>

                                {/* Reactions */}
                                {reactionsArray.length > 0 && (
                                    <div style={{
                                        display: 'flex',
                                        flexWrap: 'wrap',
                                        gap: '4px',
                                        marginTop: '6px',
                                        justifyContent: isOwn ? 'flex-end' : 'flex-start'
                                    }}>
                                        {reactionsArray.map(([emoji, users]) => (
                                            <button
                                                key={emoji}
                                                onClick={() => handleReact(msg.id, emoji)}
                                                style={{
                                                    background: users.includes(currentUser?.uid || '') ? 'rgba(88, 101, 242, 0.3)' : 'var(--bg-primary)',
                                                    border: `1px solid ${users.includes(currentUser?.uid || '') ? 'var(--brand)' : 'var(--glass-border)'}`,
                                                    borderRadius: '12px',
                                                    padding: '2px 6px',
                                                    fontSize: '0.75rem',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '4px',
                                                    color: 'white',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                <span>{emoji}</span>
                                                <span>{users.length}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
                <div ref={scrollRef} />
            </div>

            {/* Reply Banner */}
            {
                replyingToMessage && (
                    <div style={{
                        background: 'var(--bg-tertiary)',
                        padding: '8px 20px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        borderTop: '1px solid var(--glass-border)',
                        fontSize: '0.85rem'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)' }}>
                            <FaReply size={12} />
                            <span><strong>{replyingToMessage.senderName}</strong> {t('replying_to')}</span>
                        </div>
                        <button type="button" onClick={() => setReplyingToMessage(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                            <FaTimes />
                        </button>
                    </div>
                )
            }

            {/* Chat Input Features Wrapper */}
            <div style={{ position: 'relative' }}>
                {showChatEmojiPicker && (
                    <div style={{ position: 'absolute', bottom: '100%', left: '20px', zIndex: 1000, paddingBottom: '10px' }}>
                        <div style={{ position: 'relative' }}>
                            <button onClick={() => setShowChatEmojiPicker(false)} style={{ position: 'absolute', top: 5, right: 5, zIndex: 10, background: 'rgba(0,0,0,0.5)', color: 'white', border: 'none', borderRadius: '50%', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><FaTimes size={12} /></button>
                            <EmojiPicker
                                theme={"dark" as any}
                                onEmojiClick={(emojiData) => {
                                    setInputText(prev => prev + emojiData.emoji);
                                }}
                            />
                        </div>
                    </div>
                )}
                {showGifPicker && (
                    <div style={{ position: 'absolute', bottom: '100%', left: '20px', zIndex: 1000, paddingBottom: '10px', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', padding: '10px', background: 'var(--bg-primary)', borderBottom: '1px solid rgba(255,255,255,0.1)', gap: '8px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ color: 'white', fontWeight: 600, fontSize: '0.9rem' }}>{t('search_gif')}</span>
                                <button onClick={() => setShowGifPicker(false)} style={{ background: 'transparent', color: 'rgba(255,255,255,0.6)', border: 'none', cursor: 'pointer', display: 'flex' }}><FaTimes /></button>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '4px 8px' }}>
                                <FaSearch size={12} color="rgba(255,255,255,0.4)" />
                                <input
                                    type="text"
                                    placeholder={t('search_placeholder')}
                                    value={gifSearch}
                                    onChange={e => setGifSearch(e.target.value)}
                                    style={{ background: 'transparent', border: 'none', color: 'white', outline: 'none', padding: '4px 8px', width: '100%', fontSize: '0.85rem' }}
                                />
                            </div>
                        </div>
                        <div style={{ height: '300px', width: '280px', overflowY: 'auto', padding: '6px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '4px' }}>
                                {gifs.map((gif) => (
                                    <div
                                        key={gif.id}
                                        style={{ width: '100%', cursor: 'pointer', overflow: 'hidden', borderRadius: '4px', background: 'rgba(255,255,255,0.05)' }}
                                        onClick={() => {
                                            handleSendGif(gif.media[0].gif.url);
                                            setShowGifPicker(false);
                                            setGifSearch('');
                                        }}
                                    >
                                        <img src={gif.media[0].tinygif.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} loading="lazy" />
                                    </div>
                                ))}
                                {gifs.length === 0 && (
                                    <div style={{ gridColumn: 'span 2', textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>
                                        {t('gif_not_found')}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

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
                    style={{ padding: '20px', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', gap: '10px', position: 'relative' }}
                >
                    {uploadProgress !== null && (
                        <div style={{
                            position: 'absolute', top: 0, left: 20, right: 20, height: '4px',
                            background: 'var(--bg-tertiary)', borderRadius: '2px', overflow: 'hidden'
                        }}>
                            <div style={{ height: '100%', width: `${uploadProgress}%`, background: 'var(--brand)', transition: 'width 0.2s' }} />
                        </div>
                    )}

                    <input
                        type="file"
                        ref={fileInputRef}
                        style={{ display: 'none' }}
                        onChange={handleFileSelect}
                    />

                    {/* Audio Preview Panel */}
                    {pendingAudioUrl && (
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: '10px',
                            background: 'var(--bg-tertiary)', borderRadius: '8px',
                            padding: '8px 12px', border: '1px solid var(--brand)',
                            width: '100%', marginBottom: '8px'
                        }}>
                            <audio controls src={pendingAudioUrl} style={{ flex: 1, height: '36px' }} />
                            <button
                                type="button"
                                onClick={confirmSendAudio}
                                style={{ background: 'var(--brand)', border: 'none', borderRadius: '6px', color: 'white', padding: '6px 14px', cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem', whiteSpace: 'nowrap' }}
                            >{t('send')}</button>
                            <button
                                type="button"
                                onClick={discardPendingAudio}
                                style={{ background: 'var(--danger)', border: 'none', borderRadius: '6px', color: 'white', padding: '6px 14px', cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem', whiteSpace: 'nowrap' }}
                            >{t('delete')}</button>
                        </div>
                    )}

                    <button
                        type="button"
                        title={t('attach_file')}
                        onClick={() => {
                            playSound('click');
                            fileInputRef.current?.click();
                        }}
                        style={{
                            width: '40px', height: '40px', borderRadius: '50%', border: 'none',
                            background: 'var(--bg-tertiary)', color: 'var(--text-muted)', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}
                    >
                        <FaPaperclip />
                    </button>

                    <button
                        type="button"
                        onClick={() => { setShowChatEmojiPicker(!showChatEmojiPicker); setShowGifPicker(false); }}
                        style={{ background: 'transparent', border: 'none', color: showChatEmojiPicker ? 'var(--brand)' : 'var(--text-muted)', cursor: 'pointer', display: 'flex', transition: 'color 0.2s', alignItems: 'center', justifyContent: 'center' }}
                        title={t('send_emoji')}
                    >
                        <FaSmile size={22} />
                    </button>
                    <button
                        type="button"
                        onClick={() => { setShowGifPicker(!showGifPicker); setShowChatEmojiPicker(false); }}
                        style={{ background: 'transparent', color: showGifPicker ? 'var(--brand)' : 'var(--text-muted)', cursor: 'pointer', display: 'flex', transition: 'color 0.2s', fontWeight: 800, fontSize: '0.8rem', alignItems: 'center', justifyContent: 'center', border: '2px solid', borderRadius: '4px', padding: '2px 4px' }}
                        title={t('send_gif')}
                    >
                        GIF
                    </button>

                    <input
                        type="text"
                        className="settings-input"
                        style={{ margin: 0, borderRadius: '8px', flex: 1 }}
                        placeholder={t('write_message')}
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
                        <FaMicrophone size={14} style={{ display: isRecording ? 'none' : 'block' }} />
                        <FaStop size={14} style={{ display: isRecording ? 'block' : 'none' }} />
                    </button>

                    <button
                        type="submit"
                        style={{
                            width: '40px', height: '40px', borderRadius: '8px', border: 'none',
                            background: 'var(--brand)', color: 'white', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}
                    >
                        <FaPaperPlane size={14} />
                    </button>
                </form>
            </div>

            {
                contextMenu && (
                    <UserContextMenu
                        user={contextMenu.user}
                        position={contextMenu.position}
                        onClose={() => setContextMenu(null)}
                        onSendMessage={handleSendMessage}
                        onVoiceCall={handleVoiceCall}
                        onVideoCall={handleVideoCall}
                        onBlockUser={handleBlockUser}
                    />
                )
            }

            {
                selectedFileForUpload && (
                    <div style={{
                        position: 'absolute',
                        top: 0, left: 0, right: 0, bottom: 0,
                        background: 'rgba(0,0,0,0.85)',
                        backdropFilter: 'blur(10px)',
                        zIndex: 100,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '20px'
                    }}>
                        <div style={{
                            background: 'var(--bg-secondary)',
                            borderRadius: '16px',
                            padding: '24px',
                            maxWidth: '400px',
                            width: '100%',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '20px',
                            border: '1px solid var(--glass-border)',
                            boxShadow: '0 20px 40px rgba(0,0,0,0.5)'
                        }}>
                            <h3 style={{ margin: 0, color: 'white', fontSize: '1.2rem' }}>{t('confirm_upload')}</h3>
                            <div style={{
                                width: '100%',
                                height: '200px',
                                background: 'var(--bg-tertiary)',
                                borderRadius: '12px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                overflow: 'hidden'
                            }}>
                                {filePreviewUrl ? (
                                    <img src={filePreviewUrl} alt="Preview" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: 'var(--text-muted)', gap: '10px' }}>
                                        <FaPaperclip size={40} />
                                        <span>{t('no_preview')}</span>
                                    </div>
                                )}
                            </div>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ color: 'white', fontWeight: 500, wordBreak: 'break-all' }}>{selectedFileForUpload.name}</div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '4px' }}>
                                    {(selectedFileForUpload.size / 1024 / 1024).toFixed(2)} MB
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '12px', width: '100%', marginTop: '10px' }}>
                                <button
                                    onClick={cancelFileUpload}
                                    style={{
                                        flex: 1, padding: '12px', borderRadius: '8px', border: 'none',
                                        background: 'var(--bg-tertiary)', color: 'white', cursor: 'pointer',
                                        fontWeight: 600, transition: 'background 0.2s'
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-tertiary)'}
                                >
                                    {t('cancel')}
                                </button>
                                <button
                                    onClick={confirmFileUpload}
                                    style={{
                                        flex: 1, padding: '12px', borderRadius: '8px', border: 'none',
                                        background: 'var(--brand)', color: 'white', cursor: 'pointer',
                                        fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                                        transition: 'filter 0.2s'
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.filter = 'brightness(1.1)'}
                                    onMouseLeave={e => e.currentTarget.style.filter = 'brightness(1)'}
                                >
                                    <FaPaperPlane size={14} />
                                    {t('send')}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
        </div>
    );
}
