import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, signInWithCredential } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import appletConfig from '../firebase-applet-config.json';

// Clear any stale local configuration from prior experiments
if (typeof window !== 'undefined') {
  try {
    localStorage.removeItem('custom_firebase_config');
  } catch (e) {
    // ignore
  }
}

export const firebaseConfig = appletConfig;

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);

const dbId = (firebaseConfig as any).firestoreDatabaseId;
export const db = (!dbId || dbId === '(default)') ? getFirestore(app) : getFirestore(app, dbId);

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account',
});

// Unified db and auth exports
export const komuDb = db;
export const komuAuth = auth;

export { signInWithPopup, signOut, signInWithCredential };

// Connection verification as recommended by Firebase skill
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn("Firestore client offline, retrying...");
    }
  }
}
testConnection();



