import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import api from "../api/axios";

const PrivacyContext = createContext(null);

export const PrivacyProvider = ({ children }) => {
  // Sensitive financial metrics are masked (false) by default
  const [isRevealed, setIsRevealed] = useState(() => {
    try {
      return sessionStorage.getItem("pos_metrics_unlocked") === "true";
    } catch {
      return false;
    }
  });

  const [isUnlockModalOpen, setIsUnlockModalOpen] = useState(false);
  const [unlockError, setUnlockError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);

  // Sync to sessionStorage for session persistence
  useEffect(() => {
    try {
      if (isRevealed) {
        sessionStorage.setItem("pos_metrics_unlocked", "true");
      } else {
        sessionStorage.removeItem("pos_metrics_unlocked");
      }
    } catch {}
  }, [isRevealed]);

  const openUnlockModal = useCallback(() => {
    setUnlockError("");
    setIsUnlockModalOpen(true);
  }, []);

  const closeUnlockModal = useCallback(() => {
    setIsUnlockModalOpen(false);
    setUnlockError("");
  }, []);

  const verifyAndUnlock = useCallback(async (password) => {
    if (!password) {
      setUnlockError("Password is required.");
      return false;
    }

    setIsVerifying(true);
    setUnlockError("");

    try {
      const res = await api.post("/auth/verify-password", { password });
      if (res.data && res.data.verified) {
        setIsRevealed(true);
        setIsUnlockModalOpen(false);
        setUnlockError("");
        return true;
      } else {
        setUnlockError(res.data?.message || "Incorrect password.");
        return false;
      }
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        "Incorrect password. Please try again.";
      setUnlockError(msg);
      return false;
    } finally {
      setIsVerifying(false);
    }
  }, []);

  const lockMetrics = useCallback(() => {
    setIsRevealed(false);
    try {
      sessionStorage.removeItem("pos_metrics_unlocked");
    } catch {}
  }, []);

  const maskAmount = useCallback(
    (realValue, options = {}) => {
      const { prefix = "", suffix = "", fallback = "****" } = options;
      if (isRevealed) {
        return `${prefix}${realValue}${suffix}`;
      }
      return `${prefix}${fallback}${suffix}`;
    },
    [isRevealed]
  );

  return (
    <PrivacyContext.Provider
      value={{
        isRevealed,
        isUnlockModalOpen,
        unlockError,
        isVerifying,
        openUnlockModal,
        closeUnlockModal,
        verifyAndUnlock,
        lockMetrics,
        maskAmount,
      }}
    >
      {children}
    </PrivacyContext.Provider>
  );
};

export const usePrivacy = () => {
  const context = useContext(PrivacyContext);
  if (!context) {
    throw new Error("usePrivacy must be used within a PrivacyProvider");
  }
  return context;
};

export default PrivacyContext;
