import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { FiSearch, FiX, FiCheck, FiUser, FiPlus, FiAlertCircle } from "react-icons/fi";
import api from "../../api/axios";

/**
 * ShopkeeperAutocomplete Component
 * Reuses the exact same autocomplete design, API pattern, search behavior,
 * and database-linking approach as the Supplier field on AddStock.
 *
 * Ensures each shopkeeper is stored with a unique persistent MongoDB _id.
 */
export default function ShopkeeperAutocomplete({
  value = "",
  shopkeeperId = null,
  onChange,
  placeholder = "Search or enter shopkeeper name...",
  className = "",
  required = false,
  error = "",
  disabled = false,
}) {
  const [query, setQuery] = useState(value || "");
  const [existingShopkeepers, setExistingShopkeepers] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);

  const containerRef = useRef(null);
  const abortControllerRef = useRef(null);

  // Sync external value changes
  useEffect(() => {
    setQuery(value || "");
  }, [value]);

  // Fetch initial/recent shopkeepers
  const fetchRecentShopkeepers = useCallback(async () => {
    try {
      const res = await api.get("/shopkeepers?limit=25");
      if (res.data?.success && Array.isArray(res.data.data)) {
        setExistingShopkeepers(res.data.data);
      }
    } catch (err) {
      console.error("Failed to load shopkeeper directory:", err);
    }
  }, []);

  // Live server-side search with debounce
  const searchShopkeepersInDb = useCallback(async (searchQuery) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const cleanQ = (searchQuery || "").trim();
    try {
      setIsSearching(true);
      const url = cleanQ
        ? `/shopkeepers?search=${encodeURIComponent(cleanQ)}&limit=25`
        : `/shopkeepers?limit=25`;
      const res = await api.get(url, { signal: controller.signal });
      if (res.data?.success && Array.isArray(res.data.data)) {
        setExistingShopkeepers((prev) => {
          const map = new Map();
          res.data.data.forEach((s) => map.set(String(s._id), s));
          prev.forEach((s) => {
            if (!map.has(String(s._id))) {
              map.set(String(s._id), s);
            }
          });
          return Array.from(map.values());
        });
      }
    } catch (err) {
      if (err?.name !== "CanceledError" && err?.code !== "ERR_CANCELED") {
        console.error("Live DB shopkeeper search failed:", err);
      }
    } finally {
      setIsSearching(false);
    }
  }, []);

  useEffect(() => {
    fetchRecentShopkeepers();
  }, [fetchRecentShopkeepers]);

  useEffect(() => {
    const timer = setTimeout(() => {
      searchShopkeepersInDb(query);
    }, 250);
    return () => clearTimeout(timer);
  }, [query, searchShopkeepersInDb]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setShowDropdown(false);
        setActiveSuggestionIndex(-1);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const cleanQuery = (query || "").trim();
  const queryLower = cleanQuery.toLowerCase();

  // Client-side scoring & ordering for instant responsiveness while live search resolves
  const matchingShopkeepers = useMemo(() => {
    if (!existingShopkeepers || existingShopkeepers.length === 0) return [];
    if (!queryLower) return existingShopkeepers.slice(0, 10);

    const chars = queryLower.split("").filter((c) => c.trim().length > 0);
    const subseqRegex =
      chars.length > 1
        ? new RegExp(chars.map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*"), "i")
        : null;

    const getScore = (name) => {
      const nLower = (name || "").toLowerCase();
      if (nLower === queryLower) return 0;
      if (nLower.startsWith(queryLower)) return 1;
      const words = nLower.split(/\s+/);
      if (words.some((w) => w.startsWith(queryLower))) return 2;
      if (nLower.includes(queryLower)) return 3;
      if (subseqRegex && subseqRegex.test(nLower)) return 4;
      return 999;
    };

    const filtered = existingShopkeepers.filter((s) => getScore(s.name) < 999);
    filtered.sort((a, b) => {
      const scoreA = getScore(a.name);
      const scoreB = getScore(b.name);
      if (scoreA !== scoreB) return scoreA - scoreB;
      return a.name.localeCompare(b.name);
    });

    return filtered.slice(0, 15);
  }, [existingShopkeepers, queryLower]);

  const exactMatch = useMemo(() => {
    if (!queryLower) return null;
    return existingShopkeepers.find(
      (s) => (s.name || "").trim().toLowerCase() === queryLower
    );
  }, [existingShopkeepers, queryLower]);

  const handleSelectShopkeeper = (s) => {
    if (!s) return;
    setQuery(s.name);
    setShowDropdown(false);
    setActiveSuggestionIndex(-1);
    if (onChange) {
      onChange({
        name: s.name,
        _id: s._id,
        shopkeeper: s,
      });
    }
  };

  const handleCreateNewShopkeeper = async () => {
    if (!cleanQuery) return;
    try {
      setIsCreating(true);
      const res = await api.post("/shopkeepers", { name: cleanQuery });
      if (res.data?.success && res.data.data) {
        const created = res.data.data;
        setExistingShopkeepers((prev) => [created, ...prev.filter((p) => String(p._id) !== String(created._id))]);
        handleSelectShopkeeper(created);
      }
    } catch (err) {
      console.error("Failed to create new shopkeeper:", err);
    } finally {
      setIsCreating(false);
    }
  };

  const handleInputChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    setShowDropdown(true);
    setActiveSuggestionIndex(-1);

    const match = existingShopkeepers.find(
      (s) => (s.name || "").trim().toLowerCase() === val.trim().toLowerCase()
    );

    if (onChange) {
      onChange({
        name: val,
        _id: match ? match._id : null,
        shopkeeper: match || null,
      });
    }
  };

  const handleClear = () => {
    setQuery("");
    setShowDropdown(true);
    setActiveSuggestionIndex(-1);
    if (onChange) {
      onChange({
        name: "",
        _id: null,
        shopkeeper: null,
      });
    }
  };

  const handleKeyDown = (e) => {
    if (!showDropdown) {
      if (e.key === "ArrowDown") setShowDropdown(true);
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveSuggestionIndex((prev) =>
        prev < matchingShopkeepers.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveSuggestionIndex((prev) =>
        prev > 0 ? prev - 1 : matchingShopkeepers.length - 1
      );
    } else if (e.key === "Enter") {
      if (activeSuggestionIndex >= 0 && activeSuggestionIndex < matchingShopkeepers.length) {
        e.preventDefault();
        handleSelectShopkeeper(matchingShopkeepers[activeSuggestionIndex]);
      } else if (!exactMatch && cleanQuery) {
        e.preventDefault();
        handleCreateNewShopkeeper();
      }
    } else if (e.key === "Escape") {
      setShowDropdown(false);
      setActiveSuggestionIndex(-1);
    }
  };

  return (
    <div className={`position-relative ${className}`} ref={containerRef}>
      <div className="input-group" style={{ height: "40px" }}>
        <span className="input-group-text bg-white text-secondary">
          <FiSearch size={15} />
        </span>
        <input
          type="text"
          value={query}
          onChange={handleInputChange}
          onFocus={() => {
            setShowDropdown(true);
            if (existingShopkeepers.length === 0) fetchRecentShopkeepers();
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          className={`form-control ${error ? "is-invalid" : ""}`}
          autoComplete="off"
          style={{ height: "100%" }}
        />
        {isSearching && (
          <span className="input-group-text bg-white text-muted px-2" title="Searching database...">
            <span
              className="spinner-border spinner-border-sm text-secondary"
              style={{ width: "12px", height: "12px", borderWidth: "2px" }}
              role="status"
            />
          </span>
        )}
        {query && !disabled && (
          <button
            type="button"
            className="btn btn-outline-secondary px-2"
            onClick={handleClear}
            title="Clear shopkeeper"
          >
            <FiX size={14} />
          </button>
        )}
      </div>

      {error && <div className="text-danger small mt-1" style={{ fontSize: "0.74rem" }}>{error}</div>}

      {/* Autocomplete Dropdown List */}
      {showDropdown && !disabled && (
        <div
          className="position-absolute start-0 end-0 bg-white border rounded-2 shadow-lg mt-1 overflow-hidden"
          style={{
            zIndex: 1070,
            maxHeight: "260px",
            overflowY: "auto",
          }}
        >
          <div
            className="d-flex align-items-center justify-content-between px-3 py-2 bg-light border-bottom text-muted"
            style={{ fontSize: "0.7rem" }}
          >
            <span className="fw-semibold">
              {cleanQuery ? `Matching "${cleanQuery}"` : `Shopkeepers Directory (${matchingShopkeepers.length})`}
            </span>
            {isSearching ? (
              <span className="text-secondary d-flex align-items-center gap-1">
                <span
                  className="spinner-border spinner-border-sm"
                  style={{ width: "10px", height: "10px", borderWidth: "2px" }}
                />
                Searching...
              </span>
            ) : (
              <span className="badge bg-secondary-subtle text-secondary border" style={{ fontSize: "0.64rem" }}>
                {matchingShopkeepers.length} found
              </span>
            )}
          </div>

          {/* Quick Create New Option if no exact match */}
          {cleanQuery && !exactMatch && (
            <button
              type="button"
              className="list-group-item list-group-item-action d-flex align-items-center justify-content-between py-2 px-3 border-bottom bg-light-subtle text-primary"
              onMouseDown={(e) => {
                e.preventDefault();
                handleCreateNewShopkeeper();
              }}
              disabled={isCreating}
              style={{ cursor: "pointer", fontSize: "0.76rem" }}
            >
              <div className="d-flex align-items-center gap-2">
                <span className="badge bg-primary text-white rounded-circle p-1 d-flex align-items-center justify-content-center" style={{ width: "18px", height: "18px" }}>
                  <FiPlus size={11} />
                </span>
                <span>
                  Create new shopkeeper: <strong>"{cleanQuery}"</strong>
                </span>
              </div>
              {isCreating && (
                <span className="spinner-border spinner-border-sm text-primary" style={{ width: "12px", height: "12px" }} />
              )}
            </button>
          )}

          {matchingShopkeepers.length === 0 && !cleanQuery ? (
            <div className="p-3 text-center text-muted small" style={{ fontSize: "0.75rem" }}>
              <FiUser size={18} className="text-secondary mb-1 d-block mx-auto" />
              <div>No shopkeepers recorded yet. Type a name to create one.</div>
            </div>
          ) : (
            <div className="list-group list-group-flush">
              {matchingShopkeepers.map((s, idx) => {
                const isSelected = String(s._id) === String(shopkeeperId);
                const isHighlighted = activeSuggestionIndex === idx;
                const stockHeld = s.currentStockHeld || 0;
                const due = s.totalDue || 0;

                return (
                  <button
                    key={s._id}
                    type="button"
                    className={`list-group-item list-group-item-action d-flex align-items-center justify-content-between py-2 px-3 border-bottom ${
                      isSelected ? "bg-light text-primary fw-semibold" : isHighlighted ? "bg-light" : ""
                    }`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelectShopkeeper(s);
                    }}
                    style={{ cursor: "pointer", fontSize: "0.78rem" }}
                  >
                    <div className="d-flex flex-column text-start me-2 overflow-hidden">
                      <div className="d-flex align-items-center gap-2">
                        <span className="fw-semibold text-dark text-truncate">{s.name}</span>
                        {isSelected && <FiCheck size={13} className="text-primary flex-shrink-0" />}
                      </div>
                      <div className="d-flex align-items-center gap-2 mt-1" style={{ fontSize: "0.68rem" }}>
                        <span className="text-muted">
                          Holding: <strong className={stockHeld > 0 ? "text-dark" : "text-muted"}>{stockHeld} units</strong>
                        </span>
                        {due > 0 && (
                          <>
                            <span className="text-muted">&bull;</span>
                            <span className="text-danger fw-semibold">Due: Rs. {due.toLocaleString()}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <span className="badge bg-light text-secondary border small px-2 py-1" style={{ fontSize: "0.66rem" }}>
                      Select
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
