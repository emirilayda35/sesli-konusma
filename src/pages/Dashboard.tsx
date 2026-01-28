import { useState } from 'react';
import { ServerSidebar, RoomSidebar, UserPanel } from '../components/Layout';
import VoiceRoom from '../components/VoiceRoom';
import '../styles/layout.css';

export default function Dashboard() {
    const [activeRoom, setActiveRoom] = useState<string | null>(null);

    return (
        <div className="app-shell">
            <ServerSidebar />
            <RoomSidebar activeRoom={activeRoom} onRoomSelect={setActiveRoom} />

            <main className="main-area">
                <header className="main-header">
                    {activeRoom ? (
                        <>
                            <span style={{ color: 'var(--text-muted)' }}><FaVolumeUp /></span>
                            <span style={{ fontWeight: 'bold' }}>{activeRoom === 'genel' ? 'Genel' : 'Oyun Odası'}</span>
                        </>
                    ) : (
                        <span style={{ color: 'var(--text-muted)' }}>Lütfen bir odaya katılın</span>
                    )}
                </header>

                <div className="main-content">
                    {activeRoom ? (
                        <VoiceRoom roomId={activeRoom} />
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

// Inline helper for icons since they are imported in Layout but used here
import { FaVolumeUp } from 'react-icons/fa';
