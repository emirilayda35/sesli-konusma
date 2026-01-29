import React, { createContext, useContext, useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db, getAuthForUser, getDbForUser } from '../firebase';
import { doc, onSnapshot, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';

interface AuthAccount {
    uid: string;
    email: string | null;
    displayName: string | null;
    photoURL: string | null;
}
interface AuthContextType {
    currentUser: User | null;
    userData: any;
    loading: boolean;
    savedAccounts: AuthAccount[];
    switchAccount: (uid: string) => Promise<void>;
    addAccount: (user: any) => void;
    logoutCurrent: () => Promise<void>;
    logoutAll: () => Promise<void>;
    db: any;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [activeUid, setActiveUid] = useState(localStorage.getItem('vc_active_uid') || 'default');
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [userData, setUserData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [savedAccounts, setSavedAccounts] = useState<AuthAccount[]>(() => {
        const saved = localStorage.getItem('vc_saved_accounts');
        return saved ? JSON.parse(saved) : [];
    });

    useEffect(() => {
        localStorage.setItem('vc_saved_accounts', JSON.stringify(savedAccounts));
    }, [savedAccounts]);

    useEffect(() => {
        localStorage.setItem('vc_active_uid', activeUid);
    }, [activeUid]);

    useEffect(() => {
        setLoading(true);
        const currentAuth = getAuthForUser(activeUid);
        const currentDb = getDbForUser(activeUid);

        let unsubUserData: (() => void) | undefined;
        let heartbeatInterval: any;

        const presenceUpdate = async (uid: string, online: boolean) => {
            try {
                await updateDoc(doc(currentDb, 'users', uid), {
                    isOnline: online,
                    lastActive: serverTimestamp()
                });
            } catch (err) {
                console.error("Presence update error:", err);
            }
        };

        const unsubscribe = onAuthStateChanged(currentAuth, async (user) => {
            console.log(`Auth switch [${activeUid}]:`, user?.uid || 'none');

            if (user) {
                const userRef = doc(currentDb, 'users', user.uid);

                // Add to saved accounts if not exists
                setSavedAccounts(prev => {
                    if (prev.find(a => a.uid === user.uid)) return prev;
                    return [...prev, {
                        uid: user.uid,
                        email: user.email,
                        displayName: user.displayName,
                        photoURL: user.photoURL
                    }];
                });

                // Set initial status
                await presenceUpdate(user.uid, true);

                // Set up heartbeat
                heartbeatInterval = setInterval(() => {
                    presenceUpdate(user.uid, true);
                }, 120000); // Every 2 minutes

                unsubUserData = onSnapshot(userRef, (docSnap) => {
                    if (docSnap.exists()) {
                        const data = docSnap.data();
                        setUserData(data);
                        // Sync saved accounts display metadata
                        setSavedAccounts(prev => prev.map(a =>
                            a.uid === user.uid ? { ...a, displayName: data.displayName, photoURL: data.photoURL } : a
                        ));
                    } else {
                        setDoc(userRef, {
                            uid: user.uid,
                            email: user.email,
                            displayName: user.displayName || 'İsimsiz',
                            photoURL: user.photoURL || '',
                            friends: [],
                            isOnline: true,
                            lastActive: serverTimestamp(),
                            createdAt: Date.now()
                        }, { merge: true });
                    }
                    setLoading(false);
                });
                setCurrentUser(user);
            } else {
                if (currentUser) {
                    presenceUpdate(currentUser.uid, false);
                }
                clearInterval(heartbeatInterval);
                setUserData(null);
                setCurrentUser(null);
                setLoading(false);
            }
        });

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible' && currentAuth.currentUser) {
                presenceUpdate(currentAuth.currentUser.uid, true);
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            unsubscribe();
            if (unsubUserData) unsubUserData();
            if (heartbeatInterval) clearInterval(heartbeatInterval);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            if (currentAuth.currentUser) presenceUpdate(currentAuth.currentUser.uid, false);
        };
    }, [activeUid]);

    const addAccount = (user: any) => {
        setSavedAccounts(prev => {
            if (prev.find(a => a.uid === user.uid)) return prev;
            return [...prev, { uid: user.uid, email: user.email, displayName: user.displayName, photoURL: user.photoURL }];
        });
        setActiveUid(user.uid);
    };

    const switchAccount = async (uid: string) => {
        setActiveUid(uid);
    };

    const logoutCurrent = async () => {
        if (!currentUser) return;
        const currentAuth = getAuthForUser(activeUid);
        await currentAuth.signOut();
        setSavedAccounts(prev => prev.filter(a => a.uid !== activeUid));
        setActiveUid('default');
    };

    const logoutAll = async () => {
        localStorage.removeItem('vc_active_uid');
        localStorage.removeItem('vc_saved_accounts');
        window.location.reload();
    };

    const value = {
        currentUser,
        userData,
        loading,
        savedAccounts,
        switchAccount,
        addAccount,
        logoutCurrent,
        logoutAll,
        db: getDbForUser(activeUid)
    };

    return (
        <AuthContext.Provider value={value}>
            {loading ? (
                <div style={{ display: 'flex', height: '100vh', width: '100vw', alignItems: 'center', justifyContent: 'center', backgroundColor: '#36393f', color: 'white', fontFamily: 'sans-serif' }}>
                    Uygulama yükleniyor...
                </div>
            ) : children}
        </AuthContext.Provider>
    );
}

