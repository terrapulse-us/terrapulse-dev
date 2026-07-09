import React, { createContext, useContext, useEffect, useState } from "react";
import {
  User,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithCredential,
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  loginWithGoogleCredential: (idToken: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

function firebaseAuthMessage(err: unknown): string {
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code: string }).code;
    const raw = (err as Record<string, unknown>);
    const customMsg = (raw?.customData as Record<string, unknown> | undefined)?.message as string | undefined;
    switch (code) {
      case "auth/operation-not-allowed":
        return "This sign-in method is not enabled in Firebase Console.";
      case "auth/invalid-credential":
        return "Invalid credential. Please try again.";
      case "auth/user-disabled":
        return "This account has been disabled.";
      case "auth/account-exists-with-different-credential":
        return "An account already exists with a different sign-in method for that email.";
      case "auth/network-request-failed":
        return `Network error [${customMsg ?? "no detail"}]`;
      case "auth/too-many-requests":
        return "Too many attempts. Please wait a moment and try again.";
      case "auth/wrong-password":
        return "Incorrect password.";
      case "auth/user-not-found":
        return "No account found for that email.";
      case "auth/email-already-in-use":
        return "An account already exists with that email.";
      case "auth/weak-password":
        return "Password must be at least 6 characters.";
      default:
        return `Auth error (${code}): ${customMsg ?? String(err)}`;
    }
  }
  return err instanceof Error ? err.message : "Unknown error";
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      // Unblock the app immediately — never wait on Firestore before showing UI.
      // This is the critical offline fix: a returning user with a cached session
      // can open the app with no signal and land on the map instantly.
      setUser(u);
      setLoading(false);

      // Ensure a Firestore user document exists for every authenticated user.
      // Runs in the background so it never blocks auth state resolution.
      // New users (Google sign-in, email/password) never get one created
      // automatically — without this, onSnapshot listeners in profile.tsx
      // listen on a non-existent doc and badge grants never fire.
      if (u) {
        const userRef = doc(db, "users", u.uid);
        getDoc(userRef)
          .then((snap) => {
            if (!snap.exists()) {
              return setDoc(userRef, {
                displayName: u.displayName ?? "",
                photoURL: u.photoURL ?? "",
                email: u.email ?? "",
                createdAt: Date.now(),
                achievements: [],
                achievementDates: {},
              });
            }
          })
          .catch(() => {
            // Offline or network error — silently ignore.
            // The doc will be created on next successful connection.
          });
      }
    });
    return unsub;
  }, []);

  const login = async (email: string, password: string) => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      throw new Error(firebaseAuthMessage(err));
    }
  };

  const register = async (email: string, password: string) => {
    try {
      await createUserWithEmailAndPassword(auth, email, password);
    } catch (err) {
      throw new Error(firebaseAuthMessage(err));
    }
  };

  const logout = async () => {
    await signOut(auth);
  };

  const loginWithGoogleCredential = async (idToken: string) => {
    try {
      const credential = GoogleAuthProvider.credential(idToken);
      await signInWithCredential(auth, credential);
    } catch (err) {
      throw new Error(firebaseAuthMessage(err));
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, login, register, logout, loginWithGoogleCredential }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
