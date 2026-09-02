import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, onAuthStateChanged, GoogleAuthProvider } from 'firebase/auth';
import { auth, komuAuth, googleProvider, signInWithPopup, signOut, signInWithCredential } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

interface UserPreferences {
  displayName: string;
  theme: 'light' | 'dark';
  lastRoom?: string;
  lastJoinedAt?: string;
}

interface AuthContextType {
  user: User | null;
  komuUser: User | null;
  loading: boolean;
  isLoggingIn: boolean;
  authError: string | null;
  preferences: UserPreferences | null;
  login: () => Promise<void>;
  komuLogin: () => Promise<void>;
  logout: () => Promise<void>;
  clearAuthError: () => void;
  updatePreferences: (prefs: Partial<UserPreferences>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [komuUser, setKomuUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);

  useEffect(() => {
    // Safety timeout to ensure app never stays stuck in loading state in preview iframe
    const safetyTimeout = setTimeout(() => {
      setLoading(false);
    }, 1200);

    // Listen for main app auth changes
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      clearTimeout(safetyTimeout);
      setUser(u);
      setKomuUser(u);
      setLoading(false);
      
      if (u) {
        setAuthError(null);
        // Non-blocking background sync for profile and preferences
        (async () => {
          try {
            await setDoc(doc(db, 'userProfiles', u.uid), {
              displayName: u.displayName,
              email: u.email,
              photoURL: u.photoURL,
              lastSeen: new Date().toISOString()
            }, { merge: true });

            const docRef = doc(db, 'users', u.uid);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
              setPreferences(docSnap.data() as UserPreferences);
            } else {
              const defaultPrefs: UserPreferences = {
                displayName: u.displayName || 'Guest',
                theme: 'light',
              };
              await setDoc(docRef, defaultPrefs);
              setPreferences(defaultPrefs);
            }
          } catch (error) {
            console.warn("Background preferences sync skipped:", error);
          }
        })();
      } else {
        setPreferences(null);
      }
    });

    return () => {
      clearTimeout(safetyTimeout);
      unsubscribe();
    };
  }, []);

  const login = async () => {
    setIsLoggingIn(true);
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      console.error("Login failed:", error);
      if (error?.code === 'auth/unauthorized-domain') {
        setAuthError('This domain is not authorized in your Firebase Console. Please add the app domain to Authentication > Settings > Authorized domains.');
      } else if (error?.code === 'auth/configuration-not-found' || error?.code === 'auth/operation-not-allowed') {
        setAuthError('Google Sign-in provider is not enabled in your Firebase Console. Please enable Google under Authentication > Sign-in method.');
      } else if (error?.code !== 'auth/popup-closed-by-user' && error?.code !== 'auth/cancelled-popup-request') {
        setAuthError(error?.message || 'Google sign-in could not be completed.');
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const komuLogin = async () => {
    if (!user) {
      await login();
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      setAuthError(null);
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const clearAuthError = () => {
    setAuthError(null);
  };

  const updatePreferences = async (newPrefs: Partial<UserPreferences>) => {
    if (!user) return;
    try {
      const docRef = doc(db, 'users', user.uid);
      const updated = { ...preferences, ...newPrefs } as UserPreferences;
      await setDoc(docRef, updated, { merge: true });
      setPreferences(updated);
    } catch (error) {
      console.error("Error updating preferences:", error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, komuUser, loading, isLoggingIn, authError, preferences, login, komuLogin, logout, clearAuthError, updatePreferences }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
