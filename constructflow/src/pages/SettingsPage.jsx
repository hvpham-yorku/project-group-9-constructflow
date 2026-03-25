/**
 * SettingsPage.jsx
 *
 * Account settings: view profile info, update display name, change password,
 * and delete account. Delete account re-authenticates with the user's current
 * password, then removes the Firestore user doc and the Firebase Auth account.
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  deleteUser,
  reauthenticateWithCredential,
  EmailAuthProvider,
  updatePassword,
} from "firebase/auth";
import { doc, deleteDoc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import Header from "../components/Header";
import Sidebar from "../components/Sidebar";
import {
  MdPerson,
  MdEmail,
  MdBadge,
  MdEdit,
  MdCheck,
  MdClose,
  MdLock,
  MdDeleteForever,
  MdWarning,
  MdWorkspaces,
} from "react-icons/md";
import "../styles/SettingsPage.css";

const ROLE_LABELS = {
  manager: "Manager",
  electrician: "Electrician",
  plumber: "Plumber",
  general: "No role assigned",
};

const WORKER_ROLES = [
  { value: "electrician", label: "Electrician" },
  { value: "plumber", label: "Plumber" },
];

export default function SettingsPage() {
  const { currentUser, userProfile, logout, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const organizationId = userProfile?.organizationId || null;
  const canEditOrganization =
    userProfile?.role === "manager" && Boolean(organizationId);

  // ── Display name editing ────────────────────────────────────────────────
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(userProfile?.name || "");
  const [nameSaving, setNameSaving] = useState(false);
  const [nameError, setNameError] = useState("");
  const [nameSuccess, setNameSuccess] = useState(false);

  const saveName = async () => {
    if (!nameValue.trim()) return setNameError("Name cannot be empty.");
    setNameSaving(true);
    setNameError("");
    try {
      await updateDoc(doc(db, "users", currentUser.uid), {
        name: nameValue.trim(),
      });
      setEditingName(false);
      setNameSuccess(true);
      setTimeout(() => setNameSuccess(false), 3000);
    } catch {
      setNameError("Failed to update name.");
    }
    setNameSaving(false);
  };

  // ── Change password ───────────────────────────────────────────────────
  const [showChangePw, setShowChangePw] = useState(false);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState(false);

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPwError("");
    if (newPw.length < 6)
      return setPwError("New password must be at least 6 characters.");
    if (newPw !== confirmPw) return setPwError("Passwords do not match.");
    setPwSaving(true);
    try {
      const credential = EmailAuthProvider.credential(
        currentUser.email,
        currentPw,
      );
      await reauthenticateWithCredential(currentUser, credential);
      await updatePassword(currentUser, newPw);
      setPwSuccess(true);
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
      setShowChangePw(false);
    } catch (err) {
      if (
        err.code === "auth/wrong-password" ||
        err.code === "auth/invalid-credential"
      ) {
        setPwError("Current password is incorrect.");
      } else {
        setPwError(err.message || "Failed to change password.");
      }
    }
    setPwSaving(false);
  };

  // ── Delete account ────────────────────────────────────────────────────
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const handleDeleteAccount = async (e) => {
    e.preventDefault();
    setDeleteError("");
    setDeleting(true);
    try {
      const credential = EmailAuthProvider.credential(
        currentUser.email,
        deletePassword,
      );
      await reauthenticateWithCredential(currentUser, credential);

      // Delete Firestore user document first, then Auth account
      await deleteDoc(doc(db, "users", currentUser.uid));
      await deleteUser(currentUser);

      await logout();
      navigate("/");
    } catch (err) {
      if (
        err.code === "auth/wrong-password" ||
        err.code === "auth/invalid-credential"
      ) {
        setDeleteError("Incorrect password. Please try again.");
      } else {
        setDeleteError(err.message || "Failed to delete account.");
      }
    }
    setDeleting(false);
  };

  // ── Role change (workers only) ──────────────────────────────────────────
  const isWorkerRole = ["electrician", "plumber"].includes(
    userProfile?.role,
  );
  const [editingRole, setEditingRole] = useState(false);
  const [roleValue, setRoleValue] = useState(userProfile?.role || "");
  const [roleSaving, setRoleSaving] = useState(false);
  const [roleError, setRoleError] = useState("");
  const [roleSuccess, setRoleSuccess] = useState(false);

  const saveRole = async () => {
    if (!roleValue) return;
    setRoleSaving(true);
    setRoleError("");
    try {
      await updateDoc(doc(db, "users", currentUser.uid), { role: roleValue });
      await refreshProfile();
      setEditingRole(false);
      setRoleSuccess(true);
      setTimeout(() => setRoleSuccess(false), 3000);
    } catch {
      setRoleError("Failed to update role.");
    }
    setRoleSaving(false);
  };

  // ── Organization name (manager only) ───────────────────────────────────
  const [organizationName, setOrganizationName] = useState("");
  const [organizationLoading, setOrganizationLoading] = useState(false);
  const [editingOrganizationName, setEditingOrganizationName] = useState(false);
  const [organizationNameValue, setOrganizationNameValue] = useState("");
  const [organizationSaving, setOrganizationSaving] = useState(false);
  const [organizationError, setOrganizationError] = useState("");
  const [organizationSuccess, setOrganizationSuccess] = useState(false);

  useEffect(() => {
    let mounted = true;
    const loadOrganization = async () => {
      if (!organizationId) {
        if (mounted) {
          setOrganizationName("");
          setOrganizationNameValue("");
        }
        return;
      }
      setOrganizationLoading(true);
      try {
        const snap = await getDoc(doc(db, "organizations", organizationId));
        if (!mounted) return;
        const fetchedName = snap.exists() ? snap.data()?.name || "" : "";
        setOrganizationName(fetchedName);
        setOrganizationNameValue(fetchedName);
      } catch {
        if (!mounted) return;
        setOrganizationName("");
        setOrganizationNameValue("");
      }
      if (mounted) setOrganizationLoading(false);
    };

    loadOrganization();
    return () => {
      mounted = false;
    };
  }, [organizationId]);

  const saveOrganizationName = async () => {
    if (!canEditOrganization || !organizationId) return;
    if (!organizationNameValue.trim()) {
      setOrganizationError("Organisation name cannot be empty.");
      return;
    }
    setOrganizationSaving(true);
    setOrganizationError("");
    try {
      const nextName = organizationNameValue.trim();
      await updateDoc(doc(db, "organizations", organizationId), {
        name: nextName,
      });
      setOrganizationName(nextName);
      setEditingOrganizationName(false);
      setOrganizationSuccess(true);
      setTimeout(() => setOrganizationSuccess(false), 3000);
    } catch {
      setOrganizationError("Failed to update organisation name.");
    }
    setOrganizationSaving(false);
  };

  const email = currentUser?.email || "—";
  const displayName = nameSuccess ? nameValue.trim() : userProfile?.name || "—";
  const role = ROLE_LABELS[userProfile?.role] || "—";
  const shownOrganizationName = organizationId
    ? organizationSuccess
      ? organizationNameValue.trim()
      : organizationName || (organizationLoading ? "Loading…" : "—")
    : "No organisation";

  return (
    <div className="dashboard">
      <Sidebar />
      <div className="dashboard-content">
        <Header title="Settings" />

        <div className="settings-page">
          {/* ── Profile ── */}
          <div className="settings-section">
            <h2 className="settings-section-title">Profile</h2>
            <div className="settings-card">
              {/* Name */}
              <div className="setting-row">
                <div className="setting-row-icon">
                  <MdPerson />
                </div>
                <div className="setting-row-body">
                  <span className="setting-row-label">Display Name</span>
                  {editingName ? (
                    <div className="setting-edit-inline">
                      <input
                        className="setting-input"
                        value={nameValue}
                        onChange={(e) => setNameValue(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && saveName()}
                        autoFocus
                      />
                      {nameError && (
                        <span className="setting-error">{nameError}</span>
                      )}
                    </div>
                  ) : (
                    <span className="setting-row-value">
                      {displayName}
                      {nameSuccess && (
                        <span className="setting-success-inline"> ✓ Saved</span>
                      )}
                    </span>
                  )}
                </div>
                <div className="setting-row-action">
                  {editingName ? (
                    <>
                      <button
                        className="icon-btn confirm"
                        onClick={saveName}
                        disabled={nameSaving}
                        title="Save"
                      >
                        <MdCheck />
                      </button>
                      <button
                        className="icon-btn cancel"
                        onClick={() => {
                          setEditingName(false);
                          setNameValue(userProfile?.name || "");
                          setNameError("");
                        }}
                        title="Cancel"
                      >
                        <MdClose />
                      </button>
                    </>
                  ) : (
                    <button
                      className="icon-btn edit"
                      onClick={() => setEditingName(true)}
                      title="Edit name"
                    >
                      <MdEdit />
                    </button>
                  )}
                </div>
              </div>

              {/* Email */}
              <div className="setting-row">
                <div className="setting-row-icon">
                  <MdEmail />
                </div>
                <div className="setting-row-body">
                  <span className="setting-row-label">Email</span>
                  <span className="setting-row-value">{email}</span>
                </div>
              </div>

              {/* Role */}
              <div className="setting-row">
                <div className="setting-row-icon">
                  <MdBadge />
                </div>
                <div className="setting-row-body">
                  <span className="setting-row-label">Role</span>
                  {editingRole ? (
                    <div className="setting-edit-inline">
                      <select
                        className="setting-input"
                        value={roleValue}
                        onChange={(e) => setRoleValue(e.target.value)}
                        autoFocus
                      >
                        {WORKER_ROLES.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                      {roleError && (
                        <span className="setting-error">{roleError}</span>
                      )}
                    </div>
                  ) : (
                    <span className="setting-row-value">
                      {ROLE_LABELS[userProfile?.role] || role}
                      {roleSuccess && (
                        <span className="setting-success-inline"> ✓ Saved</span>
                      )}
                    </span>
                  )}
                </div>
                {isWorkerRole && (
                  <div className="setting-row-action">
                    {editingRole ? (
                      <>
                        <button
                          className="icon-btn confirm"
                          onClick={saveRole}
                          disabled={roleSaving}
                          title="Save role"
                        >
                          <MdCheck />
                        </button>
                        <button
                          className="icon-btn cancel"
                          onClick={() => {
                            setEditingRole(false);
                            setRoleValue(userProfile?.role || "");
                            setRoleError("");
                          }}
                          title="Cancel"
                        >
                          <MdClose />
                        </button>
                      </>
                    ) : (
                      <button
                        className="icon-btn edit"
                        onClick={() => setEditingRole(true)}
                        title="Change role"
                      >
                        <MdEdit />
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Organisation */}
              <div className="setting-row">
                <div className="setting-row-icon">
                  <MdWorkspaces />
                </div>
                <div className="setting-row-body">
                  <span className="setting-row-label">Organisation</span>
                  {editingOrganizationName ? (
                    <div className="setting-edit-inline">
                      <input
                        className="setting-input"
                        value={organizationNameValue}
                        onChange={(e) => setOrganizationNameValue(e.target.value)}
                        onKeyDown={(e) =>
                          e.key === "Enter" && saveOrganizationName()
                        }
                        autoFocus
                      />
                      {organizationError && (
                        <span className="setting-error">{organizationError}</span>
                      )}
                    </div>
                  ) : (
                    <span className="setting-row-value">
                      {shownOrganizationName}
                      {organizationSuccess && (
                        <span className="setting-success-inline"> ✓ Saved</span>
                      )}
                    </span>
                  )}
                </div>
                {canEditOrganization && (
                  <div className="setting-row-action">
                    {editingOrganizationName ? (
                      <>
                        <button
                          className="icon-btn confirm"
                          onClick={saveOrganizationName}
                          disabled={organizationSaving}
                          title="Save organisation"
                        >
                          <MdCheck />
                        </button>
                        <button
                          className="icon-btn cancel"
                          onClick={() => {
                            setEditingOrganizationName(false);
                            setOrganizationNameValue(organizationName || "");
                            setOrganizationError("");
                          }}
                          title="Cancel"
                        >
                          <MdClose />
                        </button>
                      </>
                    ) : (
                      <button
                        className="icon-btn edit"
                        onClick={() => {
                          setEditingOrganizationName(true);
                          setOrganizationError("");
                        }}
                        title="Edit organisation"
                        disabled={organizationLoading}
                      >
                        <MdEdit />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Security ── */}
          <div className="settings-section">
            <h2 className="settings-section-title">Security</h2>
            <div className="settings-card">
              <div className="setting-row">
                <div className="setting-row-icon">
                  <MdLock />
                </div>
                <div className="setting-row-body">
                  <span className="setting-row-label">Password</span>
                  {pwSuccess && (
                    <span className="setting-success-inline">
                      {" "}
                      ✓ Password updated
                    </span>
                  )}
                  {!showChangePw && (
                    <span className="setting-row-value">••••••••</span>
                  )}
                </div>
                <div className="setting-row-action">
                  {!showChangePw && (
                    <button
                      className="btn-outline-sm"
                      onClick={() => {
                        setShowChangePw(true);
                        setPwSuccess(false);
                      }}
                    >
                      Change
                    </button>
                  )}
                </div>
              </div>

              {showChangePw && (
                <form className="setting-form" onSubmit={handleChangePassword}>
                  {pwError && (
                    <div className="setting-error-box">{pwError}</div>
                  )}
                  <div className="setting-form-row">
                    <label>Current password</label>
                    <input
                      type="password"
                      className="setting-input"
                      value={currentPw}
                      onChange={(e) => setCurrentPw(e.target.value)}
                      required
                    />
                  </div>
                  <div className="setting-form-row">
                    <label>New password</label>
                    <input
                      type="password"
                      className="setting-input"
                      value={newPw}
                      onChange={(e) => setNewPw(e.target.value)}
                      required
                      minLength={6}
                    />
                  </div>
                  <div className="setting-form-row">
                    <label>Confirm new password</label>
                    <input
                      type="password"
                      className="setting-input"
                      value={confirmPw}
                      onChange={(e) => setConfirmPw(e.target.value)}
                      required
                    />
                  </div>
                  <div className="setting-form-actions">
                    <button
                      type="submit"
                      className="btn-primary-sm"
                      disabled={pwSaving}
                    >
                      {pwSaving ? "Saving…" : "Update Password"}
                    </button>
                    <button
                      type="button"
                      className="btn-ghost-sm"
                      onClick={() => {
                        setShowChangePw(false);
                        setCurrentPw("");
                        setNewPw("");
                        setConfirmPw("");
                        setPwError("");
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>

          {/* ── Danger Zone ── */}
          <div className="settings-section">
            <h2 className="settings-section-title danger-title">Danger Zone</h2>
            <div className="settings-card danger-card">
              <div className="setting-row">
                <div className="setting-row-icon danger-icon">
                  <MdDeleteForever />
                </div>
                <div className="setting-row-body">
                  <span className="setting-row-label">Delete Account</span>
                  <span className="setting-row-value muted">
                    Permanently removes your account from Firebase Auth and all
                    Firestore data.
                  </span>
                </div>
                <div className="setting-row-action">
                  <button
                    className="btn-danger-sm"
                    onClick={() => setShowDeleteModal(true)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Delete account confirmation modal ── */}
      {showDeleteModal && (
        <div
          className="modal-overlay"
          onClick={() => {
            setShowDeleteModal(false);
            setDeletePassword("");
            setDeleteError("");
          }}
        >
          <div
            className="modal-content settings-delete-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close"
              onClick={() => {
                setShowDeleteModal(false);
                setDeletePassword("");
                setDeleteError("");
              }}
            >
              <MdClose />
            </button>
            <div className="delete-modal-header">
              <span className="delete-modal-icon">
                <MdWarning />
              </span>
              <h2>Delete Account</h2>
              <p>
                This will permanently delete your account from Firebase Auth and
                all your data from Firestore. This{" "}
                <strong>cannot be undone</strong>.
              </p>
            </div>
            {deleteError && (
              <div className="setting-error-box">{deleteError}</div>
            )}
            <form onSubmit={handleDeleteAccount} className="auth-form">
              <div className="form-group">
                <label>Enter your password to confirm</label>
                <input
                  type="password"
                  placeholder=""
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <button
                type="submit"
                className="btn-danger-full"
                disabled={deleting}
              >
                {deleting ? "Deleting…" : "Yes, permanently delete my account"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
