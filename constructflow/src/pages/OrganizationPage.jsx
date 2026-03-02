/**
 * OrganizationPage.jsx
 *
 * Shown to authenticated users who don't belong to any organisation yet.
 * Two panels:
 *   1. Create a new organisation  → user becomes "manager"
 *   2. Join via invite code       → multi-step (code → pick worker type)
 */

import { useState } from "react";
import {
  MdElectricBolt,
  MdPlumbing,
  MdEngineering,
  MdConstruction,
  MdArrowBack,
  MdArrowForward,
} from "react-icons/md";
import { useAuth } from "../contexts/AuthContext";
import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  doc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import "../styles/OrganizationPage.css";

// ─── helpers ────────────────────────────────────────────────────────────────
function generateCode(len = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < len; i++)
    code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

const WORKER_TYPES = [
  {
    value: "electrician",
    label: "Electrician",
    Icon: MdElectricBolt,
    desc: "Wiring, conduit & electrical systems",
  },
  {
    value: "plumber",
    label: "Plumber",
    Icon: MdPlumbing,
    desc: "Pipes, fixtures & water systems",
  },
];

// ─── Main component ──────────────────────────────────────────────────────────
export default function OrganizationPage() {
  const { currentUser, userProfile, updateUserProfile } = useAuth();

  const [tab, setTab] = useState("create"); // "create" | "join"

  // Create-org state
  const [orgName, setOrgName] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState("");

  // Join-org state — step 1: enter code
  const [code, setCode] = useState("");
  const [codeLoading, setCodeLoading] = useState(false);
  const [codeError, setCodeError] = useState("");
  // step 2: pick worker type
  const [pendingOrg, setPendingOrg] = useState(null); // { id, name }
  const [workerType, setWorkerType] = useState("");
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinError, setJoinError] = useState("");

  // ── Create organisation ──────────────────────────────────────────────────
  const handleCreate = async (e) => {
    e.preventDefault();
    if (!orgName.trim())
      return setCreateError("Please enter an organisation name.");
    setCreateError("");
    setCreateLoading(true);
    try {
      const inviteCode = generateCode();
      const orgRef = await addDoc(collection(db, "organizations"), {
        name: orgName.trim(),
        managerId: currentUser.uid,
        managerName: userProfile?.name || "",
        inviteCode,
        createdAt: serverTimestamp(),
        members: {
          [currentUser.uid]: {
            name: userProfile?.name || "",
            role: "manager",
            joinedAt: new Date().toISOString(),
          },
        },
      });
      // Promote the user to manager in their Firestore profile
      await updateUserProfile({ role: "manager", organizationId: orgRef.id });
    } catch (err) {
      setCreateError(err.message || "Failed to create organisation.");
      setCreateLoading(false);
    }
  };

  // ── Step 1: validate invite code ────────────────────────────────────────
  const handleCodeSubmit = async (e) => {
    e.preventDefault();
    if (!code.trim()) return setCodeError("Please enter an invite code.");
    setCodeError("");
    setCodeLoading(true);
    try {
      const q = query(
        collection(db, "organizations"),
        where("inviteCode", "==", code.trim().toUpperCase()),
      );
      const snap = await getDocs(q);
      if (snap.empty) {
        setCodeError("Invalid invite code. Check with your manager.");
      } else {
        const orgDoc = snap.docs[0];
        setPendingOrg({ id: orgDoc.id, name: orgDoc.data().name });
      }
    } catch (err) {
      setCodeError(err.message || "Something went wrong.");
    }
    setCodeLoading(false);
  };

  // ── Step 2: pick worker type and join ────────────────────────────────────
  const handleJoin = async (e) => {
    e.preventDefault();
    if (!workerType) return setJoinError("Please choose your trade.");
    setJoinError("");
    setJoinLoading(true);
    try {
      const orgRef = doc(db, "organizations", pendingOrg.id);
      // Add member entry inside the organization document
      await updateDoc(orgRef, {
        [`members.${currentUser.uid}`]: {
          name: userProfile?.name || "",
          role: workerType,
          joinedAt: new Date().toISOString(),
        },
      });
      // Update user profile
      await updateUserProfile({
        role: workerType,
        organizationId: pendingOrg.id,
      });
    } catch (err) {
      setJoinError(err.message || "Failed to join organisation.");
      setJoinLoading(false);
    }
  };

  // ── Render: step 2 (worker type selection) ───────────────────────────────
  if (pendingOrg) {
    return (
      <div className="org-page">
        <div className="org-card wide">
          <div className="org-card-icon">
            <MdEngineering />
          </div>
          <h1>
            Welcome to{" "}
            <span className="org-name-highlight">{pendingOrg.name}</span>
          </h1>
          <p className="org-card-sub">Choose your trade to continue</p>

          {joinError && <div className="org-error">{joinError}</div>}

          <form onSubmit={handleJoin}>
            <div className="worker-type-grid">
              {WORKER_TYPES.map((wt) => (
                <button
                  key={wt.value}
                  type="button"
                  className={`worker-type-card${workerType === wt.value ? " selected" : ""}`}
                  onClick={() => setWorkerType(wt.value)}
                >
                  <wt.Icon className="wt-icon" />
                  <span className="wt-label">{wt.label}</span>
                  <span className="wt-desc">{wt.desc}</span>
                </button>
              ))}
            </div>
            <button
              type="submit"
              className="btn-org-primary"
              disabled={!workerType || joinLoading}
            >
              {joinLoading ? "Joining…" : "Join Organisation"}
            </button>
            <button
              type="button"
              className="btn-org-ghost"
              onClick={() => setPendingOrg(null)}
              disabled={joinLoading}
            >
              <MdArrowBack /> Back
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ── Render: main two-tab view ────────────────────────────────────────────
  return (
    <div className="org-page">
      <div className="org-card">
        <div className="org-card-icon">
          <MdConstruction />
        </div>
        <h1>Get Started</h1>
        <p className="org-card-sub">
          Hi <strong>{userProfile?.name}</strong>! Create a new organisation or
          join one with an invite code.
        </p>

        <div className="org-tabs">
          <button
            className={`org-tab${tab === "create" ? " active" : ""}`}
            onClick={() => setTab("create")}
          >
            Create Organisation
          </button>
          <button
            className={`org-tab${tab === "join" ? " active" : ""}`}
            onClick={() => setTab("join")}
          >
            Join Organisation
          </button>
        </div>

        {/* ── Create ── */}
        {tab === "create" && (
          <form onSubmit={handleCreate} className="org-form">
            {createError && <div className="org-error">{createError}</div>}
            <div className="org-form-group">
              <label>Organisation Name</label>
              <input
                type="text"
                placeholder=""
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                required
                autoFocus
              />
            </div>
            <p className="org-hint">
              You will be the <strong>Manager</strong>. An invite code will be
              generated so workers can join.
            </p>
            <button
              type="submit"
              className="btn-org-primary"
              disabled={createLoading}
            >
              {createLoading ? "Creating…" : "Create Organisation"}
            </button>
          </form>
        )}

        {/* ── Join ── */}
        {tab === "join" && (
          <form onSubmit={handleCodeSubmit} className="org-form">
            {codeError && <div className="org-error">{codeError}</div>}
            <div className="org-form-group">
              <label>Invite Code</label>
              <input
                type="text"
                placeholder=""
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                required
                maxLength={8}
                className="code-input"
                autoFocus
              />
            </div>
            <p className="org-hint">
              Ask your manager for the 6-character invite code.
            </p>
            <button
              type="submit"
              className="btn-org-primary"
              disabled={codeLoading}
            >
              {codeLoading ? (
                "Checking…"
              ) : (
                <>
                  Next <MdArrowForward />
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
