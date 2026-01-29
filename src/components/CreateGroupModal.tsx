import React, { useState, useEffect } from 'react';
import { FaTimes, FaPlus, FaCheck } from 'react-icons/fa';
import { useAuth } from '../contexts/AuthContext';
import { useUI } from '../contexts/UIContext';
import { collection, addDoc, query, where, onSnapshot, serverTimestamp, doc } from 'firebase/firestore';
import '../styles/settings.css'; // Reuse some styles or create layout.css

interface CreateGroupModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function CreateGroupModal({ isOpen, onClose }: CreateGroupModalProps) {
    const { currentUser, db } = useAuth();
    const { showAlert } = useUI();
    const [groupName, setGroupName] = useState('');
    const [friends, setFriends] = useState<any[]>([]);
    const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!currentUser || !isOpen) return;

        const unsub = onSnapshot(doc(db, 'users', currentUser.uid), (docSnap) => {
            if (docSnap.exists()) {
                const friendUids = docSnap.data().friends || [];
                if (friendUids.length > 0) {
                    const q = query(collection(db, 'users'), where('uid', 'in', friendUids.slice(0, 10)));
                    onSnapshot(q, (snap) => {
                        setFriends(snap.docs.map(d => d.data()));
                    });
                }
            }
        });

        return unsub;
    }, [currentUser, isOpen]);

    const toggleFriend = (uid: string) => {
        setSelectedFriends(prev =>
            prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]
        );
    };

    const handleCreate = async () => {
        if (!groupName || selectedFriends.length === 0 || !currentUser) return;

        try {
            setLoading(true);
            await addDoc(collection(db, 'groups'), {
                name: groupName,
                members: [...selectedFriends, currentUser.uid],
                owner: currentUser.uid,
                createdAt: serverTimestamp(),
                activeCallId: null
            });
            setLoading(false);
            setGroupName('');
            setSelectedFriends([]);
            onClose();
        } catch (err) {
            console.error(err);
            setLoading(false);
            showAlert('Hata', 'Grup oluşturulurken bir hata oluştu.');
        }
    };

    if (!isOpen) return null;

    return (
        <div className="settings-overlay" style={{ zIndex: 1100 }}>
            <div className="settings-content-wrapper" style={{ maxWidth: '500px', height: 'auto', maxHeight: '80vh', borderRadius: '8px', margin: 'auto' }}>
                <div className="settings-header">
                    <h2>Yeni Grup Oluştur</h2>
                    <div onClick={onClose} style={{ cursor: 'pointer', color: 'var(--text-muted)' }}><FaTimes size={20} /></div>
                </div>

                <div className="settings-section" style={{ padding: '20px' }}>
                    <div className="settings-field">
                        <label className="settings-label">GRUP İSMİ</label>
                        <input
                            className="settings-input"
                            placeholder="Harika Grup"
                            value={groupName}
                            onChange={(e) => setGroupName(e.target.value)}
                        />
                    </div>

                    <div className="settings-field" style={{ marginTop: '20px' }}>
                        <label className="settings-label">ARKADAŞLARINI EKLE ({selectedFriends.length})</label>
                        <div style={{ maxHeight: '200px', overflowY: 'auto', marginTop: '10px', background: 'var(--bg-secondary)', borderRadius: '4px' }}>
                            {friends.length === 0 ? (
                                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>Arkadaş listeniz boş.</div>
                            ) : (
                                friends.map(friend => (
                                    <div
                                        key={friend.uid}
                                        className={`member-item ${selectedFriends.includes(friend.uid) ? 'active' : ''}`}
                                        onClick={() => toggleFriend(friend.uid)}
                                        style={{ padding: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--bg-tertiary)' }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            {friend.photoURL ? (
                                                <img src={friend.photoURL} alt="" style={{ width: 24, height: 24, borderRadius: '50%' }} />
                                            ) : (
                                                <div className="avatar" style={{ width: 24, height: 24, fontSize: '10px' }}>{friend.displayName.charAt(0)}</div>
                                            )}
                                            <span>{friend.displayName}</span>
                                        </div>
                                        {selectedFriends.includes(friend.uid) ? <FaCheck style={{ color: 'var(--brand)' }} /> : <FaPlus style={{ color: 'var(--text-muted)' }} />}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    <div style={{ marginTop: '30px', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                        <button className="btn-secondary" onClick={onClose}>İPTAL</button>
                        <button
                            className="btn-primary"
                            disabled={loading || !groupName || selectedFriends.length === 0}
                            onClick={handleCreate}
                        >
                            {loading ? 'OLUŞTURULUYOR...' : 'GRUP OLUŞTUR'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
