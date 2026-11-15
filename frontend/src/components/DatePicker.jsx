import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  FiCalendar,
  FiChevronLeft,
  FiChevronRight,
  FiChevronDown,
} from "react-icons/fi";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const DAY_NAMES = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

const DatePicker = ({ value, onChange, error }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showMonthMenu, setShowMonthMenu] = useState(false);
  const [showYearMenu, setShowYearMenu] = useState(false);

  const buttonRef = useRef(null);
  const popoverRef = useRef(null);

  // Parse initial or fallback date
  const parsedDate = value ? new Date(value + "T00:00:00") : new Date();
  const validParsed = isNaN(parsedDate.getTime()) ? new Date() : parsedDate;

  const [viewYear, setViewYear] = useState(validParsed.getFullYear());
  const [viewMonth, setViewMonth] = useState(validParsed.getMonth());

  const [coords, setCoords] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (value) {
      const d = new Date(value + "T00:00:00");
      if (!isNaN(d.getTime())) {
        setViewYear(d.getFullYear());
        setViewMonth(d.getMonth());
      }
    }
  }, [value]);

  // Position calculation
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const updatePosition = () => {
        if (!buttonRef.current) return;
        const rect = buttonRef.current.getBoundingClientRect();
        const popoverHeight = 290;
        const popoverWidth = 295;

        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;

        const openUpwards = spaceBelow < popoverHeight && spaceAbove >= popoverHeight;

        let top = openUpwards ? rect.top - popoverHeight - 6 : rect.bottom + 6;
        let left = rect.left;

        if (left + popoverWidth > window.innerWidth - 12) {
          left = window.innerWidth - popoverWidth - 12;
        }
        if (left < 12) left = 12;
        if (top < 12) top = 12;

        setCoords({ top, left });
      };

      updatePosition();
      window.addEventListener("scroll", updatePosition, true);
      window.addEventListener("resize", updatePosition);

      return () => {
        window.removeEventListener("scroll", updatePosition, true);
        window.removeEventListener("resize", updatePosition);
      };
    }
  }, [isOpen]);

  // Click outside to close main popover or dropdowns
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target)
      ) {
        setIsOpen(false);
        setShowMonthMenu(false);
        setShowYearMenu(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const handlePrevMonth = () => {
    setShowMonthMenu(false);
    setShowYearMenu(false);
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((prev) => prev - 1);
    } else {
      setViewMonth((prev) => prev - 1);
    }
  };

  const handleNextMonth = () => {
    setShowMonthMenu(false);
    setShowYearMenu(false);
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((prev) => prev + 1);
    } else {
      setViewMonth((prev) => prev + 1);
    }
  };

  const handleSelectDay = (day) => {
    const m = String(viewMonth + 1).padStart(2, "0");
    const d = String(day).padStart(2, "0");
    const dateStr = `${viewYear}-${m}-${d}`;
    onChange(dateStr);
    setIsOpen(false);
    setShowMonthMenu(false);
    setShowYearMenu(false);
  };

  const handleToday = () => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const d = String(today.getDate()).padStart(2, "0");
    onChange(`${y}-${m}-${d}`);
    setViewYear(y);
    setViewMonth(today.getMonth());
    setIsOpen(false);
    setShowMonthMenu(false);
    setShowYearMenu(false);
  };

  // Dynamic 10-year range centered around viewYear (never hardcoded, exactly 10 years)
  const years = [];
  const startYear = viewYear - 5;
  for (let i = 0; i < 10; i++) {
    years.push(startYear + i);
  }

  // Calendar day calculation
  const firstDayIndex = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

  const prevMonthDays = [];
  for (let i = firstDayIndex - 1; i >= 0; i--) {
    prevMonthDays.push(daysInPrevMonth - i);
  }

  const currentMonthDays = [];
  for (let i = 1; i <= daysInMonth; i++) {
    currentMonthDays.push(i);
  }

  const totalCells = prevMonthDays.length + currentMonthDays.length;
  const nextMonthDaysCount = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
  const nextMonthDays = [];
  for (let i = 1; i <= nextMonthDaysCount; i++) {
    nextMonthDays.push(i);
  }

  const isSelected = (day) => {
    if (!value) return false;
    const parts = value.split("-");
    return (
      parseInt(parts[0], 10) === viewYear &&
      parseInt(parts[1], 10) === viewMonth + 1 &&
      parseInt(parts[2], 10) === day
    );
  };

  const isToday = (day) => {
    const today = new Date();
    return (
      today.getFullYear() === viewYear &&
      today.getMonth() === viewMonth &&
      today.getDate() === day
    );
  };

  const formatDisplay = (val) => {
    if (!val) return "Select date";
    const d = new Date(val + "T00:00:00");
    if (isNaN(d.getTime())) return val;
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          setIsOpen(!isOpen);
          setShowMonthMenu(false);
          setShowYearMenu(false);
        }}
        className={`form-control form-control-sm text-start d-flex align-items-center justify-content-between bg-white ${
          error ? "is-invalid" : ""
        }`}
        style={{ cursor: "pointer", minHeight: "31px" }}
      >
        <span className={value ? "text-dark fw-medium small" : "text-secondary small"}>
          {formatDisplay(value)}
        </span>
        <FiCalendar size={14} className="text-secondary flex-shrink-0 ms-2" />
      </button>

      {isOpen &&
        createPortal(
          <div
            ref={popoverRef}
            className="bg-white border shadow-lg rounded-3 p-3 position-fixed"
            style={{
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              width: "295px",
              zIndex: 9999,
            }}
          >
            {/* Header: Custom Shadcn-Style Month & Year Selectors with Chevrons */}
            <div className="d-flex align-items-center justify-content-between gap-1 mb-2 position-relative">
              <div className="d-flex align-items-center gap-1">
                {/* Custom Month Dropdown Button */}
                <div className="position-relative">
                  <button
                    type="button"
                    className="btn btn-sm btn-light border py-1 px-2 text-dark fw-semibold d-flex align-items-center justify-content-between rounded-2"
                    style={{ fontSize: "0.78rem", minWidth: "96px" }}
                    onClick={() => {
                      setShowMonthMenu(!showMonthMenu);
                      setShowYearMenu(false);
                    }}
                  >
                    <span>{MONTH_NAMES[viewMonth]}</span>
                    <FiChevronDown size={13} className="text-secondary ms-1" />
                  </button>

                  {/* Custom Month Dropdown Menu */}
                  {showMonthMenu && (
                    <div
                      className="position-absolute bg-white border shadow rounded-2 p-1"
                      style={{
                        top: "100%",
                        left: 0,
                        marginTop: "4px",
                        width: "125px",
                        maxHeight: "170px",
                        overflowY: "auto",
                        zIndex: 10001,
                      }}
                    >
                      {MONTH_NAMES.map((m, idx) => (
                        <button
                          key={m}
                          type="button"
                          className={`btn btn-sm w-100 text-start py-1 px-2 rounded-1 border-0 ${
                            viewMonth === idx
                              ? "bg-dark text-white fw-bold"
                              : "text-dark bg-transparent"
                          }`}
                          style={{ fontSize: "0.76rem" }}
                          onClick={() => {
                            setViewMonth(idx);
                            setShowMonthMenu(false);
                          }}
                          onMouseEnter={(e) => {
                            if (viewMonth !== idx) e.currentTarget.style.backgroundColor = "#f4f4f5";
                          }}
                          onMouseLeave={(e) => {
                            if (viewMonth !== idx) e.currentTarget.style.backgroundColor = "transparent";
                          }}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Custom Year Dropdown Button */}
                <div className="position-relative">
                  <button
                    type="button"
                    className="btn btn-sm btn-light border py-1 px-2 text-dark fw-semibold d-flex align-items-center justify-content-between rounded-2"
                    style={{ fontSize: "0.78rem", minWidth: "74px" }}
                    onClick={() => {
                      setShowYearMenu(!showYearMenu);
                      setShowMonthMenu(false);
                    }}
                  >
                    <span>{viewYear}</span>
                    <FiChevronDown size={13} className="text-secondary ms-1" />
                  </button>

                  {/* Custom Year Dropdown Menu (Exactly 10 dynamic years) */}
                  {showYearMenu && (
                    <div
                      className="position-absolute bg-white border shadow rounded-2 p-1"
                      style={{
                        top: "100%",
                        left: 0,
                        marginTop: "4px",
                        width: "80px",
                        maxHeight: "170px",
                        overflowY: "auto",
                        zIndex: 10001,
                      }}
                    >
                      {years.map((y) => (
                        <button
                          key={y}
                          type="button"
                          className={`btn btn-sm w-100 text-start py-1 px-2 rounded-1 border-0 ${
                            viewYear === y
                              ? "bg-dark text-white fw-bold"
                              : "text-dark bg-transparent"
                          }`}
                          style={{ fontSize: "0.76rem" }}
                          onClick={() => {
                            setViewYear(y);
                            setShowYearMenu(false);
                          }}
                          onMouseEnter={(e) => {
                            if (viewYear !== y) e.currentTarget.style.backgroundColor = "#f4f4f5";
                          }}
                          onMouseLeave={(e) => {
                            if (viewYear !== y) e.currentTarget.style.backgroundColor = "transparent";
                          }}
                        >
                          {y}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Prev / Next buttons */}
              <div className="d-flex gap-1 flex-shrink-0">
                <button
                  type="button"
                  className="btn btn-sm btn-light border-0 p-1 d-flex align-items-center justify-content-center rounded"
                  onClick={handlePrevMonth}
                  title="Previous Month"
                  aria-label="Previous Month"
                >
                  <FiChevronLeft size={15} />
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-light border-0 p-1 d-flex align-items-center justify-content-center rounded"
                  onClick={handleNextMonth}
                  title="Next Month"
                  aria-label="Next Month"
                >
                  <FiChevronRight size={15} />
                </button>
              </div>
            </div>

            {/* Days of Week */}
            <div
              className="d-grid mb-1 text-center text-secondary small fw-medium"
              style={{ gridTemplateColumns: "repeat(7, 1fr)" }}
            >
              {DAY_NAMES.map((d) => (
                <span key={d} style={{ fontSize: "0.72rem" }}>
                  {d}
                </span>
              ))}
            </div>

            {/* Days Grid */}
            <div
              className="d-grid text-center"
              style={{ gridTemplateColumns: "repeat(7, 1fr)", rowGap: "3px" }}
            >
              {/* Previous month padding days */}
              {prevMonthDays.map((d, i) => (
                <span
                  key={`prev-${i}`}
                  className="text-muted small p-1 user-select-none"
                  style={{ opacity: 0.35, fontSize: "0.78rem" }}
                >
                  {d}
                </span>
              ))}

              {/* Current month days */}
              {currentMonthDays.map((d) => {
                const selected = isSelected(d);
                const today = isToday(d);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => handleSelectDay(d)}
                    className={`btn btn-sm p-0 d-flex align-items-center justify-content-center rounded-2 border-0 ${
                      selected
                        ? "bg-dark text-white fw-semibold shadow-sm"
                        : today
                        ? "border border-dark text-dark fw-bold bg-light"
                        : "text-dark"
                    }`}
                    style={{
                      height: "30px",
                      fontSize: "0.8rem",
                      transition: "all 0.15s ease",
                    }}
                    onMouseEnter={(e) => {
                      if (!selected) {
                        e.currentTarget.style.backgroundColor = "#18181b";
                        e.currentTarget.style.color = "#ffffff";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!selected) {
                        e.currentTarget.style.backgroundColor = today ? "#f8f9fa" : "transparent";
                        e.currentTarget.style.color = "#09090b";
                      }
                    }}
                  >
                    {d}
                  </button>
                );
              })}

              {/* Next month padding days */}
              {nextMonthDays.map((d, i) => (
                <span
                  key={`next-${i}`}
                  className="text-muted small p-1 user-select-none"
                  style={{ opacity: 0.35, fontSize: "0.78rem" }}
                >
                  {d}
                </span>
              ))}
            </div>

            {/* Footer Actions */}
            <div className="d-flex justify-content-between align-items-center pt-2 mt-2 border-top">
              <button
                type="button"
                className="btn btn-sm btn-outline-dark px-2 py-1 rounded-2 fw-semibold"
                onClick={handleToday}
                style={{ fontSize: "0.74rem", transition: "all 0.15s ease" }}
              >
                Today
              </button>
              <button
                type="button"
                className="btn btn-sm btn-light border px-2 py-1 rounded-2 text-secondary"
                onClick={() => {
                  setIsOpen(false);
                  setShowMonthMenu(false);
                  setShowYearMenu(false);
                }}
                style={{ fontSize: "0.74rem" }}
              >
                Close
              </button>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};

export default DatePicker;
