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
import { auth } from "@/lib/firebase";

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
      setUser(u);
      setLoading(false);
    });
    return unsub;
  }, []);

  const login = async (email: string, password: string) => {
    let preflight = "not-run";
    try {
      const r = await fetch(
        "https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=__diag__",
        { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }
      );
      preflight = `reachable(${r.status})`;
    } catch (e) {
      preflight = `unreachable:${e instanceof Error ? e.message : String(e)}`;
    }
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      throw new Error(`${firebaseAuthMessage(err)} | net:${preflight}`);
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
