import { useState, useEffect } from 'react';
import { RoomSidebar, UserPanel } from '../components/Layout';
import VoiceRoom from '../components/VoiceRoom';
import GroupChat from '../components/GroupChat';
import CallDialingOverlay from '../components/CallDialingOverlay';
import IncomingGroupCall from '../components/IncomingGroupCall';
import { FaVolumeUp, FaPlus, FaUserFriends, FaHashtag, FaChevronLeft } from 'react-icons/fa';
import { db } from '../firebase';
import { doc, onSnapshot, setDoc, serverTimestamp, collection, query, where, getDocs, updateDoc } from 'firebase/firestore';
import GradientText from '../components/GradientText';
import Ballpit from '../components/Ballpit';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import '../styles/layout.css';

export default function Dashboard() {
    const [activeRoom, setActiveRoom] = useState<string | null>(null);
    const [activeGroup, setActiveGroup] = useState<string | null>(null);
    const [activeRoomName, setActiveRoomName] = useState<string>('');
    const [activeGroupName, setActiveGroupName] = useState<string>('');
    const [mobileSidebar, setMobileSidebar] = useState<'none' | 'rooms' | 'users'>('none');
    // mountedRoom = room that is actually mounted (never unmounts during session)
    // isRoomVisible = whether VoiceRoom panel is shown in the UI right now
    const [mountedRoom, setMountedRoom] = useState<string | null>(null);
    const [isRoomVisible, setIsRoomVisible] = useState(false);

    // Always show balloons on the welcome screen
    const showBalloons = true;

    // New Dialing State
    const [dialingRoom, setDialingRoom] = useState<{ roomId: string, type: 'voice' | 'video', calleeName: string } | null>(null);
    const [incomingGroupCall, setIncomingGroupCall] = useState<{
        callId: string;
        callerName: string;
        callerPhotoURL?: string;
        groupId: string;
        roomId: string;
    } | null>(null);

    const { currentUser } = useAuth();
    const { t } = useLanguage();

    useEffect(() => {
        // 1. Check URL params first — handles invite links like /?room=roomId
        const urlParams = new URLSearchParams(window.location.search);
        const urlRoom = urlParams.get('room');
        if (urlRoom) {
            // Clean the URL so it doesn't persist on refresh
            window.history.replaceState({}, '', window.location.pathname);
            setActiveRoom(urlRoom);
            setMountedRoom(urlRoom);
            setIsRoomVisible(true);
            localStorage.setItem('activeRoom', urlRoom);
            localStorage.removeItem('activeGroup');
        } else {
            // 2. Restore from localStorage on normal mount
            const savedRoom = localStorage.getItem('activeRoom');
            const savedGroup = localStorage.getItem('activeGroup');
            if (savedRoom) { setActiveRoom(savedRoom); setMountedRoom(savedRoom); setIsRoomVisible(true); }
            else if (savedGroup) setActiveGroup(savedGroup);
        }

        const handleRoomSelect = (e: any) => {
            handleNavigationState();
            const newRoomId = e.detail.roomId;
            setActiveRoom(newRoomId);
            setMountedRoom(newRoomId);
            setIsRoomVisible(true);
            setActiveGroup(null);
            setMobileSidebar('none');
            // Persist
            localStorage.setItem('activeRoom', newRoomId);
            localStorage.removeItem('activeGroup');
        };

        const handleGroupSelect = (e: any) => {
            handleNavigationState();
            setActiveGroup(e.detail.groupId);
            if (e.detail.groupId) {
                // Only hide the room UI if we are entering a REAL group.
                setActiveRoom(null);
                setIsRoomVisible(false); // hide VoiceRoom but keep it mounted
            }
            setMobileSidebar('none');
            // Persist (only if we have a group, but we might rely on the clearing below otherwise)
            if (e.detail.groupId) {
                localStorage.setItem('activeGroup', e.detail.groupId);
                localStorage.removeItem('activeRoom');
            }
        };

        const handleDialingRoom = (e: any) => {
            setDialingRoom({
                roomId: e.detail.roomId,
                type: e.detail.type,
                calleeName: e.detail.calleeName
            });
        };

        window.addEventListener('select_room', handleRoomSelect);
        window.addEventListener('select_group', handleGroupSelect);
        window.addEventListener('dialing_room', handleDialingRoom);
        return () => {
            window.removeEventListener('select_room', handleRoomSelect);
            window.removeEventListener('select_group', handleGroupSelect);
            window.removeEventListener('dialing_room', handleDialingRoom);
        };
    }, []);

    useEffect(() => {
        if (!activeRoom) {
            setActiveRoomName('');
            return;
        }
        const unsub = onSnapshot(doc(db, 'rooms', activeRoom), async (snap) => {
            if (snap.exists()) {
                const data = snap.data();
                const participants: string[] = data.participants || [];
                // For private 1-on-1 calls, show the OTHER user's name instead of raw room name
                if (participants.length === 2 && currentUser) {
                    const otherUid = participants.find(uid => uid !== currentUser.uid);
                    if (otherUid) {
                        try {
                            const { getDoc: gd } = await import('firebase/firestore');
                            const userSnap = await gd(doc(db, 'users', otherUid));
                            if (userSnap.exists()) {
                                setActiveRoomName(userSnap.data()?.displayName || data.name);
                                return;
                            }
                        } catch (_) { /* ignore */ }
                    }
                }
                setActiveRoomName(data.name);
            } else {
                setActiveRoomName(activeRoom);
            }
        });
        return () => unsub();
    }, [activeRoom, currentUser]);

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

    const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth <= 768);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth <= 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        // Handle Hardware Back Button
        const handlePopState = (event: PopStateEvent) => {
            // Hide VoiceRoom panel (keep call alive in background)
            if (isRoomVisible) {
                setIsRoomVisible(false);
                setActiveRoom(null);
                localStorage.removeItem('activeRoom');
                return;
            }
            if (activeGroup) {
                setActiveGroup(null);
                setMobileSidebar('none');
                localStorage.removeItem('activeGroup');
            }
        };

        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, [activeRoom, activeGroup]);

    const handleNavigationState = () => {
        if (isMobile) {
            // Push a state so the back button checks this entry first
            window.history.pushState({ panel: 'chat' }, '');
        }
    };

    // Listen for incoming GROUP CALLS from Firestore
    useEffect(() => {
        if (!currentUser) return;

        // Request browser notification permission proactively
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }

        const q = query(
            collection(db, 'groupCalls'),
            where('members', 'array-contains', currentUser.uid),
            where('status', '==', 'ringing')
        );

        const unsub = onSnapshot(q, (snap) => {
            for (const d of snap.docs) {
                const data = d.data();
                // Skip if we are the caller or already responded
                if (data.callerId === currentUser.uid) continue;
                if (data.responses?.[currentUser.uid]) continue;

                setIncomingGroupCall({
                    callId: d.id,
                    callerName: data.callerName,
                    callerPhotoURL: data.callerPhotoURL,
                    groupId: data.groupId,
                    roomId: data.roomId,
                });

                // Show browser notification if tab not focused
                if ('Notification' in window && Notification.permission === 'granted' && document.visibilityState === 'hidden') {
                    new Notification(`📞 ${data.callerName} ${t('group_call_invite_title')}`, {
                        body: t('click_to_join'),
                        icon: data.callerPhotoURL || '/pwa-192x192.png'
                    });
                }
                break; // Show only one call at a time
            }

            // If no ringing calls remain for us, hide the overlay
            const stillRinging = snap.docs.some(d => {
                const data = d.data();
                return data.callerId !== currentUser.uid && !data.responses?.[currentUser.uid];
            });
            if (!stillRinging) setIncomingGroupCall(null);
        });

        return () => unsub();
    }, [currentUser]);

    const handleAcceptGroupCall = async (roomId: string) => {
        if (!currentUser || !incomingGroupCall) return;
        try {
            await updateDoc(doc(db, 'groupCalls', incomingGroupCall.callId), {
                [`responses.${currentUser.uid}`]: 'accepted'
            });
        } catch (_) { /* ignore */ }
        setIncomingGroupCall(null);
        window.dispatchEvent(new CustomEvent('select_room', { detail: { roomId } }));
    };

    const handleDeclineGroupCall = async () => {
        if (!currentUser || !incomingGroupCall) return;
        try {
            await updateDoc(doc(db, 'groupCalls', incomingGroupCall.callId), {
                [`responses.${currentUser.uid}`]: 'declined'
            });
        } catch (_) { /* ignore */ }
        setIncomingGroupCall(null);
    };






    return (
        <div
            className={`app-shell ${mobileSidebar !== 'none' ? 'sidebar-open' : ''}`}
            style={{ paddingTop: (mountedRoom && !isRoomVisible) ? '40px' : 0, transition: 'padding-top 0.3s ease' }}
        >
            {dialingRoom && (
                <CallDialingOverlay
                    roomId={dialingRoom.roomId}
                    calleeName={dialingRoom.calleeName}
                    onCancel={() => setDialingRoom(null)}
                    onAccepted={(roomId) => {
                        setDialingRoom(null);
                        window.dispatchEvent(new CustomEvent('select_room', { detail: { roomId } }));
                    }}
                />
            )}

            {/* INCOMING GROUP CALL OVERLAY */}
            {incomingGroupCall && (
                <IncomingGroupCall
                    callId={incomingGroupCall.callId}
                    callerName={incomingGroupCall.callerName}
                    callerPhotoURL={incomingGroupCall.callerPhotoURL}
                    groupId={incomingGroupCall.groupId}
                    roomId={incomingGroupCall.roomId}
                    onAccept={handleAcceptGroupCall}
                    onDecline={handleDeclineGroupCall}
                />
            )}

            {/* GLOBAL ONGOING CALL BANNER */}
            {mountedRoom && !isRoomVisible && (
                <div
                    onClick={() => { setActiveGroup(null); setActiveRoom(mountedRoom); setIsRoomVisible(true); }}
                    onTouchEnd={(e) => { e.preventDefault(); setActiveGroup(null); setActiveRoom(mountedRoom); setIsRoomVisible(true); }}
                    role="button"
                    tabIndex={0}
                    style={{
                        position: 'fixed', top: 0, left: 0, right: 0,
                        background: 'linear-gradient(90deg, #23A559, #1a7a42)',
                        color: 'white', padding: '10px 16px', zIndex: 99999,
                        display: 'flex', alignItems: 'center', gap: '10px',
                        cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600,
                        boxShadow: '0 2px 15px rgba(35,165,89,0.5)',
                        justifyContent: 'center',
                        minHeight: '48px',
                        touchAction: 'manipulation',
                        WebkitTapHighlightColor: 'rgba(0,0,0,0)',
                        userSelect: 'none'
                    }}
                >
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#7cff9e', display: 'inline-block', animation: 'pulse 1.5s infinite' }} />
                    <style>{`@keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.5;transform:scale(1.3)} }`}</style>
                    <span>{t('ongoing_call')}</span>
                </div>
            )}


            <div className={`sidebar-overlay ${mobileSidebar !== 'none' ? 'show' : ''}`} onClick={() => setMobileSidebar('none')} />

            <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 0, pointerEvents: 'none', opacity: 1, transition: 'opacity 0.5s' }}>
                {showBalloons && (
                    <Ballpit
                        count={isMobile ? 60 : 130}
                        gravity={0.05}
                        friction={0.9975}
                        wallBounce={0.8}
                        followCursor={!isMobile}
                        colors={[0x5865F2, 0x4752C4, 0x3B448F, 0x23A559, 0xF23F42]}
                    />
                )}
            </div>

            <div className={`rooms-container ${mobileSidebar === 'rooms' ? 'mobile-active' : ''}`}>
                <RoomSidebar
                    activeRoom={activeRoom}
                    onRoomSelect={(id) => {
                        if (id) {
                            setActiveRoom(id);
                            setMountedRoom(id);
                            setIsRoomVisible(true); // Show room UI
                            setActiveGroup(null);
                        } else {
                            setActiveRoom(null);
                        }
                        setMobileSidebar('none');
                    }}
                    activeGroup={activeGroup}
                    onGroupSelect={(id) => {
                        setActiveGroup(id);
                        if (id) {
                            // Hide room UI ONLY when actually entering a chat.
                            setIsRoomVisible(false);
                            setActiveRoom(null);
                        }
                        setMobileSidebar('none');
                    }}
                />
            </div>

            <main className="main-area">
                <header className="main-header" style={{
                    background: (isMobile && (activeRoom || activeGroup)) ? 'rgba(49, 51, 56, 0.8)' : undefined,
                    backdropFilter: (isMobile && (activeRoom || activeGroup)) ? 'blur(10px)' : undefined,
                    display: activeGroup ? 'none' : 'flex'
                }}>
                    {/* Always show rooms sidebar toggle on LEFT */}
                    <button className="mobile-toggle" onClick={() => toggleSidebar('rooms')}>
                        <FaVolumeUp />
                    </button>

                    <div className="header-info">
                        {activeRoom ? (
                            <span />
                        ) : activeGroup ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                                <GradientText showBorder={false} animationSpeed={6}>
                                    <span style={{ fontWeight: 'bold', fontSize: '1.2rem', lineHeight: '1.2' }}>{activeGroupName || t('loading')}</span>
                                </GradientText>
                            </div>
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
                    margin: (isMobile && (activeRoom || activeGroup)) ? '8px 8px 0 8px' : undefined,
                    // Fix for double scroll and layout issues in chat/video mode
                    display: 'flex',
                    flex: 1,
                    position: 'relative',
                    overflow: (activeRoom || activeGroup) ? 'hidden' : undefined,
                    padding: (activeRoom || activeGroup) ? 0 : undefined,
                    flexWrap: (activeRoom || activeGroup) ? 'nowrap' : undefined,
                    flexDirection: (activeRoom || activeGroup) ? 'column' : undefined
                }}>
                    {/* Persistent VoiceRoom - mounted once, shown/hidden via CSS */}
                    {mountedRoom && (
                        <div style={{ flex: 1, display: isRoomVisible ? 'flex' : 'none', flexDirection: 'column', minHeight: 0 }}>
                            <VoiceRoom
                                roomId={mountedRoom}
                                onBack={() => {
                                    // True disconnect: clear everything
                                    setActiveRoom(null);
                                    setMountedRoom(null);
                                    setIsRoomVisible(false);
                                    localStorage.removeItem('activeRoom');
                                }}
                            />
                        </div>
                    )}
                    {/* Mini "Return to Call" banner when in a group chat while a call is active (moved to global scope above) */}
                    {activeGroup && (
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, position: 'relative', zIndex: 1000 }}>
                            <GroupChat groupId={activeGroup} onBack={() => { setActiveGroup(null); localStorage.removeItem('activeGroup'); }} />
                        </div>
                    )}
                    {/* Welcome screen: only show when no call is visible and no group is open */}
                    {(!isRoomVisible && !activeGroup) && (
                        (() => {
                            // Recovery Check: If we have a saved room, don't show Welcome yet.
                            // We are likely in a mounting race.
                            const savedRoom = localStorage.getItem('activeRoom');

                            if (savedRoom) {
                                return (
                                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 20 }}>
                                        <div className="loading-spinner" style={{ width: 40, height: 40, border: '4px solid rgba(255,255,255,0.1)', borderTopColor: 'var(--brand)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                                        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
                                        <p>{t('connecting')}</p>
                                    </div>
                                );
                            }

                            return (
                                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 20 }}>
                                    <GradientText animationSpeed={3}>
                                        <h1 style={{ fontSize: '3.5rem', margin: 0 }}>{t('welcome')}</h1>
                                    </GradientText>
                                    <p style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: '1.2rem', fontWeight: 500 }}>
                                        {t('welcome_subtitle')}
                                    </p>
                                </div>
                            );
                        })()
                    )}
                </div>
            </main>

            <div className={`users-container ${mobileSidebar === 'users' ? 'mobile-active' : ''}`}>
                <UserPanel onGroupSelect={(id) => { setActiveGroup(id); setActiveRoom(null); setMobileSidebar('none'); }} />
            </div>
        </div>
    );
}

