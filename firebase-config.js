import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInAnonymously, onAuthStateChanged, signOut, connectAuthEmulator } from 'https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js';
import { getFirestore, collection, addDoc, onSnapshot, query, where, doc, updateDoc, deleteDoc, orderBy, setDoc, connectFirestoreEmulator } from 'https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js';

// TODO: Replace with your actual Firebase project configuration
const firebaseConfig = {
    apiKey: "AIzaSyDIJLfgvlhoxhGLYl11k2wh6D02ygIRvBo",
    authDomain: "letschore.firebaseapp.com",
    projectId: "letschore",
    storageBucket: "letschore.firebasestorage.app",
    messagingSenderId: "992540022639",
    appId: "1:992540022639:web:f618aa667006ff19717a9a",
    measurementId: "G-WGBE9VRPCF"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Enable Emulator support for local testing
if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
    // 🔥 If you want to use emulators, you MUST run `firebase emulators:start` first
    // AND make sure your web server is NOT on port 8080 (use 5173 or 3000 instead).
    // connectAuthEmulator(auth, "http://127.0.0.1:9099");
    // connectFirestoreEmulator(db, "127.0.0.1", 8080);
    console.log("🚀 Running on Localhost - Connecting to PRODUCTION Firebase.");
}

export { auth, db, GoogleAuthProvider, signInWithPopup, signInAnonymously, onAuthStateChanged, signOut, collection, addDoc, onSnapshot, query, where, doc, updateDoc, deleteDoc, orderBy, setDoc };
