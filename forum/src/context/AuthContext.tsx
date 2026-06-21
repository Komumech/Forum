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
  preferences: UserPreferences | null;
  login: () => Promise<void>;
  komuLogin: () => Promise<void>;
  logout: () => Promise<void>;
  updatePreferences: (prefs: Partial<UserPreferences>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [komuUser, setKomuUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);

  useEffect(() => {
    // Listen for main app auth changes
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      
      if (u) {
        try {
          // Sync user profile for contact lookups
          await setDoc(doc(db, 'userProfiles', u.uid), {
            displayName: u.displayName,
            email: u.email,
            photoURL: u.photoURL,
            lastSeen: new Date().toISOString()
          }, { merge: true });

          // Fetch preferences from Firestore
          const docRef = doc(db, 'users', u.uid);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            setPreferences(docSnap.data() as UserPreferences);
          } else {
            // Create default preferences
            const defaultPrefs: UserPreferences = {
              displayName: u.displayName || 'Guest',
              theme: 'light',
            };
            await setDoc(docRef, defaultPrefs);
            setPreferences(defaultPrefs);
          }
        } catch (error) {
          console.error("Error fetching preferences:", error);
        }
      } else {
        setPreferences(null);
      }
      setLoading(false);
    });

    // Listen for komu auth changes
    const unsubscribeKomu = onAuthStateChanged(komuAuth, (u) => {
      setKomuUser(u);
    });

    return () => {
      unsubscribe();
      unsubscribeKomu();
    };
  }, []);

  const login = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      
      if (credential) {
        try {
          // Sign in to secondary app as well using the same credential
          await signInWithCredential(komuAuth, credential);
          console.log("Successfully signed in to both apps");
        } catch (komuError) {
          console.warn("Could not sync with secondary app, continuing with main login:", komuError);
        }
      }
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  const komuLogin = async () => {
    try {
      // If we don't have a main user, login to both
      if (!user) {
        await login();
      } else if (!komuUser) {
        // If we have main but no komu, try to sign in to komu specifically
        await signInWithPopup(komuAuth, googleProvider);
        console.log("Successfully synced with Komu Notes");
      }
    } catch (error) {
      console.error("Komu login failed:", error);
    }
  };

  const logout = async () => {
    try {
      await Promise.all([
        signOut(auth),
        signOut(komuAuth)
      ]);
    } catch (error) {
      console.error("Logout failed:", error);
    }
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
    <AuthContext.Provider value={{ user, komuUser, loading, preferences, login, komuLogin, logout, updatePreferences }}>
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
