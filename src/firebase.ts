import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getAnalytics, isSupported } from "firebase/analytics";
import { getStorage } from "firebase/storage";

// Your web app's Firebase configuration
export const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};


// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Multi-App support helpers
export const getActiveApp = (uid?: string) => {
    // If no UID, return the default app
    if (!uid || uid === 'default') return app;

    const name = `app-${uid}`;
    const existing = getApps().find(a => a.name === name);
    if (existing) return existing;

    // Create a new app instance for this specific user
    return initializeApp(firebaseConfig, name);
};

export const getAuthForUser = (uid?: string) => getAuth(getActiveApp(uid));
export const getDbForUser = (uid?: string) => getFirestore(getActiveApp(uid));

// Initialize analytics safely
export const analytics = isSupported().then(yes => yes ? getAnalytics(app) : null);

console.log("Firebase initialized");


