import React, { createContext, useContext, useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../firebase';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';

interface AuthContextType {
    currentUser: User | null;
    userData: any;
    loading: boolean;
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
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [userData, setUserData] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let unsubUserData: (() => void) | undefined;

        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            console.log("Auth state changed, user:", user?.uid || 'none');
            setCurrentUser(user);

            if (user) {
                // Ensure user doc exists and listen to it
                const userRef = doc(db, 'users', user.uid);

                unsubUserData = onSnapshot(userRef, (docSnap) => {
                    if (docSnap.exists()) {
                        setUserData(docSnap.data());
                    } else {
                        // Create initial doc if it doesn't exist
                        setDoc(userRef, {
                            uid: user.uid,
                            email: user.email,
                            displayName: user.displayName || 'İsimsiz',
                            photoURL: user.photoURL || '',
                            friends: [],
                            createdAt: Date.now()
                        }, { merge: true });
                    }
                    setLoading(false);
                });
            } else {
                setUserData(null);
                setLoading(false);
            }
        }, (error) => {
            console.error("Auth state change error:", error);
            setLoading(false);
        });

        return () => {
            unsubscribe();
            if (unsubUserData) unsubUserData();
        };
    }, []);

    const value = {
        currentUser,
        userData,
        loading
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

