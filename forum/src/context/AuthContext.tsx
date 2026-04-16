import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut, signInWithCredential } from 'firebase/auth';
import { auth, komuAuth, googleProvider } from '../firebase';
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
  loading: boolean;
  preferences: UserPreferences | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  updatePreferences: (prefs: Partial<UserPreferences>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);

  useEffect(() => {
    // Listen for main app auth changes
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      
      // Also listen for komu auth changes to ensure we are synced
      // If we have a user on main auth but not on komu auth, we might need to handle that,
      // but usually the login function will handle the initial sync.
      
      if (user) {
        try {
          // Fetch preferences from Firestore
          const docRef = doc(db, 'users', user.uid);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            setPreferences(docSnap.data() as UserPreferences);
          } else {
            // Create default preferences
            const defaultPrefs: UserPreferences = {
              displayName: user.displayName || 'Guest',
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
        // Ensure komuAuth is also signed out
        if (komuAuth.currentUser) {
          signOut(komuAuth).catch(err => console.error("Komu sign out failed:", err));
        }
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const login = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      
      if (credential) {
        // Sign in to secondary app as well using the same credential
        await signInWithCredential(komuAuth, credential);
        console.log("Successfully signed in to both apps");
      }
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      await signOut(komuAuth);
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
    <AuthContext.Provider value={{ user, loading, preferences, login, logout, updatePreferences }}>
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
