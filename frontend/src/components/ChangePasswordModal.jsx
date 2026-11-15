import React, { useState, useRef, useEffect } from "react";
import { FiKey, FiLock, FiEye, FiEyeOff, FiX, FiCheckCircle, FiAlertCircle } from "react-icons/fi";
import api from "../api/axios";
import Swal from "sweetalert2";

export default function ChangePasswordModal({ isOpen, onClose }) {
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");

  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const oldInputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setOldPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      setError("");
      setShowOld(false);
      setShowNew(false);
      setShowConfirm(false);
      setTimeout(() => {
        oldInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!oldPassword.trim()) {
      setError("Please enter your current password.");
      return;
    }

    if (!newPassword.trim()) {
      setError("Please enter a new password.");
      return;
    }

    if (newPassword.length < 6) {
      setError("New password must be at least 6 characters long.");
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setError("New password and confirm new password do not match.");
      return;
    }

    if (oldPassword === newPassword) {
      setError("New password must be different from current password.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await api.post("/auth/change-password", {
        oldPassword,
        newPassword,
        confirmNewPassword,
      });

      if (res.data?.success) {
        Swal.fire({
          icon: "success",
          title: "Password Updated",
          text: "Your password has been changed successfully. Future logins will use your new password.",
          timer: 3000,
          showConfirmButton: true,
          confirmButtonColor: "#09090b",
        });
        onClose();
      } else {
        setError(res.data?.message || "Failed to change password.");
      }
    } catch (err) {
      const errMsg =
        err.response?.data?.message ||
        err.message ||
        "An error occurred while changing password.";
      setError(errMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Escape" && !isSubmitting) {
      onClose();
    }
  };

  return (
    <div
      className="modal fade show d-block"
      tabIndex="-1"
      role="dialog"
      aria-modal="true"
      style={{ backgroundColor: "rgba(15, 23, 42, 0.55)", backdropFilter: "blur(4px)", zIndex: 1060 }}
      onKeyDown={handleKeyDown}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) {
          onClose();
        }
      }}
    >
      <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: "460px" }}>
        <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden">
          {/* Header */}
          <div className="modal-header bg-dark text-white border-0 px-4 py-3 align-items-center">
            <div className="d-flex align-items-center gap-2">
              <div
                className="rounded-3 bg-white bg-opacity-15 p-2 d-flex align-items-center justify-content-center text-white"
                style={{ width: "36px", height: "36px" }}
              >
                <FiKey size={18} />
              </div>
              <div>
                <h6 className="modal-title fw-bold mb-0 text-white" style={{ fontSize: "1rem" }}>
                  Change Account Password
                </h6>
                <div className="small text-white-50" style={{ fontSize: "0.75rem" }}>
                  Persistent security & credential update
                </div>
              </div>
            </div>
            <button
              type="button"
              className="btn-close btn-close-white p-2"
              onClick={onClose}
              disabled={isSubmitting}
              aria-label="Close"
            />
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit}>
            <div className="modal-body px-4 py-3">
              {/* Error Alert */}
              {error && (
                <div
                  className="alert alert-danger py-2 px-3 small d-flex align-items-center gap-2 mb-3 rounded-3"
                  role="alert"
                  style={{ fontSize: "0.82rem" }}
                >
                  <FiAlertCircle size={16} className="text-danger flex-shrink-0" />
                  <span className="fw-medium">{error}</span>
                </div>
              )}

              {/* 1. Old Password */}
              <div className="mb-3">
                <label className="form-label small fw-semibold text-dark mb-1" style={{ fontSize: "0.8rem" }}>
                  Current Password <span className="text-danger">*</span>
                </label>
                <div className="input-group">
                  <input
                    ref={oldInputRef}
                    type={showOld ? "text" : "password"}
                    className="form-control"
                    placeholder="Enter current password"
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                    disabled={isSubmitting}
                    autoComplete="current-password"
                    required
                    style={{ fontSize: "0.85rem" }}
                  />
                  <button
                    type="button"
                    className="btn btn-outline-secondary d-flex align-items-center justify-content-center px-3"
                    onClick={() => setShowOld(!showOld)}
                    tabIndex="-1"
                    title={showOld ? "Hide password" : "Show password"}
                  >
                    {showOld ? <FiEyeOff size={15} /> : <FiEye size={15} />}
                  </button>
                </div>
                <div className="text-muted small mt-1" style={{ fontSize: "0.72rem" }}>
                  If never updated before, this matches your initial setup password.
                </div>
              </div>

              {/* 2. New Password */}
              <div className="mb-3">
                <label className="form-label small fw-semibold text-dark mb-1" style={{ fontSize: "0.8rem" }}>
                  New Password <span className="text-danger">*</span>
                </label>
                <div className="input-group">
                  <input
                    type={showNew ? "text" : "password"}
                    className="form-control"
                    placeholder="Minimum 6 characters"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    disabled={isSubmitting}
                    autoComplete="new-password"
                    required
                    minLength={6}
                    style={{ fontSize: "0.85rem" }}
                  />
                  <button
                    type="button"
                    className="btn btn-outline-secondary d-flex align-items-center justify-content-center px-3"
                    onClick={() => setShowNew(!showNew)}
                    tabIndex="-1"
                    title={showNew ? "Hide password" : "Show password"}
                  >
                    {showNew ? <FiEyeOff size={15} /> : <FiEye size={15} />}
                  </button>
                </div>
              </div>

              {/* 3. Confirm New Password */}
              <div className="mb-2">
                <label className="form-label small fw-semibold text-dark mb-1" style={{ fontSize: "0.8rem" }}>
                  Confirm New Password <span className="text-danger">*</span>
                </label>
                <div className="input-group">
                  <input
                    type={showConfirm ? "text" : "password"}
                    className={`form-control ${
                      confirmNewPassword && newPassword !== confirmNewPassword
                        ? "is-invalid"
                        : ""
                    }`}
                    placeholder="Re-enter new password"
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    disabled={isSubmitting}
                    autoComplete="new-password"
                    required
                    style={{ fontSize: "0.85rem" }}
                  />
                  <button
                    type="button"
                    className="btn btn-outline-secondary d-flex align-items-center justify-content-center px-3"
                    onClick={() => setShowConfirm(!showConfirm)}
                    tabIndex="-1"
                    title={showConfirm ? "Hide password" : "Show password"}
                  >
                    {showConfirm ? <FiEyeOff size={15} /> : <FiEye size={15} />}
                  </button>
                </div>
                {confirmNewPassword && newPassword !== confirmNewPassword && (
                  <div className="text-danger small mt-1" style={{ fontSize: "0.72rem" }}>
                    Passwords do not match.
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="modal-footer bg-light border-top px-4 py-2 d-flex justify-content-end gap-2">
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary px-3 py-2 rounded-2"
                onClick={onClose}
                disabled={isSubmitting}
                style={{ fontSize: "0.82rem" }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-sm btn-dark px-4 py-2 rounded-2 d-inline-flex align-items-center gap-2 shadow-sm"
                disabled={isSubmitting || !oldPassword || !newPassword || !confirmNewPassword}
                style={{ fontSize: "0.82rem" }}
              >
                {isSubmitting ? (
                  <>
                    <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
                    <span>Updating...</span>
                  </>
                ) : (
                  <>
                    <FiCheckCircle size={14} />
                    <span>Save Password</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
