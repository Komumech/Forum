import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const googleProvider = new GoogleAuthProvider();

// Komu Calendar Secondary App
const komuConfig = {
  apiKey: "AIzaSyBvY0mqrvG5LrwMfyUoNNf1FWB-5_NR2G8",
  authDomain: "komu-notes.firebaseapp.com",
  projectId: "komu-notes",
  storageBucket: "komu-notes.firebasestorage.app",
  messagingSenderId: "530718193944",
  appId: "1:530718193944:web:079b5fad58c9c43308466d"
};

// ... existing imports ...

const komuApp = initializeApp(komuConfig, "komu");
export const komuDb = getFirestore(komuApp);

// ADD THIS LINE:
export const komuAuth = getAuth(komuApp); 

export { signInWithPopup, signOut };