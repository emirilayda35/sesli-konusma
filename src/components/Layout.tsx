import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useUI } from '../contexts/UIContext';
import { storage } from '../firebase';
import {
    collection,
    onSnapshot,
    addDoc,
    doc,
    updateDoc,
    query,
    where,
    getDocs,
    setDoc,
    deleteDoc,
    serverTimestamp,
    arrayUnion
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { FaMicrophone, FaMicrophoneSlash, FaHeadphones, FaVolumeMute, FaCog, FaVolumeUp, FaPlus, FaCheck, FaTimes, FaUserPlus, FaSearch, FaSignOutAlt, FaUserFriends, FaUserCircle } from 'react-icons/fa';
import '../styles/layout.css';
import { useClickOutside } from '../hooks/useClickOutside';
import UserContextMenu from './UserContextMenu';

export const ServerSidebar = () => {
    const { showAlert } = useUI();
    return (
        <aside className="server-sidebar">
            <div className="server-icon active" title="Giriş">VC</div>
            <div style={{ width: 32, height: 2, background: 'var(--bg-accent)', margin: '4px 0' }} />
            <div
                className="server-icon"
                onClick={() => showAlert('Sunucu', 'Sunucu ekleme özelliği çok yakında! Şimdilik mevcut sunucuyu kullanabilirsiniz.')}
                style={{ cursor: 'pointer' }}
                title="Sunucu Ekle"
            >
                <FaPlus />
            </div>
        </aside>
    );
};

import SettingsModal from './SettingsModal';
import CreateGroupModal from './CreateGroupModal';
import AddAccountModal from './AddAccountModal';

export const RoomSidebar = ({
    activeRoom,
    onRoomSelect,
    activeGroup,
    onGroupSelect
}: {
    activeRoom: string | null,
    onRoomSelect: (id: string | null) => void,
    activeGroup: string | null,
    onGroupSelect: (id: string | null) => void
}) => {
    const { currentUser, userData } = useAuth();
    const [rooms, setRooms] = useState<{ id: string, name: string }[]>([]);
    const [groups, setGroups] = useState<{ id: string, name: string }[]>([]);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
    const [isMicMuted, setIsMicMuted] = useState(false);
    const [isDeafened, setIsDeafened] = useState(false);
    const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
    const [isAddAccountOpen, setIsAddAccountOpen] = useState(false);
    const accountMenuRef = useRef<HTMLDivElement>(null);

    useClickOutside(accountMenuRef, () => {
        if (isAccountMenuOpen) setIsAccountMenuOpen(false);
    });

    const { savedAccounts, switchAccount, addAccount, logoutCurrent, db } = useAuth();

    const toggleMic = () => {
        const next = !isMicMuted;
        setIsMicMuted(next);
        window.dispatchEvent(new CustomEvent('global_audio_state', { detail: { type: 'mic', value: next } }));
    };

    const toggleDeafen = () => {
        const next = !isDeafened;
        setIsDeafened(next);
        // Deafening also mutes the mic usually in such apps
        if (next && !isMicMuted) {
            setIsMicMuted(true);
            window.dispatchEvent(new CustomEvent('global_audio_state', { detail: { type: 'mic', value: true } }));
        }
        window.dispatchEvent(new CustomEvent('global_audio_state', { detail: { type: 'deafen', value: next } }));
    };

    useEffect(() => {
        const unsubRooms = onSnapshot(collection(db, 'rooms'), (snapshot) => {
            const roomList = snapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name }));
            setRooms(roomList);
        });

        if (!currentUser) return;
        const qGroups = query(collection(db, 'groups'), where('members', 'array-contains', currentUser.uid));
        const unsubGroups = onSnapshot(qGroups, (snapshot) => {
            const groupList = snapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name }));
            setGroups(groupList);
        });

        return () => {
            unsubRooms();
            unsubGroups();
        };
    }, [currentUser]);

    const createRoom = async () => {
        const name = prompt('Oda ismi girin:');
        if (name) {
            await addDoc(collection(db, 'rooms'), { name, createdAt: Date.now() });
        }
    };

    const [initialTab, setInitialTab] = useState('account');

    const handleAvatarClick = () => {
        setInitialTab('account');
        setIsSettingsOpen(true);
    };

    return (
        <aside className="room-sidebar">
            <header className="sidebar-header">
                Sesli Sohbet Uygulaması
            </header>
            <div className="sidebar-scrollable">
                <div className="category-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    SESLİ KANALLAR <span onClick={createRoom} style={{ cursor: 'pointer' }}><FaPlus size={12} /></span>
                </div>
                {rooms.map(room => (
                    <div
                        key={room.id}
                        className={`room-item ${activeRoom === room.id ? 'active' : ''}`}
                        onClick={() => {
                            onRoomSelect(room.id);
                            onGroupSelect(null);
                        }}
                    >
                        <FaVolumeUp /> {room.name}
                    </div>
                ))}

                <div className="category-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px' }}>
                    MESAJ GRUPLARI <span onClick={() => setIsCreateGroupOpen(true)} style={{ cursor: 'pointer' }}><FaPlus size={12} /></span>
                </div>
                {groups.map(group => (
                    <div
                        key={group.id}
                        className={`room-item ${activeGroup === group.id ? 'active' : ''}`}
                        onClick={() => {
                            onGroupSelect(group.id);
                            onRoomSelect(null);
                        }}
                    >
                        <FaPlus size={12} style={{ color: 'var(--text-muted)', marginRight: '4px' }} /> {group.name}
                    </div>
                ))}
            </div>

            <footer className="user-footer">
                <div className="avatar-wrapper" onClick={handleAvatarClick} style={{ cursor: 'pointer', position: 'relative' }}>
                    {userData?.photoURL ? (
                        <img src={userData.photoURL} alt="Avatar" className="avatar" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} />
                    ) : (
                        <div className="avatar">
                            {currentUser?.displayName?.charAt(0) || currentUser?.email?.charAt(0)}
                        </div>
                    )}
                    <div className="avatar-status-online" />
                </div>
                <div className="user-info">
                    <div className="user-display-name">{userData?.displayName || 'Kullanıcı'}</div>
                    <div className="user-status">Çevrimiçi</div>
                </div>
                <div className="user-controls">
                    <div style={{ position: 'relative' }} ref={accountMenuRef}>
                        <button
                            className="control-btn"
                            title="Hesap Değiştir"
                            onClick={() => setIsAccountMenuOpen(!isAccountMenuOpen)}
                        >
                            <FaUserFriends />
                        </button>

                        {isAccountMenuOpen && (
                            <div className="account-switcher-popover">
                                <div className="popover-header">HESAPLAR</div>
                                <div className="popover-list">
                                    {savedAccounts.map(acc => (
                                        <div
                                            key={acc.uid}
                                            className={`account-item ${acc.uid === currentUser?.uid ? 'active' : ''}`}
                                            onClick={() => {
                                                if (acc.uid !== currentUser?.uid) switchAccount(acc.uid);
                                                setIsAccountMenuOpen(false);
                                            }}
                                        >
                                            {acc.photoURL ? (
                                                <img src={acc.photoURL} alt="" />
                                            ) : (
                                                <div className="avatar">{acc.displayName?.charAt(0) || '?'}</div>
                                            )}
                                            <div className="acc-meta">
                                                <div className="acc-name">{acc.displayName || 'İsimsiz'}</div>
                                                <div className="acc-status">{acc.uid === currentUser?.uid ? 'Şu anki' : 'Geçiş yap'}</div>
                                            </div>
                                            {acc.uid === currentUser?.uid && <FaCheck className="active-check" />}
                                        </div>
                                    ))}
                                    <div
                                        className="account-item add-account"
                                        onClick={() => {
                                            setIsAccountMenuOpen(false);
                                            setIsAddAccountOpen(true);
                                        }}
                                    >
                                        <div className="avatar add"><FaPlus /></div>
                                        <span>Yeni Hesap Ekle</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                    <button
                        className={`control-btn ${isMicMuted ? 'muted' : ''}`}
                        title={isMicMuted ? "Sesi Aç" : "Sesi Kapat"}
                        onClick={toggleMic}
                        style={{ color: isMicMuted ? 'var(--danger)' : 'var(--text-normal)' }}
                    >
                        {isMicMuted ? <FaMicrophoneSlash /> : <FaMicrophone />}
                    </button>
                    <button
                        className={`control-btn ${isDeafened ? 'deafened' : ''}`}
                        title={isDeafened ? "Sağırlaştırmayı Kapat" : "Sağırlaştır"}
                        onClick={toggleDeafen}
                        style={{ color: isDeafened ? 'var(--danger)' : 'var(--text-normal)' }}
                    >
                        {isDeafened ? <FaVolumeMute /> : <FaHeadphones />}
                    </button>
                    <button className="control-btn" title="Ayarlar" onClick={() => { setInitialTab('voice'); setIsSettingsOpen(true); }}><FaCog /></button>
                    <button className="control-btn" title="Çıkış Yap" onClick={logoutCurrent} style={{ color: 'var(--danger)' }}><FaSignOutAlt /></button>
                </div>
            </footer>

            <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} initialTab={initialTab} />
            <CreateGroupModal isOpen={isCreateGroupOpen} onClose={() => setIsCreateGroupOpen(false)} />
            <AddAccountModal
                isOpen={isAddAccountOpen}
                onClose={() => setIsAddAccountOpen(false)}
                onSuccess={(user) => addAccount(user)}
            />
        </aside>
    );
};



