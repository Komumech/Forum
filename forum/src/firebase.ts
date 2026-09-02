import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, signInWithCredential } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';

// Clear any stale local configuration from prior experiments
if (typeof window !== 'undefined') {
  try {
    localStorage.removeItem('custom_firebase_config');
  } catch (e) {
    // ignore
  }
}

// Direct Firebase configuration for forum-8f34e
export const firebaseConfig = {
  apiKey: "AIzaSyAjdaGsN05HXjBP9zPKsHhMkH7qaGCpGPc",
  authDomain: "forum-8f34e.firebaseapp.com",
  projectId: "forum-8f34e",
  storageBucket: "forum-8f34e.firebasestorage.app",
  messagingSenderId: "61945874515",
  appId: "1:61945874515:web:47e665a5cc834558f75ea6",
  measurementId: "G-1ETEYSQRRB",
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);

export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
  ignoreUndefinedProperties: true,
});

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account',
});

// Unified db and auth exports
export const komuDb = db;
export const komuAuth = auth;

export { signInWithPopup, signOut, signInWithCredential };



