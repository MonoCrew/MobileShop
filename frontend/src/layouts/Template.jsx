import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { FiMenu, FiLogOut, FiKey, FiLock, FiEyeOff } from "react-icons/fi";
import { useAuth } from "../context/AuthContext";
import { usePrivacy } from "../context/PrivacyContext";
import Swal from "sweetalert2";
import Sidebar from "../components/Sidebar";
import UnlockMetricsModal from "../components/UnlockMetricsModal";
import ChangePasswordModal from "../components/ChangePasswordModal";
import "../styles/Template.css";

const PAGE_TITLES = {
  "/": "Dashboard",
  "/dashboard": "Dashboard",
  "/sales": "Regular Sale",
  "/history": "History",
  "/sales/history": "History",
  "/stock-purchase-history": "History",
  "/stock/history": "History",
  "/returns": "Stock Returns & Customer Refunds",
  "/expenses": "Daily Expenses & Costs",
  "/add-stock": "Add Stock / Local Sale Purchase",
  "/view-stock": "Stock Inventory",
  "/suppliers": "Suppliers / Customer Details",
  "/supplier-ledger": "Suppliers / Customer Details",
  "/shopkeeper-stock": "Shopkeeper Stock & Sale",
};

const Template = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [changePassOpen, setChangePassOpen] = useState(false);
  const location = useLocation();
  const { user, logout } = useAuth();
  const { isRevealed, lockMetrics, openUnlockModal } = usePrivacy();

  const handleLogout = async () => {
    const result = await Swal.fire({
      title: "Sign Out",
      text: "Are you sure you want to log out of your session?",
      icon: "question",
      showCancelButton: true,
      confirmButtonColor: "#09090b",
      cancelButtonColor: "#6c757d",
      confirmButtonText: "Sign Out",
      cancelButtonText: "Cancel",
    });
    if (result.isConfirmed) {
      await logout();
    }
  };

  const currentTitle = PAGE_TITLES[location.pathname] || "Dashboard";

  // Normalize path for page transitions so route aliases don't re-trigger unnecessarily
  const pageTransitionKey =
    location.pathname === "/" || location.pathname === "/dashboard"
      ? "/dashboard"
      : location.pathname === "/supplier-ledger" || location.pathname === "/suppliers"
      ? "/suppliers"
      : location.pathname;

  return (
    <div className="d-flex min-vh-100 bg-white text-dark">
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          className="pos-backdrop d-md-none"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar Component */}
      <Sidebar
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
        onOpenChangePassword={() => setChangePassOpen(true)}
      />

      {/* Main Content Column */}
      <div className="flex-grow-1 d-flex flex-column min-vh-100 min-w-0">
        {/* Top Header Bar - Exactly aligns with Sidebar Header bottom border */}
        <header className="d-flex align-items-center justify-content-between px-3 px-md-4 border-bottom bg-white pos-header-height flex-shrink-0">
          <div className="d-flex align-items-center gap-2">
            {/* Mobile-only hamburger button */}
            <button
              type="button"
              className="btn btn-outline-dark btn-sm d-flex d-md-none align-items-center justify-content-center p-2 me-1"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation menu"
            >
              <FiMenu size={18} />
            </button>

            {/* Breadcrumb / Page Title */}
            <div className="d-flex align-items-center gap-2">
              <span className="text-secondary small d-none d-sm-inline">Sheikh Hammad</span>
              <span className="text-secondary small d-none d-sm-inline">/</span>
              <span key={currentTitle} className="fw-semibold text-dark fs-6 pos-title-transition">
                {currentTitle}
              </span>
            </div>
          </div>

          <div className="d-flex align-items-center gap-2">
            {/* Privacy Lock / Reveal Toggle in Header */}
            {isRevealed ? (
              <button
                type="button"
                className="btn btn-sm btn-outline-success d-flex align-items-center gap-2 px-3 py-1 rounded-2"
                onClick={lockMetrics}
                title="Sensitive profit metrics are revealed. Click to re-mask / lock data."
              >
                <FiLock size={13} />
                <span className="small fw-medium d-none d-md-inline">Lock Metrics</span>
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary d-flex align-items-center gap-2 px-3 py-1 rounded-2"
                onClick={openUnlockModal}
                title="Profit and margin data masked. Click to unlock with password."
              >
                <FiEyeOff size={13} />
                <span className="small fw-medium d-none d-md-inline">Metrics Masked</span>
              </button>
            )}

            {user && (
              <span className="badge bg-light text-dark border small fw-normal px-2 py-1 d-none d-md-inline">
                {user.email}
              </span>
            )}

            {/* Change Password Button in Top-Right Header */}
            <button
              type="button"
              className="btn btn-outline-dark btn-sm d-flex align-items-center gap-2 px-3 py-1 rounded-2"
              onClick={() => setChangePassOpen(true)}
              title="Change Account Password"
            >
              <FiKey size={13} />
              <span className="small fw-medium d-none d-sm-inline">Password</span>
            </button>

            <button
              type="button"
              className="btn btn-outline-danger btn-sm d-flex align-items-center gap-2 px-3 py-1 rounded-2"
              onClick={handleLogout}
              title="Sign Out"
            >
              <FiLogOut size={14} />
              <span className="small fw-medium d-none d-sm-inline">Sign Out</span>
            </button>
          </div>
        </header>

        {/* Main Content Area - smoothly animates on route switch */}
        <main className="flex-grow-1 d-flex flex-column p-3 overflow-x-hidden">
          <div
            key={pageTransitionKey}
            className="pos-page-transition flex-grow-1 d-flex flex-column w-100 overflow-x-hidden"
          >
            <Outlet />
          </div>
        </main>
      </div>

      {/* Global Modals for Financial Privacy & Dynamic Password Management */}
      <UnlockMetricsModal />
      <ChangePasswordModal
        isOpen={changePassOpen}
        onClose={() => setChangePassOpen(false)}
      />
    </div>
  );
};

export default Template;