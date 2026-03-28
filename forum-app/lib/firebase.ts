import { initializeApp, getApps } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyC3DVgiYwYbueH4Xyv5WkSUnUqbHzDWriQ",
  authDomain: "komu-notes.firebaseapp.com",
  projectId: "komu-notes",
  storageBucket: "komu-notes.firebasestorage.app",
  messagingSenderId: "530718193944",
  appId: "1:530718193944:web:e2dbc1bcff25314808466d",
  measurementId: "G-SZV6EWF583"
};

// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

export { auth, db, googleProvider };