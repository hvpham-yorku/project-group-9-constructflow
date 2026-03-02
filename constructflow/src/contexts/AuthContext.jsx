// Authentication context provider - manages user login, signup, and session state
// All auth logic is centralized here and exposed through the useAuth hook
import { createContext, useContext, useState, useEffect } from "react";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import { doc, setDoc, getDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "../firebase";

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // Sign up — all new users start as "general" (no role, no org)
  async function signup(email, password, name) {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    const profile = {
      uid: result.user.uid,
      email,
      name,
      role: "general", // no org yet
      organizationId: null,
      createdAt: new Date().toISOString(),
    };
    await setDoc(doc(db, "users", result.user.uid), profile);
    return result;
  }

  async function login(email, password) {
    return signInWithEmailAndPassword(auth, email, password);
  }

  async function logout() {
    return signOut(auth);
  }

  // Refresh the local userProfile from Firestore (call after org/role changes)
  async function refreshProfile() {
    if (!currentUser) return;
    try {
      const snap = await getDoc(doc(db, "users", currentUser.uid));
      setUserProfile(snap.exists() ? snap.data() : null);
    } catch {
      // ignore
    }
  }

  // Update any fields on the current user's Firestore doc and refresh local state
  async function updateUserProfile(fields) {
    if (!currentUser) return;
    await updateDoc(doc(db, "users", currentUser.uid), fields);
    setUserProfile((prev) => ({ ...prev, ...fields }));
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        try {
          const snap = await getDoc(doc(db, "users", user.uid));
          setUserProfile(snap.exists() ? snap.data() : null);
        } catch {
          setUserProfile(null);
        }
      } else {
        setUserProfile(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // Derived role helpers
  const isManager = userProfile?.role === "manager";
  const isWorker = ["electrician", "plumber"].includes(
    userProfile?.role,
  );
  const hasOrg = Boolean(userProfile?.organizationId);
  const organizationId = userProfile?.organizationId || null;

  const value = {
    currentUser,
    userProfile,
    isManager,
    isWorker,
    hasOrg,
    organizationId,
    signup,
    login,
    logout,
    refreshProfile,
    updateUserProfile,
    loading,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
