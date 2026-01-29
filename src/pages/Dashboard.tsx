import { useState, useEffect } from 'react';
import { ServerSidebar, RoomSidebar, UserPanel } from '../components/Layout';
import VoiceRoom from '../components/VoiceRoom';
import GroupChat from '../components/GroupChat';
import { FaVolumeUp, FaPlus } from 'react-icons/fa';
import '../styles/layout.css';

export default function Dashboard() {
    const [activeRoom, setActiveRoom] = useState<string | null>(null);
    const [activeGroup, setActiveGroup] = useState<string | null>(null);

    useEffect(() => {
        const handleRoomSelect = (e: any) => {
            setActiveRoom(e.detail.roomId);
            setActiveGroup(null);
        };

        window.addEventListener('select_room', handleRoomSelect);
        return () => window.removeEventListener('select_room', handleRoomSelect);
    }, []);

    return (
        <div className="app-shell">
            <ServerSidebar />
            <RoomSidebar
                activeRoom={activeRoom}
                onRoomSelect={setActiveRoom}
                activeGroup={activeGroup}
                onGroupSelect={setActiveGroup}
            />

            <main className="main-area">
                <header className="main-header">
                    {activeRoom ? (
                        <>
                            <span style={{ color: 'var(--text-muted)' }}><FaVolumeUp /></span>
                            <span style={{ fontWeight: 'bold' }}>{activeRoom}</span>
                        </>
                    ) : activeGroup ? (
                        <>
                            <span style={{ color: 'var(--text-muted)' }}><FaPlus size={12} /></span>
                            <span style={{ fontWeight: 'bold' }}>Grup Sohbeti</span>
                        </>
                    ) : (
                        <span style={{ color: 'var(--text-muted)' }}>Lütfen bir odaya katılın</span>
                    )}
                </header>

                <div className="main-content">
                    {activeRoom ? (
                        <VoiceRoom roomId={activeRoom} />
                    ) : activeGroup ? (
                        <GroupChat groupId={activeGroup} />
                    ) : (
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', textAlign: 'center' }}>
                            <div>
                                <h1>Sesli Sohbet'e Hoş Geldin!</h1>
                                <p>Sol taraftaki listeden bir odaya girerek hemen sohbete başlayabilirsin.</p>
                            </div>
                        </div>
                    )}
                </div>
            </main>

            <UserPanel />
        </div>
    );
}

