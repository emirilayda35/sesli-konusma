import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getAnalytics, isSupported } from "firebase/analytics";
import { getStorage } from "firebase/storage";

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyAg1C5PHtTnAfAXuThp8dW9oWbaOccmgkw",
    authDomain: "seslisohbet-b533b.firebaseapp.com",
    projectId: "seslisohbet-b533b",
    storageBucket: "seslisohbet-b533b.firebasestorage.app",
    messagingSenderId: "323039518554",
    appId: "1:323039518554:web:96226d4c864a852fe39d63",
    measurementId: "G-Q8D8XSMLCY"
};

// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Initialize analytics safely
export const analytics = isSupported().then(yes => yes ? getAnalytics(app) : null);

console.log("Firebase initialized");


