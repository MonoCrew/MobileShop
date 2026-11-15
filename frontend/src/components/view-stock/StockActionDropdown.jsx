import React, { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { FiMoreVertical } from "react-icons/fi";

export default function StockActionDropdown({ actions = [] }) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuCoords, setMenuCoords] = useState(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);

  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const estimatedHeight = actions.length * 40 + 16;
    const spaceBelow = window.innerHeight - rect.bottom;
    const showAbove = spaceBelow < estimatedHeight && rect.top > estimatedHeight;

    setMenuCoords({
      top: showAbove ? Math.max(8, rect.top - estimatedHeight - 4) : rect.bottom + 4,
      right: Math.max(8, window.innerWidth - rect.right),
    });
  }, [actions.length]);

  const toggleDropdown = (e) => {
    e.stopPropagation();
    if (isOpen) {
      setIsOpen(false);
    } else {
      updatePosition();
      setIsOpen(true);
    }
  };

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event) => {
      if (
        buttonRef.current &&
        !buttonRef.current.contains(event.target) &&
        menuRef.current &&
        !menuRef.current.contains(event.target)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Close on scroll or window resize
  useEffect(() => {
    if (!isOpen) return;

    const handleScrollOrResize = () => {
      setIsOpen(false);
    };

    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);
    return () => {
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [isOpen]);

  if (!actions || actions.length === 0) return null;

  return (
    <>
      <div
        className="d-inline-block position-relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          ref={buttonRef}
          type="button"
          className="btn btn-sm btn-light border-0 p-1 text-secondary rounded-circle d-flex align-items-center justify-content-center"
          style={{ width: "30px", height: "30px", transition: "all 0.15s ease" }}
          onClick={toggleDropdown}
          title="Actions"
          aria-label="Actions"
        >
          <FiMoreVertical size={16} />
        </button>
      </div>

      {isOpen &&
        menuCoords &&
        createPortal(
          <div
            ref={menuRef}
            className="py-1 rounded-3 border"
            style={{
              position: "fixed",
              top: `${menuCoords.top}px`,
              right: `${menuCoords.right}px`,
              minWidth: "210px",
              zIndex: 99999,
              backgroundColor: "#ffffff",
              boxShadow:
                "0 10px 25px -5px rgba(0, 0, 0, 0.18), 0 8px 10px -6px rgba(0, 0, 0, 0.1)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {actions.map((act, idx) => (
              <button
                key={idx}
                type="button"
                className={`dropdown-item d-flex align-items-center gap-2 px-3 py-2 small text-start w-100 border-0 bg-transparent text-nowrap ${
                  act.variant === "danger" ? "text-danger" : "text-dark"
                } ${act.disabled ? "disabled opacity-50" : ""}`}
                style={{
                  cursor: act.disabled ? "not-allowed" : "pointer",
                  transition: "background-color 0.12s ease",
                }}
                onMouseEnter={(e) => {
                  if (!act.disabled) e.currentTarget.style.backgroundColor = "#f4f4f5";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (act.disabled) return;
                  setIsOpen(false);
                  act.onClick();
                }}
              >
                {act.icon && (
                  <span className="d-flex align-items-center text-secondary flex-shrink-0">
                    {act.icon}
                  </span>
                )}
                <span className="fw-medium text-nowrap">{act.label}</span>
              </button>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}
