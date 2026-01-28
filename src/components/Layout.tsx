import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { auth, db, storage } from '../firebase';
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
import { FaMicrophone, FaHeadphones, FaCog, FaVolumeUp, FaPlus, FaCheck, FaTimes, FaUserPlus, FaSearch, FaSignOutAlt } from 'react-icons/fa';
import '../styles/layout.css';

export const ServerSidebar = () => (
    <aside className="server-sidebar">
        <div className="server-icon active">VC</div>
        <div style={{ width: 32, height: 2, background: 'var(--bg-accent)', margin: '4px 0' }} />
        <div className="server-icon"><FaPlus /></div>
    </aside>
);

import SettingsModal from './SettingsModal';

export const RoomSidebar = ({ activeRoom, onRoomSelect }: { activeRoom: string | null, onRoomSelect: (id: string) => void }) => {
    const { currentUser, userData } = useAuth();
    const [rooms, setRooms] = useState<{ id: string, name: string }[]>([]);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);

    useEffect(() => {
        const unsub = onSnapshot(collection(db, 'rooms'), (snapshot) => {
            const roomList = snapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name }));
            setRooms(roomList);
        });
        return unsub;
    }, []);

    const createRoom = async () => {
        const name = prompt('Oda ismi girin:');
        if (name) {
            await addDoc(collection(db, 'rooms'), { name, createdAt: Date.now() });
        }
    };

    const handleAvatarClick = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = async (e: any) => {
            const file = e.target.files[0];
            if (!file || !currentUser) return;

            const storageRef = ref(storage, `avatars/${currentUser.uid}`);
            await uploadBytes(storageRef, file);
            const url = await getDownloadURL(storageRef);

            // Update Firestore
            await updateDoc(doc(db, 'users', currentUser.uid), {
                photoURL: url
            });
        };
        input.click();
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
                        onClick={() => onRoomSelect(room.id)}
                    >
                        <FaVolumeUp /> {room.name}
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
                    <button className="control-btn" title="Mikrofon"><FaMicrophone /></button>
                    <button className="control-btn" title="Sağırlaştır"><FaHeadphones /></button>
                    <button className="control-btn" title="Ayarlar" onClick={() => setIsSettingsOpen(true)}><FaCog /></button>
                    <button className="control-btn" title="Çıkış Yap" onClick={() => auth.signOut()} style={{ color: 'var(--danger)' }}><FaSignOutAlt /></button>
                </div>
            </footer>

            <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
        </aside>
    );
};



export const UserPanel = () => {
    const { currentUser, userData } = useAuth();
    const [searchEmail, setSearchEmail] = useState('');
    const [friendRequests, setFriendRequests] = useState<any[]>([]);
    const [friends, setFriends] = useState<any[]>([]);

    useEffect(() => {
        if (!currentUser) return;

        // Listen for friend requests
        const q = query(collection(db, 'friendRequests'), where('to', '==', currentUser.uid), where('status', '==', 'pending'));
        const unsubRequests = onSnapshot(q, async (snapshot) => {
            const requests = await Promise.all(snapshot.docs.map(async (docSnap) => {
                const data = docSnap.data();
                const fromSnap = await getDocs(query(collection(db, 'users'), where('uid', '==', data.from)));
                const fromData = fromSnap.docs[0]?.data();
                return { id: docSnap.id, ...data, fromName: fromData?.displayName || 'Bilinmeyen' };
            }));
            setFriendRequests(requests);
        });

        const unsubFriends = onSnapshot(doc(db, 'users', currentUser.uid), async (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                if (data?.friends?.length > 0) {
                    const fDocs = await Promise.all(data.friends.map(async (fUid: string) => {
                        const fSnap = await getDocs(query(collection(db, 'users'), where('uid', '==', fUid)));
                        return fSnap.docs[0]?.data();
                    }));
                    setFriends(fDocs.filter(f => f));
                } else {
                    setFriends([]);
                }
            }
        });

        return () => {
            unsubRequests();
            unsubFriends();
        };
    }, [currentUser]);

    const sendFriendRequest = async () => {
        if (!searchEmail || !currentUser) return;

        try {
            const userQuery = query(collection(db, 'users'), where('email', '==', searchEmail));
            const userSnap = await getDocs(userQuery);

            if (userSnap.empty) {
                alert('Kullanıcı bulunamadı!');
                return;
            }

            const targetUser = userSnap.docs[0].data();
            if (targetUser.uid === currentUser.uid) {
                alert('Kendinizi ekleyemezsiniz!');
                return;
            }

            // Check if already friends or request exists
            await addDoc(collection(db, 'friendRequests'), {
                from: currentUser.uid,
                to: targetUser.uid,
                status: 'pending',
                createdAt: serverTimestamp()
            });

            alert('İstek gönderildi!');
            setSearchEmail('');
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

    return (
        <aside className="user-panel">
            <div className="friend-search">
                <input
                    type="text"
                    placeholder="E-posta ile ara..."
                    value={searchEmail}
                    onChange={(e) => setSearchEmail(e.target.value)}
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
                    <div key={friend.uid} className="member-item">
                        <div className="avatar-wrapper">
                            {friend.photoURL ? (
                                <img src={friend.photoURL} alt="" className="avatar" style={{ width: 32, height: 32, borderRadius: '50%' }} />
                            ) : (
                                <div className="avatar">{friend.displayName.charAt(0)}</div>
                            )}
                        </div>
                        <div className="user-display-name">{friend.displayName}</div>
                    </div>
                ))}
            </div>
        </aside>
    );
};

