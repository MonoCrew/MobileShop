import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  FiGrid,
  FiPlus,
  FiPackage,
  FiTruck,
  FiChevronLeft,
  FiMenu,
  FiX,
  FiShoppingCart,
  FiClock,
  FiDollarSign,
  FiRotateCcw,
  FiLogOut,
  FiKey,
  FiUsers,
  FiFileText,
  FiCornerDownLeft,
} from "react-icons/fi";
import { useAuth } from "../context/AuthContext";
import Swal from "sweetalert2";
import { Logo, LogoIcon } from "./Logo";

const NAV_ITEMS = [
  { path: "/", matchPaths: ["/", "/dashboard"], label: "Dashboard", icon: FiGrid },
  { path: "/sales", matchPaths: ["/sales"], label: "Regular Sale", icon: FiShoppingCart },
  { path: "/returns", matchPaths: ["/returns"], label: "Returns & Refunds", icon: FiRotateCcw },
  { path: "/expenses", matchPaths: ["/expenses"], label: "Daily Expenses", icon: FiDollarSign },
  { path: "/add-stock", matchPaths: ["/add-stock"], label: "Add Stock / Local Sale Purchase", icon: FiPlus },
  { path: "/supplier-refund", matchPaths: ["/supplier-refund"], label: "Refund to Supplier", icon: FiCornerDownLeft },
  { path: "/view-stock", matchPaths: ["/view-stock"], label: "View Stock", icon: FiPackage },
  { path: "/history", matchPaths: ["/history", "/sales/history", "/stock-purchase-history", "/stock/history"], label: "History", icon: FiClock },
  { path: "/suppliers", matchPaths: ["/suppliers", "/supplier-ledger"], label: "Suppliers / Customer Details", icon: FiTruck },
  { path: "/shopkeeper-stock", matchPaths: ["/shopkeeper-stock"], label: "Shopkeeper Stock & Sale", icon: FiUsers },
];

const Sidebar = ({
  collapsed,
  setCollapsed,
  mobileOpen = false,
  setMobileOpen,
  onOpenChangePassword,
}) => {
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const location = useLocation();
  const { user, logout } = useAuth();

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

  const isCollapsed = collapsed !== undefined ? collapsed : internalCollapsed;
  const handleToggle = () => {
    if (setCollapsed) {
      setCollapsed(!isCollapsed);
    } else {
      setInternalCollapsed(!isCollapsed);
    }
  };

  const handleNavClick = () => {
    if (setMobileOpen) {
      setMobileOpen(false);
    }
  };

  return (
    <aside
      className={`pos-sidebar d-flex flex-column ${
        isCollapsed ? "collapsed" : ""
      } ${mobileOpen ? "mobile-open" : ""}`}
    >
      {/* Sidebar Header / Brand */}
      <div className="pos-header-height border-bottom w-100 flex-shrink-0 d-flex align-items-center">
        {isCollapsed ? (
          <div className="d-flex align-items-center justify-content-center w-100">
            <button
              type="button"
              className="btn btn-sm p-0 border-0 bg-transparent d-flex align-items-center justify-content-center"
              onClick={handleToggle}
              title="Expand sidebar (Sheikh Hammad)"
              aria-label="Expand sidebar"
            >
              <LogoIcon size={36} />
            </button>
          </div>
        ) : (
          <div className="d-flex align-items-center justify-content-between px-2 px-md-3 w-100">
            <div className="d-flex align-items-center flex-shrink-0" style={{ maxWidth: "185px" }}>
              <Logo height={44} />
            </div>

            {/* Mobile close button */}
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary text-dark d-md-none p-1 border-0 flex-shrink-0 ms-auto me-1"
              onClick={() => setMobileOpen && setMobileOpen(false)}
              aria-label="Close sidebar"
            >
              <FiX size={18} />
            </button>

            {/* Desktop collapse toggle button */}
            <button
              type="button"
              className="btn btn-sm text-secondary d-none d-md-flex align-items-center justify-content-center p-1 border-0 flex-shrink-0"
              onClick={handleToggle}
              title="Collapse sidebar"
              aria-label="Collapse sidebar"
            >
              <FiChevronLeft size={16} />
            </button>
          </div>
        )}
      </div>

      {/* Navigation List */}
      <div className="flex-grow-1 overflow-y-auto px-2 py-3" style={{ minHeight: 0 }}>
        <div className="d-flex flex-column gap-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isMatch = item.matchPaths
              ? item.matchPaths.includes(location.pathname)
              : location.pathname === item.path;

            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === "/" || item.path === "/sales"}
                onClick={handleNavClick}
                className={() => `pos-nav-link ${isMatch ? "active" : ""}`}
                title={isCollapsed ? item.label : undefined}
              >
                <Icon size={18} className="flex-shrink-0" />
                {!isCollapsed && (
                  <span
                    style={
                      item.label.length > 20
                        ? { fontSize: "0.78rem", whiteSpace: "nowrap", letterSpacing: "-0.2px" }
                        : { whiteSpace: "nowrap" }
                    }
                  >
                    {item.label}
                  </span>
                )}
              </NavLink>
            );
          })}
        </div>
      </div>

      {/* Sidebar Footer */}
      <div className={`p-3 border-top mt-auto flex-shrink-0 ${isCollapsed ? "px-1 text-center" : ""}`}>
        <div
          className={`d-flex align-items-center ${
            isCollapsed ? "flex-column gap-2" : "gap-2"
          }`}
        >
          <div
            className="rounded-circle bg-dark text-white d-flex align-items-center justify-content-center flex-shrink-0 shadow-sm"
            style={{ width: "32px", height: "32px", fontSize: "0.75rem", fontWeight: 600 }}
            title={user?.email || "Admin User"}
          >
            {user?.email ? user.email.slice(0, 2).toUpperCase() : "AD"}
          </div>
          {!isCollapsed && (
            <div className="overflow-hidden flex-grow-1" style={{ minWidth: 0 }}>
              <div className="small fw-semibold text-dark text-truncate">
                {user?.role === "admin" ? "Admin User" : "POS User"}
              </div>
              <div
                className="text-secondary small text-truncate"
                style={{ fontSize: "0.7rem" }}
                title={user?.email}
              >
                {user?.email || "admin@pos.local"}
              </div>
            </div>
          )}
          <div className={`d-flex align-items-center ${isCollapsed ? "flex-column mt-1 gap-1" : "ms-auto gap-1"}`}>
            <button
              type="button"
              className="btn btn-link text-secondary p-1 d-flex align-items-center justify-content-center text-decoration-none border-0"
              onClick={onOpenChangePassword}
              title="Change Account Password"
              aria-label="Change Account Password"
              style={{
                borderRadius: "6px",
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "#09090b";
                e.currentTarget.style.backgroundColor = "rgba(0, 0, 0, 0.07)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "";
                e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              <FiKey size={15} />
            </button>
            <button
              type="button"
              className="btn btn-link text-secondary p-1 d-flex align-items-center justify-content-center text-decoration-none border-0"
              onClick={handleLogout}
              title="Sign Out"
              aria-label="Sign Out"
              style={{
                borderRadius: "6px",
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "#dc3545";
                e.currentTarget.style.backgroundColor = "rgba(220, 53, 69, 0.1)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "";
                e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              <FiLogOut size={16} />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
