import { useState, useEffect } from 'react';
import { RoomSidebar, UserPanel } from '../components/Layout';
import VoiceRoom from '../components/VoiceRoom';
import GroupChat from '../components/GroupChat';
import { FaVolumeUp, FaPlus, FaUserFriends, FaHashtag } from 'react-icons/fa';
import { db } from '../firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import GradientText from '../components/GradientText';
import Ballpit from '../components/Ballpit';
import '../styles/layout.css';

export default function Dashboard() {
    const [activeRoom, setActiveRoom] = useState<string | null>(null);
    const [activeGroup, setActiveGroup] = useState<string | null>(null);
    const [activeRoomName, setActiveRoomName] = useState<string>('');
    const [activeGroupName, setActiveGroupName] = useState<string>('');
    const [mobileSidebar, setMobileSidebar] = useState<'none' | 'rooms' | 'users'>('none');

    useEffect(() => {
        const handleRoomSelect = (e: any) => {
            setActiveRoom(e.detail.roomId);
            setActiveGroup(null);
            setMobileSidebar('none');
        };

        const handleGroupSelect = (e: any) => {
            setActiveGroup(e.detail.groupId);
            setActiveRoom(null);
            setMobileSidebar('none');
        };

        window.addEventListener('select_room', handleRoomSelect);
        window.addEventListener('select_group', handleGroupSelect);
        return () => {
            window.removeEventListener('select_room', handleRoomSelect);
            window.removeEventListener('select_group', handleGroupSelect);
        };
    }, []);

    useEffect(() => {
        if (!activeRoom) {
            setActiveRoomName('');
            return;
        }
        const unsub = onSnapshot(doc(db, 'rooms', activeRoom), (snap) => {
            if (snap.exists()) {
                setActiveRoomName(snap.data().name);
            } else {
                setActiveRoomName(activeRoom);
            }
        });
        return () => unsub();
    }, [activeRoom]);

    useEffect(() => {
        if (!activeGroup) {
            setActiveGroupName('');
            return;
        }
        const unsub = onSnapshot(doc(db, 'groups', activeGroup), (snap) => {
            if (snap.exists()) {
                setActiveGroupName(snap.data().name);
            }
        });
        return () => unsub();
    }, [activeGroup]);

    const toggleSidebar = (target: 'rooms' | 'users') => {
        setMobileSidebar(current => current === target ? 'none' : target);
    };

    const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;

    return (
        <div className={`app-shell ${mobileSidebar !== 'none' ? 'sidebar-open' : ''}`}>
            <div className={`sidebar-overlay ${mobileSidebar !== 'none' ? 'show' : ''}`} onClick={() => setMobileSidebar('none')} />

            <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 0, pointerEvents: 'none', opacity: 1, transition: 'opacity 0.5s' }}>
                <Ballpit
                    count={isMobile ? 60 : 130}
                    gravity={0.05}
                    friction={0.9975}
                    wallBounce={0.8}
                    followCursor={!isMobile}
                    colors={[0x5865F2, 0x4752C4, 0x3B448F, 0x23A559, 0xF23F42]}
                />
            </div>

            <div className={`rooms-container ${mobileSidebar === 'rooms' ? 'mobile-active' : ''}`}>
                <RoomSidebar
                    activeRoom={activeRoom}
                    onRoomSelect={(id) => { setActiveRoom(id); setMobileSidebar('none'); }}
                    activeGroup={activeGroup}
                    onGroupSelect={(id) => { setActiveGroup(id); setMobileSidebar('none'); }}
                />
            </div>

            <main className="main-area">
                <header className="main-header" style={{ background: (isMobile && (activeRoom || activeGroup)) ? 'rgba(49, 51, 56, 0.8)' : undefined, backdropFilter: (isMobile && (activeRoom || activeGroup)) ? 'blur(10px)' : undefined }}>
                    <button className="mobile-toggle" onClick={() => toggleSidebar('rooms')}>
                        <FaVolumeUp />
                    </button>

                    <div className="header-info">
                        {activeRoom ? (
                            <>
                                <span style={{ color: 'var(--text-muted)' }}><FaVolumeUp /></span>
                                <GradientText showBorder={false} animationSpeed={6}>
                                    <span style={{ fontWeight: 'bold' }}>{activeRoomName || 'Yükleniyor...'}</span>
                                </GradientText>
                            </>
                        ) : activeGroup ? (
                            <>
                                <span style={{ color: 'var(--text-muted)' }}><FaHashtag size={14} /></span>
                                <GradientText showBorder={false} animationSpeed={6}>
                                    <span style={{ fontWeight: 'bold' }}>{activeGroupName || 'Yükleniyor...'}</span>
                                </GradientText>
                            </>
                        ) : (
                            <span />
                        )}
                    </div>

                    <button className="mobile-toggle" onClick={() => toggleSidebar('users')}>
                        <FaUserFriends />
                    </button>
                </header>

                <div className="main-content" style={{
                    background: (isMobile && (activeRoom || activeGroup)) ? 'rgba(49, 51, 56, 0.6)' : 'transparent',
                    backdropFilter: (isMobile && (activeRoom || activeGroup)) ? 'blur(12px)' : 'none',
                    borderRadius: (isMobile && (activeRoom || activeGroup)) ? '12px 12px 0 0' : undefined,
                    margin: (isMobile && (activeRoom || activeGroup)) ? '8px 8px 0 8px' : undefined
                }}>
                    {activeRoom && (
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                            <VoiceRoom roomId={activeRoom} onBack={() => setActiveRoom(null)} />
                        </div>
                    )}
                    {activeGroup && (
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                            <GroupChat groupId={activeGroup} onBack={() => setActiveGroup(null)} />
                        </div>
                    )}
                    {(!activeRoom && !activeGroup) && (
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 20 }}>
                            <GradientText animationSpeed={3}>
                                <h1 style={{ fontSize: '3.5rem', margin: 0 }}>Hoş Geldin!</h1>
                            </GradientText>
                            <p style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: '1.2rem', fontWeight: 500 }}>
                                Arkadaşlarını bul ve sohbete başla.
                            </p>
                        </div>
                    )}
                </div>
            </main>

            <div className={`users-container ${mobileSidebar === 'users' ? 'mobile-active' : ''}`}>
                <UserPanel onGroupSelect={(id) => { setActiveGroup(id); setActiveRoom(null); setMobileSidebar('none'); }} />
            </div>
        </div>
    );
}