export const UserPanel = () => {
    const { currentUser, userData, db } = useAuth();
    const [friendRequests, setFriendRequests] = useState<any[]>([]);
    const [friends, setFriends] = useState<any[]>([]);
    const [contextMenu, setContextMenu] = useState<{ user: any; position: { x: number; y: number } } | null>(null);

    useEffect(() => {
        if (!currentUser) return;

        // Listen for friend requests
        const q = query(collection(db, 'friendRequests'), where('to', '==', currentUser.uid), where('status', '==', 'pending'));
        let unsubNames: (() => void)[] = [];

        const unsubRequests = onSnapshot(q, (snapshot) => {
            // Clean up previous name listeners
            unsubNames.forEach(u => u());
            unsubNames = [];

            const requests = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
            setFriendRequests(requests);

            // Fetch/Listen to names for each request sender
            requests.forEach(req => {
                const u = onSnapshot(doc(db, 'users', (req as any).from), (userSnap) => {
                    if (userSnap.exists()) {
                        setFriendRequests(prev => prev.map(r =>
                            r.from === (req as any).from
                                ? { ...r, fromName: userSnap.data().displayName || 'Bilinmeyen' }
                                : r
                        ));
                    }
                });
                unsubNames.push(u);
            });
        });

        let unsubFriendsProfiles: (() => void) | null = null;
        const unsubFriends = onSnapshot(doc(db, 'users', currentUser.uid), (docSnap) => {
            if (unsubFriendsProfiles) unsubFriendsProfiles();

            if (docSnap.exists()) {
                const data = docSnap.data();
                const friendUids = data?.friends || [];

                if (friendUids.length > 0) {
                    const qFriends = query(collection(db, 'users'), where('uid', 'in', friendUids.slice(0, 30)));
                    unsubFriendsProfiles = onSnapshot(qFriends, (snap) => {
                        const fDocs = snap.docs.map(d => d.data());
                        setFriends(fDocs);
                    });
                } else {
                    setFriends([]);
                }
            }
        });

        return () => {
            unsubRequests();
            unsubFriends();
            if (unsubFriendsProfiles) unsubFriendsProfiles();
        };
    }, [currentUser]);

    const [searchQuery, setSearchQuery] = useState('');
    const { showAlert } = useUI();

    const sendFriendRequest = async () => {
        if (!searchQuery || !currentUser) return;

        try {
            // Firestore doesn't support 'OR' queries well across different fields without special indexes,
            // so we'll check email first, then displayName if not found.
            let userQuery = query(collection(db, 'users'), where('email', '==', searchQuery));
            let userSnap = await getDocs(userQuery);

            if (userSnap.empty) {
                userQuery = query(collection(db, 'users'), where('displayName', '==', searchQuery));
                userSnap = await getDocs(userQuery);
            }

            if (userSnap.empty) {
                showAlert('Hata', 'Kullanıcı bulunamadı! (E-posta veya kullanıcı adını kontrol edin)');
                return;
            }

            const targetUser = userSnap.docs[0].data();
            if (targetUser.uid === currentUser.uid) {
                showAlert('Hata', 'Kendinizi ekleyemezsiniz!');
                return;
            }

            // Check if already friends
            const currentUsersFriends = userData?.friends || [];
            if (currentUsersFriends.includes(targetUser.uid)) {
                showAlert('Bilgi', 'Bu kullanıcı zaten arkadaşınız!');
                return;
            }

            await addDoc(collection(db, 'friendRequests'), {
                from: currentUser.uid,
                to: targetUser.uid,
                status: 'pending',
                createdAt: serverTimestamp()
            });

            showAlert('Başarılı', 'İstek gönderildi!');
            setSearchQuery('');
        } catch (err) {
            console.error(err);
        }
    };

    const handleRequest = async (requestId: string, fromUid: string, accept: boolean) => {
        if (!currentUser) return;

        if (accept) {
            const fromRef = doc(db, 'users', fromUid);
            const toRef = doc(db, 'users', currentUser.uid);

            await updateDoc(fromRef, { friends: arrayUnion(currentUser.uid) });
            await updateDoc(toRef, { friends: arrayUnion(fromUid) });

            await deleteDoc(doc(db, 'friendRequests', requestId));
        } else {
            await deleteDoc(doc(db, 'friendRequests', requestId));
        }
    };

    const handleUserClick = (friend: any, event: React.MouseEvent) => {
        event.preventDefault();
        const rect = (event.target as HTMLElement).getBoundingClientRect();
        setContextMenu({
            user: friend,
            position: { x: rect.right + 10, y: rect.top }
        });
    };

    const handleSendMessage = async (userId: string) => {
        // Create or find existing DM group
        const groupsRef = collection(db, 'groups');
        const q = query(groupsRef, where('members', 'array-contains', currentUser?.uid));
        const snapshot = await getDocs(q);

        let existingGroup = null;
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            if (data.members.length === 2 && data.members.includes(userId)) {
                existingGroup = { id: docSnap.id, ...data };
            }
        });

        if (existingGroup) {
            showAlert('Mesaj', 'Mevcut sohbete yönlendiriliyorsunuz...');
        } else {
            const targetUser = friends.find(f => f.uid === userId);
            await addDoc(groupsRef, {
                name: `${userData?.displayName} & ${targetUser?.displayName}`,
                members: [currentUser?.uid, userId],
                createdAt: serverTimestamp()
            });
            showAlert('Mesaj', 'Yeni sohbet oluşturuldu!');
        }
    };

    const handleVoiceCall = async (userId: string) => {
        try {
            const targetUser = friends.find(f => f.uid === userId);
            const roomName = `${userData?.displayName} & ${targetUser?.displayName}`;

            // Create a new voice room
            const roomRef = await addDoc(collection(db, 'rooms'), {
                name: roomName,
                type: 'voice',
                participants: [currentUser?.uid, userId],
                createdBy: currentUser?.uid,
                createdAt: serverTimestamp()
            });

            showAlert('Sesli Arama', `${targetUser?.displayName} ile sesli arama başlatıldı!`);

            // Trigger room selection via custom event
            window.dispatchEvent(new CustomEvent('select_room', { detail: { roomId: roomRef.id } }));
        } catch (error) {
            console.error('Voice call error:', error);
            showAlert('Hata', 'Sesli arama başlatılamadı.');
        }
    };

    const handleVideoCall = async (userId: string) => {
        try {
            const targetUser = friends.find(f => f.uid === userId);
            const roomName = `${userData?.displayName} & ${targetUser?.displayName}`;

            // Create a new video room
            const roomRef = await addDoc(collection(db, 'rooms'), {
                name: roomName,
                type: 'video',
                participants: [currentUser?.uid, userId],
                createdBy: currentUser?.uid,
                createdAt: serverTimestamp()
            });

            showAlert('Görüntülü Arama', `${targetUser?.displayName} ile görüntülü arama başlatıldı!`);

            // Trigger room selection via custom event
            window.dispatchEvent(new CustomEvent('select_room', { detail: { roomId: roomRef.id } }));
        } catch (error) {
            console.error('Video call error:', error);
            showAlert('Hata', 'Görüntülü arama başlatılamadı.');
        }
    };

    const handleBlockUser = async (userId: string) => {
        const { showConfirm } = useUI();
        showConfirm(
            'Kullanıcıyı Engelle',
            'Bu kullanıcıyı engellemek istediğinizden emin misiniz? Artık sizinle iletişime geçemeyecek.',
            async () => {
                showAlert('Engellendi', 'Kullanıcı başarıyla engellendi.');
            },
            'Engelle',
            true
        );
    };

    const formatLastActive = (timestamp: any) => {
        if (!timestamp) return 'Bilinmiyor';
        try {
            const date = timestamp.seconds ? new Date(timestamp.seconds * 1000) : new Date(timestamp);
            const now = new Date();
            const diff = Math.floor((now.getTime() - date.getTime()) / 1000);

            if (diff < 60) return 'Şu an aktif';
            if (diff < 3600) return `${Math.floor(diff / 60)} dk önce`;
            if (diff < 86400) return `${Math.floor(diff / 3600)} sa önce`;
            return date.toLocaleDateString('tr-TR');
        } catch (e) {
            return 'Bilinmiyor';
        }
    };

    return (
        <aside className="user-panel">
            <div className="friend-search">
                <input
                    type="text"
                    placeholder="E-posta veya kullanıcı adı..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
                <button onClick={sendFriendRequest}><FaUserPlus /></button>
            </div>

            {friendRequests.length > 0 && (
                <div className="section">
                    <div className="member-header">İSTEKLER — {friendRequests.length}</div>
                    {friendRequests.map(req => (
                        <div key={req.id} className="member-item">
                            <div className="user-display-name">{req.fromName}</div>
                            <div className="request-actions">
                                <FaCheck onClick={() => handleRequest(req.id, req.from, true)} className="accept" />
                                <FaTimes onClick={() => handleRequest(req.id, req.from, false)} className="reject" />
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <div className="section">
                <div className="member-header">ARKADAŞLAR — {friends.length}</div>
                {friends.map(friend => (
                    <div
                        key={friend.uid}
                        className="member-item"
                        style={{ gap: '12px', cursor: 'pointer' }}
                        onClick={(e) => handleUserClick(friend, e)}
                    >
                        <div className="avatar-wrapper">
                            {friend.photoURL ? (
                                <img src={friend.photoURL} alt="" className="avatar" style={{ width: 32, height: 32, borderRadius: '50%' }} />
                            ) : (
                                <div className="avatar" style={{ width: 32, height: 32 }}>{friend.displayName?.charAt(0) || '?'}</div>
                            )}
                        </div>
                        <div className="user-info" style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div className={`status-dot ${friend.isOnline ? 'online' : 'offline'}`} />
                                <span className="user-display-name" style={{ fontSize: '14px' }}>{friend.displayName}</span>
                            </div>
                            <span className="last-seen">
                                {friend.isOnline ? 'Çevrimiçi' : formatLastActive(friend.lastActive)}
                            </span>
                        </div>
                    </div>
                ))}
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
        </aside>
    );
};

