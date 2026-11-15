import React, { useState, useEffect, useRef } from "react";
import { FiLock, FiEye, FiEyeOff, FiX, FiAlertCircle } from "react-icons/fi";
import { usePrivacy } from "../context/PrivacyContext";

export default function UnlockMetricsModal() {
  const {
    isUnlockModalOpen,
    closeUnlockModal,
    verifyAndUnlock,
    unlockError,
    isVerifying,
  } = usePrivacy();

  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isUnlockModalOpen) {
      setPassword("");
      setShowPassword(false);
      // Focus the input when modal opens
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isUnlockModalOpen]);

  if (!isUnlockModalOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!password.trim()) return;
    await verifyAndUnlock(password);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Escape") {
      closeUnlockModal();
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
        if (e.target === e.currentTarget && !isVerifying) {
          closeUnlockModal();
        }
      }}
    >
      <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: "420px" }}>
        <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden">
          {/* Header */}
          <div className="modal-header bg-dark text-white border-0 px-4 py-3 align-items-center">
            <div className="d-flex align-items-center gap-2">
              <div
                className="rounded-3 bg-white bg-opacity-15 p-2 d-flex align-items-center justify-content-center text-white"
                style={{ width: "36px", height: "36px" }}
              >
                <FiLock size={18} />
              </div>
              <div>
                <h6 className="modal-title fw-bold mb-0 text-white" style={{ fontSize: "1rem" }}>
                  Enter Password to View Sensitive Data
                </h6>
                <div className="small text-white-50" style={{ fontSize: "0.75rem" }}>
                  Unlock profit, margins & financial records
                </div>
              </div>
            </div>
            <button
              type="button"
              className="btn-close btn-close-white p-2"
              onClick={closeUnlockModal}
              disabled={isVerifying}
              aria-label="Close"
            />
          </div>

          {/* Form Body */}
          <form onSubmit={handleSubmit}>
            <div className="modal-body px-4 py-3">
              <p className="text-secondary small mb-3" style={{ fontSize: "0.82rem" }}>
                Financial and profit margin data is currently protected. Enter your account password to unlock metrics for this active session.
              </p>

              {/* Inline Error Alert */}
              {unlockError && (
                <div
                  className="alert alert-danger py-2 px-3 small d-flex align-items-center gap-2 mb-3 rounded-3"
                  role="alert"
                  style={{ fontSize: "0.82rem" }}
                >
                  <FiAlertCircle size={16} className="text-danger flex-shrink-0" />
                  <span className="fw-medium">{unlockError}</span>
                </div>
              )}

              <div className="mb-2">
                <label className="form-label small fw-semibold text-dark mb-1" style={{ fontSize: "0.8rem" }}>
                  Account Password
                </label>
                <div className="input-group">
                  <input
                    ref={inputRef}
                    type={showPassword ? "text" : "password"}
                    className={`form-control ${unlockError ? "is-invalid" : ""}`}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isVerifying}
                    autoComplete="current-password"
                    required
                    style={{ fontSize: "0.88rem" }}
                  />
                  <button
                    type="button"
                    className="btn btn-outline-secondary d-flex align-items-center justify-content-center px-3"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex="-1"
                    title={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <FiEyeOff size={16} /> : <FiEye size={16} />}
                  </button>
                </div>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="modal-footer bg-light border-top px-4 py-2 d-flex justify-content-end gap-2">
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary px-3 py-2 rounded-2"
                onClick={closeUnlockModal}
                disabled={isVerifying}
                style={{ fontSize: "0.82rem" }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-sm btn-dark px-4 py-2 rounded-2 d-inline-flex align-items-center gap-2 shadow-sm"
                disabled={isVerifying || !password.trim()}
                style={{ fontSize: "0.82rem" }}
              >
                {isVerifying ? (
                  <>
                    <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
                    <span>Verifying...</span>
                  </>
                ) : (
                  <>
                    <FiLock size={13} />
                    <span>Unlock</span>
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
