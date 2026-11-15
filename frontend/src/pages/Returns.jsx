import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useLocation, Link } from "react-router-dom";
import {
  FiRotateCcw,
  FiSearch,
  FiPrinter,
  FiPlus,
  FiMinus,
  FiCheckCircle,
  FiAlertCircle,
  FiLayers,
  FiCreditCard,
  FiX,
  FiAlertTriangle,
  FiFileText,
  FiClock,
  FiArrowRight,
  FiRefreshCw,
  FiDollarSign,
  FiPackage,
  FiTrash2,
  FiZap,
  FiTag,
  FiUsers,
} from "react-icons/fi";
import Swal from "sweetalert2";
import api from "../api/axios";
import { formatUnit, formatFullAmount } from "../utils/unitChanger";
import {
  RECEIPT_TERMS,
  formatDateTimeAmPm,
  formatFullDateTimeAmPm,
} from "../components/add-stock/StockReceiptModal";
import ReturnReceiptModal from "../components/returns/ReturnReceiptModal";

export default function Returns() {
  const location = useLocation();

  // 1. Search Bar & Sold Items State (Stable, persistent DOM)
  const [searchQuery, setSearchQuery] = useState(
    location.state?.lookupQuery || ""
  );
  const [isSearchingSales, setIsSearchingSales] = useState(false);
  const [soldItemsList, setSoldItemsList] = useState([]);
  const [searchError, setSearchError] = useState(null);
  const searchInputRef = useRef(null);
  const searchDebounceRef = useRef(null);

  // Date Filtering State: 'today' | 'yesterday' | 'custom' | 'all'
  const [dateFilter, setDateFilter] = useState("today");
  const [customStartDate, setCustomStartDate] = useState(() => {
    const d = new Date();
    return d.toISOString().split("T")[0];
  });
  const [customEndDate, setCustomEndDate] = useState(() => {
    const d = new Date();
    return d.toISOString().split("T")[0];
  });

  // 2. Multi-Item Return Cart State (Users can refund multiple items at once)
  const [returnCart, setReturnCart] = useState([]);
  const [lastScannedBarcode, setLastScannedBarcode] = useState(null);

  // Exchange / Replacement Mode State
  const [isExchangeMode, setIsExchangeMode] = useState(false);
  const [exchangeCart, setExchangeCart] = useState([]);
  const [exchangeSearchQuery, setExchangeSearchQuery] = useState("");
  const [exchangeSearchResults, setExchangeSearchResults] = useState([]);
  const [isSearchingExchangeStock, setIsSearchingExchangeStock] = useState(false);
  const [showExchangeDropdown, setShowExchangeDropdown] = useState(false);
  const exchangeSearchInputRef = useRef(null);
  const exchangeSearchDebounceRef = useRef(null);
  const exchangeDropdownRef = useRef(null);

  // Synchronized refs to avoid stale closures in global scanner listener
  const returnCartRef = useRef(returnCart);
  returnCartRef.current = returnCart;

  const soldItemsListRef = useRef(soldItemsList);
  soldItemsListRef.current = soldItemsList;

  // 3. Return Reason & Notes
  const [returnReason, setReturnReason] = useState("Customer Return");
  const [returnNotes, setReturnNotes] = useState("");
  const [cashPayoutMethod, setCashPayoutMethod] = useState("Cash");

  // 4. Processing & Receipt Modal
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [completedReturnReceipt, setCompletedReturnReceipt] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);



  // Show auto-dismissing toast notifications
  const showToast = (text, type = "success") => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // Broadcast sync event to Dashboard and other tabs
  const broadcastSync = () => {
    try {
      window.dispatchEvent(new CustomEvent("pos_data_updated"));
      if (typeof BroadcastChannel !== "undefined") {
        const bc = new BroadcastChannel("pos_system_sync");
        bc.postMessage({ type: "RETURN_PROCESSED", timestamp: Date.now() });
        bc.close();
      }
    } catch (e) {
      console.warn("Sync broadcast error:", e);
    }
  };

  // =========================================================================
  // 1. SEARCH SOLD ITEMS WITH DATE FILTER (TODAY, YESTERDAY, CUSTOM, ALL)
  // =========================================================================
  const handleSearchSales = useCallback(
    async (
      overrideTerm = null,
      overridePeriod = null,
      overrideStart = null,
      overrideEnd = null
    ) => {
      const term = (overrideTerm !== null ? overrideTerm : searchQuery).trim();
      const period = overridePeriod !== null ? overridePeriod : dateFilter;
      const sDate = overrideStart !== null ? overrideStart : customStartDate;
      const eDate = overrideEnd !== null ? overrideEnd : customEndDate;

      setSearchError(null);
      setIsSearchingSales(true);

      try {
        const params = {
          query: term,
          limit: 60,
          period,
        };
        if (period === "custom") {
          if (sDate) params.startDate = sDate;
          if (eDate) params.endDate = eDate;
        }

        const res = await api.get("/returns/search", { params });

        if (res.data?.success) {
          const items = res.data.results || [];
          setSoldItemsList(items);

          if (items.length === 0) {
            if (term) {
              setSearchError(`No sold items found matching "${term}" for the selected filter.`);
            } else if (period === "today") {
              setSearchError("No sales recorded today with pending returnable items.");
            } else if (period === "yesterday") {
              setSearchError("No sales recorded yesterday with pending returnable items.");
            } else if (period === "custom") {
              setSearchError(`No returnable sales found between ${sDate} and ${eDate}.`);
            } else {
              setSearchError("No completed sales with returnable items found.");
            }
          }
        } else {
          setSearchError(res.data?.message || "No sold items found.");
        }
      } catch (err) {
        console.error("Sale search error:", err);
        setSearchError(
          err.response?.data?.message || "Failed to search sold items. Please try again."
        );
      } finally {
        setIsSearchingSales(false);
      }
    },
    [searchQuery, dateFilter, customStartDate, customEndDate]
  );

  // Filter Switcher Handlers
  const handleSelectDateFilter = (newPeriod) => {
    setDateFilter(newPeriod);
    handleSearchSales(null, newPeriod, null, null);
  };

  const handleCustomStartDateChange = (newStart) => {
    setCustomStartDate(newStart);
    if (dateFilter === "custom") {
      handleSearchSales(null, "custom", newStart, customEndDate);
    }
  };

  const handleCustomEndDateChange = (newEnd) => {
    setCustomEndDate(newEnd);
    if (dateFilter === "custom") {
      handleSearchSales(null, "custom", customStartDate, newEnd);
    }
  };

  // Real-time search as user types
  const handleSearchInputChange = (e) => {
    const val = e.target.value;
    setSearchQuery(val);
    setSearchError(null);

    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      handleSearchSales(val, null, null, null);
    }, 200);
  };

  // Load sold items immediately on mount
  useEffect(() => {
    handleSearchSales(searchQuery || "", dateFilter, customStartDate, customEndDate);
  }, []);

  // =========================================================================
  // 2. MULTI-ITEM RETURN CART OPERATIONS & SCANNER INTEGRATION
  // =========================================================================
  // Web Audio POS Scanner Chime Feedback
  const playBeep = (type = "success") => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      if (type === "success") {
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.12);
      } else {
        osc.frequency.setValueAtTime(320, ctx.currentTime);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.22);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.22);
      }
    } catch (_) { }
  };

  const handleAddToCart = useCallback((soldItem, specificBarcode = null) => {
    const maxAvail = soldItem.availableReturnQuantity ?? soldItem.returnableQuantity ?? 0;
    if (!soldItem.isEligible || maxAvail <= 0) {
      return false;
    }

    let success = true;
    setReturnCart((prevCart) => {
      const existingIndex = prevCart.findIndex(
        (it) => it.id === soldItem.id || (it.saleId === soldItem.saleId && it.stockId === soldItem.stockId)
      );

      const allSoldBarcodes = Array.isArray(soldItem.soldBarcodes) && soldItem.soldBarcodes.length > 0
        ? soldItem.soldBarcodes
        : (soldItem.barcode && soldItem.barcode !== "N/A" ? [soldItem.barcode] : []);

      if (existingIndex >= 0) {
        const existing = prevCart[existingIndex];
        const maxLimit = existing.availableReturnQuantity;
        if (existing.returnQuantity >= maxLimit) {
          success = false;
          return prevCart;
        }

        const nextQty = existing.returnQuantity + 1;
        let nextBarcodes = Array.isArray(existing.returnBarcodes) ? [...existing.returnBarcodes] : [];

        if (specificBarcode) {
          if (!nextBarcodes.includes(specificBarcode)) {
            nextBarcodes.push(specificBarcode);
          }
        } else {
          const availableToPick = (existing.soldBarcodes || allSoldBarcodes || []).find(
            (b) => !nextBarcodes.includes(b)
          );
          if (availableToPick) {
            nextBarcodes.push(availableToPick);
          } else if (existing.barcode && existing.barcode !== "N/A") {
            nextBarcodes.push(existing.barcode);
          }
        }

        const unitPrice = existing.unitSellingPrice || 0;
        let nextRefund = existing.actualRefundAmount;
        if (existing.refundPreset === "full" || existing.refundPreset == null) {
          nextRefund = Number((nextQty * unitPrice).toFixed(2));
        } else if (existing.refundPreset === "10") {
          nextRefund = Number((nextQty * unitPrice * 0.9).toFixed(2));
        } else if (existing.refundPreset === "20") {
          nextRefund = Number((nextQty * unitPrice * 0.8).toFixed(2));
        } else {
          const prevTotal = (existing.returnQuantity || 1) * unitPrice;
          const ratio = prevTotal > 0 ? (existing.actualRefundAmount || 0) / prevTotal : 1;
          nextRefund = Number((nextQty * unitPrice * ratio).toFixed(2));
        }

        const updated = [...prevCart];
        updated[existingIndex] = {
          ...existing,
          returnQuantity: nextQty,
          actualRefundAmount: nextRefund,
          returnBarcodes: nextBarcodes,
          soldBarcodes: existing.soldBarcodes?.length ? existing.soldBarcodes : allSoldBarcodes,
        };
        return updated;
      } else {
        const initialBarcodes = [];
        if (specificBarcode) {
          initialBarcodes.push(specificBarcode);
        } else if (allSoldBarcodes.length > 0) {
          initialBarcodes.push(allSoldBarcodes[0]);
        }

        const unitSelling = Number(soldItem.unitSellingPrice || soldItem.originalSellingPrice || 0);

        return [
          ...prevCart,
          {
            id: soldItem.id || `${soldItem.saleId}_${soldItem.stockId || soldItem.productName}`,
            saleId: soldItem.saleId,
            saleNumber: soldItem.saleNumber,
            customerName: soldItem.customerName || "",
            customerPhone: soldItem.customerPhone || "",
            customerId: soldItem.customerId || null,
            stockId: soldItem.stockId,
            productName: soldItem.productName,
            barcode: soldItem.barcode || (allSoldBarcodes[0] || "N/A"),
            soldBarcodes: allSoldBarcodes,
            returnBarcodes: initialBarcodes,
            category: soldItem.category || "General",
            soldQuantity: soldItem.soldQuantity,
            alreadyReturnedQuantity: soldItem.returnedQuantity || soldItem.alreadyReturnedQuantity || 0,
            availableReturnQuantity: maxAvail,
            unitSellingPrice: unitSelling,
            unitPurchaseCost: Number(soldItem.unitPurchaseCost || soldItem.originalCostPrice || 0),
            returnQuantity: 1,
            actualRefundAmount: unitSelling,
            refundPreset: "full",
            restoreToInventory: true,
            saleSource: soldItem.saleSource || "direct",
            shopkeeperName: soldItem.shopkeeperName || "",
            shopkeeperId: soldItem.shopkeeperId || null,
            shopkeeperTransferId: soldItem.shopkeeperTransferId || null,
          },
        ];
      }
    });
    return success;
  }, []);

  const handleUpdateCartQty = useCallback((itemId, delta) => {
    let success = false;
    setReturnCart((prevCart) => {
      return prevCart
        .map((item) => {
          if (item.id !== itemId) return item;
          const newQty = item.returnQuantity + delta;
          if (newQty <= 0) return null; // Remove if 0
          if (newQty > item.availableReturnQuantity) {
            return item;
          }
          success = true;

          const unitPrice = item.unitSellingPrice || 0;
          let nextRefund = item.actualRefundAmount;
          if (item.refundPreset === "full" || item.refundPreset == null) {
            nextRefund = Number((newQty * unitPrice).toFixed(2));
          } else if (item.refundPreset === "10") {
            nextRefund = Number((newQty * unitPrice * 0.9).toFixed(2));
          } else if (item.refundPreset === "20") {
            nextRefund = Number((newQty * unitPrice * 0.8).toFixed(2));
          } else if (item.refundPreset === "25") {
            nextRefund = Number((newQty * unitPrice * 0.75).toFixed(2));
          } else if (item.refundPreset === "custom") {
            nextRefund = item.actualRefundAmount;
          } else {
            const prevTotal = (item.returnQuantity || 1) * unitPrice;
            const ratio = prevTotal > 0 ? (item.actualRefundAmount || 0) / prevTotal : 1;
            nextRefund = Number((newQty * unitPrice * ratio).toFixed(2));
          }

          let updatedBarcodes = Array.isArray(item.returnBarcodes) ? [...item.returnBarcodes] : [];
          if (delta > 0) {
            const nextBc = (item.soldBarcodes || []).find((b) => !updatedBarcodes.includes(b));
            if (nextBc) {
              updatedBarcodes.push(nextBc);
            } else if (item.barcode && item.barcode !== "N/A") {
              updatedBarcodes.push(item.barcode);
            }
          } else if (delta < 0) {
            if (updatedBarcodes.length > newQty) {
              updatedBarcodes = updatedBarcodes.slice(0, newQty);
            }
          }

          return { ...item, returnQuantity: newQty, actualRefundAmount: nextRefund, returnBarcodes: updatedBarcodes };
        })
        .filter(Boolean);
    });
    return success;
  }, []);

  // -------------------------------------------------------------------------
  // Automatic Barcode / QR Scanner Processor
  // When a QR/barcode is scanned, finds the item and directly fills the right div
  // -------------------------------------------------------------------------
  const handleScanBarcode = useCallback(
    async (rawCode) => {
      let code = (rawCode || "").trim();
      if (!code) return;

      // Clean QR code formats (strip leading '#' or URL parameters if QR code contains a URL)
      if (code.startsWith("#")) code = code.slice(1).trim();
      try {
        if (code.includes("://")) {
          const parsed = new URL(code);
          const p =
            parsed.searchParams.get("sale") ||
            parsed.searchParams.get("saleNumber") ||
            parsed.searchParams.get("barcode");
          if (p) code = p;
          else {
            const parts = parsed.pathname.split("/").filter(Boolean);
            if (parts.length > 0) code = parts[parts.length - 1];
          }
        }
      } catch (_) { }

      setLastScannedBarcode(code);

      // 1. Check if the scanned barcode belongs to an item already present in the right div (returnCart)
      const existingInCart = returnCartRef.current.find(
        (it) =>
          (it.barcode && it.barcode.toLowerCase() === code.toLowerCase()) ||
          (Array.isArray(it.soldBarcodes) && it.soldBarcodes.some((b) => b && b.toLowerCase() === code.toLowerCase())) ||
          (Array.isArray(it.returnBarcodes) && it.returnBarcodes.some((b) => b && b.toLowerCase() === code.toLowerCase())) ||
          (it.saleNumber && it.saleNumber.toLowerCase() === code.toLowerCase())
      );

      if (existingInCart) {
        const isAlreadySelected = Array.isArray(existingInCart.returnBarcodes) && existingInCart.returnBarcodes.includes(code);
        if (isAlreadySelected) {
          playBeep("error");
          showToast(`IEMI ${code} is already in this refund cart item.`, "error");
          return;
        }

        if (existingInCart.returnQuantity >= existingInCart.availableReturnQuantity) {
          playBeep("error");
          showToast(
            `"${existingInCart.productName}" has reached maximum returnable limit (${existingInCart.availableReturnQuantity} pcs).`,
            "error"
          );
          return;
        }

        // Add this specific barcode to the returnCart item
        setReturnCart((prevCart) =>
          prevCart.map((it) => {
            if (it.id !== existingInCart.id) return it;
            const currentBcs = Array.isArray(it.returnBarcodes) ? [...it.returnBarcodes] : [];
            if (!currentBcs.includes(code)) currentBcs.push(code);
            return {
              ...it,
              returnQuantity: it.returnQuantity + 1,
              returnBarcodes: currentBcs,
            };
          })
        );
        playBeep("success");
        showToast(
          `✓ Scanned & added IEMI ${code} to ${existingInCart.productName}`,
          "success"
        );
        return;
      }

      // 2. Check if the item is in the currently loaded soldItemsList (left div)
      const localMatch = soldItemsListRef.current.find(
        (it) =>
          (it.barcode && it.barcode.toLowerCase() === code.toLowerCase()) ||
          (Array.isArray(it.soldBarcodes) && it.soldBarcodes.some((b) => b && b.toLowerCase() === code.toLowerCase())) ||
          (it.saleNumber && it.saleNumber.toLowerCase() === code.toLowerCase())
      );

      if (localMatch) {
        if (!localMatch.isEligible || (localMatch.returnableQuantity ?? localMatch.availableReturnQuantity) <= 0) {
          playBeep("error");
          showToast(
            `"${localMatch.productName}" has already been fully refunded (0 returnable pcs left).`,
            "error"
          );
          return;
        }

        handleAddToCart(localMatch, code);
        playBeep("success");
        showToast(
          `✓ Scanned IEMI ${code}: added ${localMatch.productName} to refund cart`,
          "success"
        );
        return;
      }

      // 3. Not in visible list (e.g. from an earlier date/session) -> Search backend across all time
      try {
        setIsSearchingSales(true);
        const res = await api.get("/returns/search", {
          params: { query: code, period: "all", limit: 30 },
        });

        if (res.data?.success && Array.isArray(res.data.results) && res.data.results.length > 0) {
          const matchedItem =
            res.data.results.find(
              (it) =>
                (it.barcode && it.barcode.toLowerCase() === code.toLowerCase()) ||
                (Array.isArray(it.soldBarcodes) && it.soldBarcodes.some((b) => b && b.toLowerCase() === code.toLowerCase())) ||
                (it.saleNumber && it.saleNumber.toLowerCase() === code.toLowerCase())
            ) || res.data.results[0];

          if (!matchedItem.isEligible || (matchedItem.returnableQuantity ?? matchedItem.availableReturnQuantity) <= 0) {
            playBeep("error");
            showToast(
              `"${matchedItem.productName}" has already been fully refunded.`,
              "error"
            );
            return;
          }

          // Merge into soldItemsList if missing so left div also shows it
          setSoldItemsList((prev) => {
            const exists = prev.some((p) => p.id === matchedItem.id);
            return exists ? prev : [matchedItem, ...prev];
          });

          handleAddToCart(matchedItem, code);
          playBeep("success");
          showToast(
            `✓ Scanned IEMI ${code}: added ${matchedItem.productName} (Sale #${matchedItem.saleNumber})`,
            "success"
          );
          return;
        }

        // 4. Fallback lookup via /returns/lookup
        const lookupRes = await api.get("/returns/lookup", {
          params: { query: code },
        });

        if (lookupRes.data?.success && lookupRes.data.sale) {
          const sale = lookupRes.data.sale;
          const eligibleItems = lookupRes.data.eligibleItems || [];

          if (eligibleItems.length === 0) {
            playBeep("error");
            showToast(
              `Sale #${sale.saleNumber} has no remaining returnable units.`,
              "error"
            );
            return;
          }

          const itemToReturn =
            eligibleItems.find(
              (it) =>
                (it.barcode && it.barcode.toLowerCase() === code.toLowerCase()) ||
                (Array.isArray(it.soldBarcodes) && it.soldBarcodes.some((b) => b && b.toLowerCase() === code.toLowerCase()))
            ) || eligibleItems[0];

          const formatted = {
            id: `${sale._id}_${itemToReturn._id || itemToReturn.stockId || itemToReturn.productName}`,
            saleId: sale._id,
            saleNumber: sale.saleNumber,
            customerPhone: sale.customerPhone || "",
            customerId: sale.customerId || null,
            stockId: itemToReturn.stockId,
            productName: itemToReturn.productName,
            barcode: itemToReturn.barcode || "N/A",
            soldBarcodes: itemToReturn.soldBarcodes || (sale.soldBarcodes || []),
            category: itemToReturn.category || "General",
            soldQuantity: itemToReturn.soldQuantity,
            alreadyReturnedQuantity: itemToReturn.alreadyReturnedQuantity || 0,
            availableReturnQuantity: itemToReturn.availableReturnQuantity,
            unitSellingPrice: Number(itemToReturn.originalSellingPrice || itemToReturn.unitSellingPrice || 0),
            unitPurchaseCost: Number(itemToReturn.originalCostPrice || itemToReturn.unitPurchaseCost || 0),
            returnQuantity: 1,
            isEligible: true,
            returnableQuantity: itemToReturn.availableReturnQuantity,
          };

          setSoldItemsList((prev) => {
            const exists = prev.some((p) => p.id === formatted.id);
            return exists ? prev : [formatted, ...prev];
          });

          handleAddToCart(formatted, code);
          playBeep("success");
          showToast(
            `✓ Scanned & added: ${formatted.productName} (Sale #${sale.saleNumber})`,
            "success"
          );
          return;
        }

        playBeep("error");
        showToast(`No returnable sold item found for scanned code "${code}".`, "error");
      } catch (err) {
        console.error("Barcode scan lookup error:", err);
        playBeep("error");
        showToast(
          err.response?.data?.message || `No sold item found for scanned code "${code}".`,
          "error"
        );
      } finally {
        setIsSearchingSales(false);
      }
    },
    [handleAddToCart, handleUpdateCartQty]
  );

  // High-Precision Hardware Barcode / QR Scanner State Machine
  const scannerState = useRef({
    buffer: "",
    firstKeyChar: null,
    firstKeyTime: 0,
    firstKeyTarget: null,
    firstKeyValueBefore: "",
    isScanning: false,
    reverted: false,
    timeoutId: null,
  });

  useEffect(() => {
    const RAPID_KEY_INTERVAL_MS = 55;
    const SCAN_TIMEOUT_MS = 85;
    const MIN_BARCODE_LENGTH = 3;

    const resetScannerState = () => {
      if (scannerState.current.timeoutId) {
        clearTimeout(scannerState.current.timeoutId);
      }
      scannerState.current = {
        buffer: "",
        firstKeyChar: null,
        firstKeyTime: 0,
        firstKeyTarget: null,
        firstKeyValueBefore: "",
        isScanning: false,
        reverted: false,
        timeoutId: null,
      };
    };

    const handleKeyDown = (e) => {
      // Ignore modifier keys
      if (
        e.key === "Shift" ||
        e.key === "Control" ||
        e.key === "Alt" ||
        e.key === "Meta" ||
        e.key === "CapsLock"
      ) {
        if (scannerState.current.isScanning) {
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      }

      // Handle scanner terminator (Enter or Tab)
      if (e.key === "Enter" || e.key === "Tab") {
        if (
          scannerState.current.isScanning ||
          scannerState.current.buffer.length >= MIN_BARCODE_LENGTH
        ) {
          e.preventDefault();
          e.stopPropagation();

          const code = scannerState.current.buffer.trim();
          resetScannerState();

          if (code.length >= MIN_BARCODE_LENGTH) {
            handleScanBarcode(code);
          }
          return;
        }
        return;
      }

      // Handle single printable characters
      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const now = Date.now();

        // If scanner burst is already confirmed active:
        if (scannerState.current.isScanning) {
          e.preventDefault();
          e.stopPropagation();

          scannerState.current.buffer += e.key;

          if (scannerState.current.timeoutId) {
            clearTimeout(scannerState.current.timeoutId);
          }
          scannerState.current.timeoutId = setTimeout(() => {
            if (
              scannerState.current.isScanning &&
              scannerState.current.buffer.length >= MIN_BARCODE_LENGTH
            ) {
              const code = scannerState.current.buffer.trim();
              resetScannerState();
              handleScanBarcode(code);
            } else {
              resetScannerState();
            }
          }, SCAN_TIMEOUT_MS);

          return;
        }

        // Check if rapid key arrived
        const timeSinceFirst = scannerState.current.firstKeyTime
          ? now - scannerState.current.firstKeyTime
          : 999999;
        const isRapid = timeSinceFirst <= RAPID_KEY_INTERVAL_MS;

        if (isRapid && scannerState.current.firstKeyChar) {
          // Hardware scanner detected!
          e.preventDefault();
          e.stopPropagation();

          scannerState.current.isScanning = true;
          scannerState.current.buffer += e.key;

          // Revert first character that leaked into focused input
          if (!scannerState.current.reverted) {
            scannerState.current.reverted = true;
            const target = scannerState.current.firstKeyTarget;
            const valBefore = scannerState.current.firstKeyValueBefore;

            if (target) {
              target.value = valBefore;
              if (target === searchInputRef.current) {
                setSearchQuery(valBefore);
              }
              target.blur();
            }
          }

          if (scannerState.current.timeoutId) {
            clearTimeout(scannerState.current.timeoutId);
          }
          scannerState.current.timeoutId = setTimeout(() => {
            if (
              scannerState.current.isScanning &&
              scannerState.current.buffer.length >= MIN_BARCODE_LENGTH
            ) {
              const code = scannerState.current.buffer.trim();
              resetScannerState();
              handleScanBarcode(code);
            } else {
              resetScannerState();
            }
          }, SCAN_TIMEOUT_MS);

          return;
        }

        // First character of potential burst
        scannerState.current.firstKeyChar = e.key;
        scannerState.current.firstKeyTime = now;
        scannerState.current.firstKeyTarget = e.target;
        scannerState.current.firstKeyValueBefore = e.target?.value || "";
        scannerState.current.buffer = e.key;
        scannerState.current.reverted = false;
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      if (scannerState.current.timeoutId) {
        clearTimeout(scannerState.current.timeoutId);
      }
    };
  }, [handleScanBarcode]);

  const handleSetCartQty = (itemId, rawValue) => {
    setReturnCart((prevCart) => {
      return prevCart.map((item) => {
        if (item.id !== itemId) return item;
        let qty = parseInt(rawValue, 10);
        if (isNaN(qty) || qty <= 0) qty = 1;
        if (qty > item.availableReturnQuantity) {
          qty = item.availableReturnQuantity;
        }

        const unitPrice = item.unitSellingPrice || 0;
        let nextRefund = item.actualRefundAmount;
        if (item.refundPreset === "full" || item.refundPreset == null) {
          nextRefund = Number((qty * unitPrice).toFixed(2));
        } else if (item.refundPreset === "10") {
          nextRefund = Number((qty * unitPrice * 0.9).toFixed(2));
        } else if (item.refundPreset === "20") {
          nextRefund = Number((qty * unitPrice * 0.8).toFixed(2));
        } else if (item.refundPreset === "25") {
          nextRefund = Number((qty * unitPrice * 0.75).toFixed(2));
        } else if (item.refundPreset === "custom") {
          nextRefund = item.actualRefundAmount;
        } else {
          const prevTotal = (item.returnQuantity || 1) * unitPrice;
          const ratio = prevTotal > 0 ? (item.actualRefundAmount || 0) / prevTotal : 1;
          nextRefund = Number((qty * unitPrice * ratio).toFixed(2));
        }

        let updatedBarcodes = Array.isArray(item.returnBarcodes) ? [...item.returnBarcodes] : [];
        if (qty > updatedBarcodes.length) {
          const needed = qty - updatedBarcodes.length;
          const remaining = (item.soldBarcodes || []).filter((b) => !updatedBarcodes.includes(b));
          updatedBarcodes = [...updatedBarcodes, ...remaining.slice(0, needed)];
          while (updatedBarcodes.length < qty && item.barcode && item.barcode !== "N/A") {
            updatedBarcodes.push(item.barcode);
          }
        } else if (qty < updatedBarcodes.length) {
          updatedBarcodes = updatedBarcodes.slice(0, qty);
        }

        return { ...item, returnQuantity: qty, actualRefundAmount: nextRefund, returnBarcodes: updatedBarcodes };
      });
    });
  };

  const handleUpdateItemRefundAmount = (itemId, rawValue) => {
    setReturnCart((prevCart) =>
      prevCart.map((item) => {
        if (item.id !== itemId) return item;
        const maxSold = Number(((item.returnQuantity || 1) * (item.unitSellingPrice || 0)).toFixed(2));
        if (rawValue === "" || rawValue == null) {
          return { ...item, actualRefundAmount: "", refundPreset: "custom" };
        }
        let parsed = parseFloat(rawValue);
        if (isNaN(parsed)) parsed = 0;
        if (parsed < 0) parsed = 0;
        if (parsed > maxSold) parsed = maxSold;
        return {
          ...item,
          actualRefundAmount: parsed,
          refundPreset: "custom",
        };
      })
    );
  };

  const handleApplyRefundPreset = (itemId, preset) => {
    setReturnCart((prevCart) =>
      prevCart.map((item) => {
        if (item.id !== itemId) return item;
        const maxSold = Number(((item.returnQuantity || 1) * (item.unitSellingPrice || 0)).toFixed(2));
        let newAmount = maxSold;
        if (preset === "10") {
          newAmount = Math.round(maxSold * 0.9);
        } else if (preset === "20") {
          newAmount = Math.round(maxSold * 0.8);
        } else if (preset === "25") {
          newAmount = Math.round(maxSold * 0.75);
        } else if (preset === "custom") {
          return { ...item, actualRefundAmount: "", refundPreset: "custom" };
        }
        return {
          ...item,
          actualRefundAmount: newAmount,
          refundPreset: preset,
        };
      })
    );
  };

  // -------------------------------------------------------------------------
  // Exchange / Replacement Stock Search & Cart Handlers
  // -------------------------------------------------------------------------
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        exchangeDropdownRef.current &&
        !exchangeDropdownRef.current.contains(e.target) &&
        exchangeSearchInputRef.current &&
        !exchangeSearchInputRef.current.contains(e.target)
      ) {
        setShowExchangeDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const searchExchangeStock = useCallback(async (term) => {
    const q = (term || "").trim();
    if (!q) {
      setExchangeSearchResults([]);
      setShowExchangeDropdown(false);
      return;
    }
    setIsSearchingExchangeStock(true);
    try {
      const qLower = q.toLowerCase();
      // Concurrently query /stock catalog and direct barcode lookup for fast IMEI match
      const [stockRes, barcodeRes] = await Promise.allSettled([
        api.get("/stock", {
          params: { search: q, limit: 20, stockStatus: "in_stock" },
        }),
        api.get(`/stock/barcode/${encodeURIComponent(q)}`),
      ]);

      const candidateProducts = [];
      if (stockRes.status === "fulfilled" && stockRes.value.data?.success) {
        candidateProducts.push(...(stockRes.value.data.data || []));
      }

      if (
        barcodeRes.status === "fulfilled" &&
        barcodeRes.value.data?.success &&
        barcodeRes.value.data?.data
      ) {
        const bcItem = barcodeRes.value.data.data;
        const alreadyInList = candidateProducts.some(
          (p) =>
            String(p._id) === String(bcItem.stockId) ||
            (Array.isArray(p.barcodes) && p.barcodes.includes(bcItem.barcode))
        );
        if (!alreadyInList) {
          candidateProducts.unshift({
            _id: bcItem.stockId || `bc_${bcItem.barcode}`,
            productName: bcItem.productName,
            barcode: bcItem.barcode,
            barcodes: [bcItem.barcode],
            serializedUnits: [{ barcode: bcItem.barcode, status: "available" }],
            quantity: bcItem.availableQuantity || 1,
            unitPrice: bcItem.sellingPrice || bcItem.unitPurchaseCost || 0,
            estimatedSalePricePerUnit:
              bcItem.estimatedSalePricePerUnit || bcItem.sellingPrice || 0,
          });
        }
      }

      // Flatten each serialized piece so IMEI search directly displays that exact piece
      const displayedPieces = [];
      const seenBarcodes = new Set();

      for (const stock of candidateProducts) {
        if (Number(stock.quantity || 0) <= 0) continue;

        const defaultPrice = Number(
          stock.estimatedSalePricePerUnit || stock.unitPrice || 0
        );
        const serializedUnits = Array.isArray(stock.serializedUnits)
          ? stock.serializedUnits
          : [];
        const availableUnits = serializedUnits.filter(
          (u) =>
            (u.status === "available" || !u.status) &&
            u.barcode &&
            u.barcode.toUpperCase() !== "N/A"
        );

        if (availableUnits.length > 0) {
          // If search query matches specific barcode(s), filter to matching barcode(s)
          const matchingUnits = availableUnits.filter((u) =>
            u.barcode.toLowerCase().includes(qLower)
          );
          const unitsToRender =
            matchingUnits.length > 0 ? matchingUnits : availableUnits;

          for (const u of unitsToRender) {
            const bcLower = u.barcode.toLowerCase();
            if (seenBarcodes.has(bcLower)) continue;
            seenBarcodes.add(bcLower);

            displayedPieces.push({
              ...stock,
              _id: `${stock._id}_${u.barcode}`,
              stockId: stock._id,
              productName: stock.productName,
              barcode: u.barcode,
              isSerialized: true,
              quantity: 1,
              availableQuantity: 1,
              unitPrice: defaultPrice,
            });
          }
        } else {
          // Non-serialized item (general accessories, bulk intake)
          displayedPieces.push({
            ...stock,
            stockId: stock._id,
            isSerialized: false,
            unitPrice: defaultPrice,
          });
        }
      }

      setExchangeSearchResults(displayedPieces);
      setShowExchangeDropdown(displayedPieces.length > 0);
    } catch (err) {
      console.error("Exchange stock search error:", err);
    } finally {
      setIsSearchingExchangeStock(false);
    }
  }, []);

  const handleExchangeSearchChange = (e) => {
    const val = e.target.value;
    setExchangeSearchQuery(val);
    if (exchangeSearchDebounceRef.current) {
      clearTimeout(exchangeSearchDebounceRef.current);
    }
    exchangeSearchDebounceRef.current = setTimeout(() => {
      searchExchangeStock(val);
    }, 200);
  };

  const handleAddExchangeItem = (stockItem) => {
    const defaultPrice = Number(
      stockItem.estimatedSalePricePerUnit || stockItem.unitPrice || 0
    );
    const targetBarcode =
      stockItem.barcode && stockItem.barcode !== "N/A"
        ? stockItem.barcode
        : null;
    const actualStockId = stockItem.stockId || stockItem._id;

    // Check if serialized unit already added to cart
    if (targetBarcode) {
      const alreadyInCart = exchangeCart.some(
        (it) =>
          it.barcode &&
          it.barcode.toLowerCase() === targetBarcode.toLowerCase()
      );
      if (alreadyInCart) {
        showToast(
          `IMEI "${targetBarcode}" is already in the replacement cart.`,
          "warning"
        );
        return;
      }
    }

    setExchangeCart((prev) => {
      // For non-serialized items, match by stockId
      if (!targetBarcode) {
        const existing = prev.find(
          (it) => String(it.stockId) === String(actualStockId) && !it.isSerialized
        );
        if (existing) {
          if (
            existing.quantity >=
            (stockItem.availableQuantity || stockItem.quantity || 1)
          ) {
            showToast(
              `Cannot add more. Only ${stockItem.quantity} pcs in stock.`,
              "error"
            );
            return prev;
          }
          return prev.map((it) =>
            it.id === existing.id ? { ...it, quantity: it.quantity + 1 } : it
          );
        }
      }

      return [
        ...prev,
        {
          id: `exc_${actualStockId}_${targetBarcode || Date.now()}`,
          stockId: actualStockId,
          productName: stockItem.productName,
          barcode: targetBarcode || "N/A",
          category: stockItem.category || "General",
          availableQuantity:
            stockItem.availableQuantity || stockItem.quantity || 1,
          defaultSellingPrice: defaultPrice,
          customSellingPrice: defaultPrice,
          quantity: 1,
          isSerialized: Boolean(targetBarcode),
        },
      ];
    });
    setExchangeSearchQuery("");
    setShowExchangeDropdown(false);
    showToast(
      `✓ Added replacement: ${stockItem.productName}${targetBarcode ? ` (${targetBarcode})` : ""
      }`
    );
  };

  const handleUpdateExchangeQty = (id, delta) => {
    setExchangeCart((prev) =>
      prev
        .map((it) => {
          if (it.id !== id) return it;
          const nextQty = it.quantity + delta;
          if (nextQty <= 0) return null;
          if (nextQty > it.availableQuantity) {
            showToast(`Max available in stock is ${it.availableQuantity} pcs.`, "warning");
            return it;
          }
          return { ...it, quantity: nextQty };
        })
        .filter(Boolean)
    );
  };

  const handleUpdateExchangePrice = (id, rawVal) => {
    setExchangeCart((prev) =>
      prev.map((it) => {
        if (it.id !== id) return it;
        if (rawVal === "" || rawVal == null) {
          return { ...it, customSellingPrice: "" };
        }
        const parsed = Math.max(0, parseFloat(rawVal) || 0);
        return { ...it, customSellingPrice: parsed };
      })
    );
  };

  const handleRemoveExchangeItem = (id) => {
    setExchangeCart((prev) => prev.filter((it) => it.id !== id));
  };

  const handleToggleRestoreInventory = (itemId) => {
    setReturnCart((prevCart) =>
      prevCart.map((item) => {
        if (item.id !== itemId) return item;
        return { ...item, restoreToInventory: item.restoreToInventory === false ? true : false };
      })
    );
  };

  const handleRemoveBarcodeFromItem = (itemId, barcodeToRemove) => {
    setReturnCart((prevCart) =>
      prevCart
        .map((item) => {
          if (item.id !== itemId) return item;
          const current = Array.isArray(item.returnBarcodes) ? item.returnBarcodes : [];
          const idx = current.indexOf(barcodeToRemove);
          if (idx === -1) {
            // If barcode not in array, decrease qty by 1
            const newQty = item.returnQuantity - 1;
            if (newQty <= 0) return null;
            return { ...item, returnQuantity: newQty };
          }

          const updated = [...current];
          updated.splice(idx, 1);
          const newQty = item.returnQuantity - 1;
          if (newQty <= 0) return null;

          return { ...item, returnQuantity: newQty, returnBarcodes: updated };
        })
        .filter(Boolean)
    );
  };

  const handleRemoveFromCart = (itemId) => {
    setReturnCart((prevCart) => prevCart.filter((item) => item.id !== itemId));
  };

  const handleClearCart = () => {
    setReturnCart([]);
  };

  // Financial calculations across all staged return items
  const totalOriginalSoldPrice = Number(
    returnCart
      .reduce((sum, it) => sum + (it.returnQuantity || 0) * (it.unitSellingPrice || 0), 0)
      .toFixed(2)
  );

  const totalRefundAmount = Number(
    returnCart
      .reduce((sum, it) => {
        const itemOriginal = (it.returnQuantity || 0) * (it.unitSellingPrice || 0);
        if (it.refundPreset === "custom" && (it.actualRefundAmount === "" || it.actualRefundAmount == null)) {
          return sum + 0;
        }
        const val = (it.actualRefundAmount !== "" && it.actualRefundAmount != null && !isNaN(Number(it.actualRefundAmount)))
          ? Math.max(0, Math.min(Number(it.actualRefundAmount), itemOriginal))
          : itemOriginal;
        return sum + val;
      }, 0)
      .toFixed(2)
  );

  const totalCostRefunded = Number(
    returnCart
      .reduce((sum, it) => sum + (it.returnQuantity || 0) * (it.unitPurchaseCost || 0), 0)
      .toFixed(2)
  );

  const totalRetainedProfit = Number(
    Math.max(0, totalOriginalSoldPrice - totalRefundAmount).toFixed(2)
  );

  const totalProfitReversed = Number(
    (totalRefundAmount - totalCostRefunded).toFixed(2)
  );

  const totalUnitsReturned = returnCart.reduce(
    (sum, it) => sum + (it.returnQuantity || 0),
    0
  );

  // New Replacement Items Total
  const exchangeCartTotal = Number(
    exchangeCart
      .reduce((sum, it) => {
        const p = (it.customSellingPrice !== "" && it.customSellingPrice != null && !isNaN(Number(it.customSellingPrice)))
          ? Number(it.customSellingPrice)
          : (it.defaultSellingPrice || 0);
        return sum + (it.quantity || 1) * p;
      }, 0)
      .toFixed(2)
  );

  const exchangeTotalUnits = exchangeCart.reduce((sum, it) => sum + (it.quantity || 1), 0);

  // Net Exchange Balance: Replacement Total minus Return Credit
  const exchangeNetDifference = Number((exchangeCartTotal - totalRefundAmount).toFixed(2));
  // If exchangeNetDifference > 0: Customer pays shop (customer owes)
  // If exchangeNetDifference < 0: Shop refunds customer (shop owes)
  // If exchangeNetDifference === 0: Even trade

  // =========================================================================
  // 3. SUBMIT RETURN TRANSACTION (SUPPORTS STANDARD REFUND & EXCHANGE)
  // =========================================================================
  const handleSubmitReturn = async () => {
    if (returnCart.length === 0) {
      showToast("Please add at least one item to refund.", "error");
      return;
    }

    // Custom refund empty validation
    for (const item of returnCart) {
      if (item.refundPreset === "custom" && (item.actualRefundAmount === "" || item.actualRefundAmount == null)) {
        Swal.fire({
          icon: "warning",
          title: "Enter Refund Amount",
          text: `Please enter the agreed refund value for "${item.productName}".`,
          confirmButtonColor: "#212529",
        });
        return;
      }
    }

    // If Exchange Mode is enabled, require at least one exchange item
    if (isExchangeMode) {
      if (exchangeCart.length === 0) {
        Swal.fire({
          icon: "warning",
          title: "Replacement Items Required",
          text: "Exchange mode is checked. Please search and select at least one replacement item from shop stock, or uncheck the exchange toggle.",
          confirmButtonColor: "#212529",
        });
        return;
      }
      for (const exc of exchangeCart) {
        if (exc.customSellingPrice === "" || exc.customSellingPrice == null || isNaN(Number(exc.customSellingPrice))) {
          Swal.fire({
            icon: "warning",
            title: "Item Price Required",
            text: `Please enter a valid selling price for "${exc.productName}".`,
            confirmButtonColor: "#212529",
          });
          return;
        }
      }
    }

    let confirmPromptText = "";
    if (isExchangeMode) {
      if (exchangeNetDifference > 0) {
        confirmPromptText = `Exchange transaction: Return Credit of Rs. ${totalRefundAmount.toLocaleString()} applied against Replacement Purchase of Rs. ${exchangeCartTotal.toLocaleString()}.\n\nCustomer pays shop: Rs. ${exchangeNetDifference.toLocaleString()}.`;
      } else if (exchangeNetDifference < 0) {
        confirmPromptText = `Exchange transaction: Return Credit of Rs. ${totalRefundAmount.toLocaleString()} exceeds Replacement Purchase of Rs. ${exchangeCartTotal.toLocaleString()}.\n\nShop refunds to customer: Rs. ${Math.abs(exchangeNetDifference).toLocaleString()}.`;
      } else {
        confirmPromptText = `Even Exchange: Return Credit matches Replacement Purchase exactly (Rs. ${totalRefundAmount.toLocaleString()}).\n\nNet cash movement: Rs. 0.`;
      }
    } else {
      confirmPromptText = `Do you want to process this refund for ${totalUnitsReturned} item(s) totaling Rs. ${totalRefundAmount.toLocaleString()}?`;
    }

    const confirmRes = await Swal.fire({
      title: isExchangeMode ? "Complete Exchange?" : "Complete Refund?",
      text: confirmPromptText,
      icon: "question",
      showCancelButton: true,
      confirmButtonColor: "#212529",
      cancelButtonColor: "#6c757d",
      confirmButtonText: isExchangeMode ? "Yes, Complete Exchange!" : "Yes, Complete Refund!",
      cancelButtonText: "Cancel",
      reverseButtons: true,
    });

    if (!confirmRes.isConfirmed) {
      return;
    }

    setIsSubmitting(true);
    try {
      // Group items in cart by saleId / saleNumber
      const salesMap = {};
      for (const item of returnCart) {
        const sid = item.saleId || item.saleNumber;
        if (!salesMap[sid]) {
          salesMap[sid] = {
            saleId: item.saleId,
            saleNumber: item.saleNumber,
            customerId: item.customerId,
            customerName: item.customerName,
            customerPhone: item.customerPhone,
            items: [],
          };
        }

        const itemOriginal = Number(((item.returnQuantity || 0) * (item.unitSellingPrice || 0)).toFixed(2));
        const itemActual = (item.actualRefundAmount !== "" && item.actualRefundAmount != null && !isNaN(Number(item.actualRefundAmount)))
          ? Math.max(0, Math.min(Number(Number(item.actualRefundAmount).toFixed(2)), itemOriginal))
          : (item.refundPreset === "custom" ? 0 : itemOriginal);
        const itemRetained = Math.max(0, Number((itemOriginal - itemActual).toFixed(2)));

        salesMap[sid].items.push({
          stockId: item.stockId,
          productName: item.productName,
          barcode: item.barcode,
          returnBarcodes: item.returnBarcodes || [],
          soldBarcodes: item.soldBarcodes || [],
          category: item.category || "General",
          returnQuantity: item.returnQuantity,
          unitPurchaseCost: item.unitPurchaseCost,
          unitSellingPrice: item.unitSellingPrice,
          originalSoldPrice: itemOriginal,
          actualRefundedAmount: itemActual,
          refundAmount: itemActual,
          retainedProfit: itemRetained,
          returnFee: itemRetained,
          restoreToInventory: item.restoreToInventory !== false,
          condition: "resellable",
          reason: returnReason,
          saleSource: item.saleSource,
          shopkeeperName: item.shopkeeperName,
          shopkeeperId: item.shopkeeperId,
          shopkeeperTransferId: item.shopkeeperTransferId,
        });
      }

      let lastReceipt = null;
      const groups = Object.values(salesMap);
      for (let gIdx = 0; gIdx < groups.length; gIdx++) {
        const group = groups[gIdx];
        const isPrimaryGroup = gIdx === 0;

        const payload = {
          saleId: group.saleId,
          saleNumber: group.saleNumber,
          customerId: group.customerId || null,
          customerName: group.customerName || undefined,
          customerPhone: group.customerPhone || "",
          settlementType: isExchangeMode ? "exchange" : "cash_payout",
          payoutMethod: isExchangeMode ? "Exchange" : cashPayoutMethod,
          reason: returnReason,
          notes: returnNotes,
          items: group.items,
        };

        if (isExchangeMode && isPrimaryGroup) {
          payload.exchangeItems = exchangeCart.map((exc) => ({
            stockId: exc.stockId,
            productName: exc.productName,
            barcode: exc.barcode,
            quantity: exc.quantity,
            sellingPrice: Number(
              exc.customSellingPrice !== "" && exc.customSellingPrice != null
                ? exc.customSellingPrice
                : (exc.defaultSellingPrice || 0)
            ),
          }));
          payload.exchangePaymentMethod = "Cash";
        }

        const res = await api.post("/returns", payload);
        if (!res.data?.success) {
          throw new Error(res.data?.message || "Failed to process return.");
        }
        const returnRec = res.data.data?.returnRecord || {};
        const receiptData = res.data.data?.receipt || {};
        lastReceipt = {
          ...returnRec,
          ...receiptData,
          saleSource: receiptData.saleSource || returnRec.saleSource || (group.items.some((i) => i.saleSource === "shopkeeper") ? "shopkeeper" : undefined),
          shopkeeperName: receiptData.shopkeeperName || returnRec.shopkeeperName || group.items.find((i) => i.shopkeeperName)?.shopkeeperName,
          shopkeeperId: receiptData.shopkeeperId || returnRec.shopkeeperId || group.items.find((i) => i.shopkeeperId)?.shopkeeperId,
          items: (receiptData.items && receiptData.items.length > 0) ? receiptData.items : (returnRec.items || group.items),
        };
      }

      setCompletedReturnReceipt(lastReceipt);
      broadcastSync();
      setReturnCart([]);
      setExchangeCart([]);
      setIsExchangeMode(false);
      setReturnNotes("");

      // Refresh database sold items
      handleSearchSales(searchQuery);
    } catch (err) {
      console.error("Return submit error:", err);
      Swal.fire({
        icon: "error",
        title: isExchangeMode ? "Exchange Failed" : "Refund Failed",
        text: err.response?.data?.message || err.message || "Failed to process transaction.",
        confirmButtonColor: "#212529",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePrintReceipt = () => {
    window.print();
  };

  return (
    <div className="container-fluid py-3 px-3 px-md-4">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`alert ${toastMessage.type === "error" ? "alert-danger" : "alert-success"
            } alert-dismissible fade show position-fixed top-0 end-0 m-3 shadow-lg z-3`}
          style={{ minWidth: "300px" }}
          role="alert"
        >
          <div className="d-flex align-items-center gap-2">
            {toastMessage.type === "error" ? (
              <FiAlertCircle className="text-danger flex-shrink-0" size={18} />
            ) : (
              <FiCheckCircle className="text-success flex-shrink-0" size={18} />
            )}
            <span className="small fw-semibold">{toastMessage.text}</span>
          </div>
          <button
            type="button"
            className="btn-close"
            onClick={() => setToastMessage(null)}
          />
        </div>
      )}

      {/* Top Header & Navigation Switcher */}
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center gap-3 mb-3 pb-2 border-bottom">
        <div>
          <div className="d-flex align-items-center gap-2">
            <div
              className="d-flex align-items-center justify-content-center bg-dark text-white rounded-2"
              style={{ width: "36px", height: "36px" }}
            >
              <FiRotateCcw size={18} />
            </div>
            <div>
              <h1 className="h5 mb-0 fw-bold text-dark">Stock Returns &amp; Customer Refunds</h1>
              <p className="text-muted small mb-0">
                Search sold items, refund multiple items, restore stock quantities, and adjust balances
              </p>
            </div>
          </div>
        </div>

      </div>

      {/* =========================================================================
          PROCESS RETURN WORKSTATION (PERMANENT STABLE DOM)
          ========================================================================= */}
      <div>
        {/* Universal Search Bar (Always fixed at the top, never moves or disappears) */}
        <div className="card border shadow-sm rounded-3 mb-3 bg-white">
          <div className="card-body p-3">
            <div className="input-group">
              <span className="input-group-text bg-white border-end-0 text-muted">
                <FiSearch size={18} />
              </span>
              <input
                ref={searchInputRef}
                type="text"
                className="form-control border-start-0 ps-0"
                placeholder="Search sold items by Product Name, IEMI, Sale ID, or Customer..."
                value={searchQuery}
                onChange={handleSearchInputChange}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const term = searchQuery.trim();
                    if (term) {
                      handleScanBarcode(term);
                    }
                  }
                }}
                autoComplete="off"
              />
              {searchQuery && (
                <button
                  type="button"
                  className="btn btn-outline-secondary border-start-0 border-end-0"
                  onClick={() => {
                    setSearchQuery("");
                    handleSearchSales("", null, null, null);
                  }}
                >
                  <FiX size={15} />
                </button>
              )}
              <button
                type="button"
                className="btn btn-dark px-4 fw-semibold d-flex align-items-center gap-2"
                onClick={() => handleSearchSales(searchQuery, null, null, null)}
                disabled={isSearchingSales}
              >
                {isSearchingSales ? (
                  <>
                    <span className="spinner-border spinner-border-sm" role="status" />
                    Searching...
                  </>
                ) : (
                  <>
                    <FiSearch size={15} /> Find
                  </>
                )}
              </button>
            </div>

            {/* Date Filter Bar: Today's Sale, Yesterday, Custom, All Sales */}
            <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mt-3 pt-2 border-top">
              <div className="d-flex align-items-center gap-2 flex-wrap">
                <span className="text-secondary small fw-semibold d-flex align-items-center gap-1" style={{ fontSize: "0.75rem" }}>
                  <FiClock size={13} />
                  <span>Filter Sales:</span>
                </span>
                <span
                  className="badge bg-light text-secondary border d-inline-flex align-items-center gap-1 px-2 py-1"
                  style={{ fontSize: "0.72rem" }}
                  title="Hardware barcode/QR scanner is actively listening on this page"
                >
                  <FiZap size={11} className="text-warning" />
                  <span>Scan IEMI / QR to Refund</span>
                </span>
                {[
                  { label: "Today's Sale", val: "today" },
                  { label: "Yesterday", val: "yesterday" },
                  { label: "Custom", val: "custom" },
                  { label: "All Sales", val: "all" },
                ].map((btn) => (
                  <button
                    key={btn.val}
                    type="button"
                    className={`btn btn-sm py-1 px-3 rounded-pill fw-medium ${dateFilter === btn.val
                      ? "btn-dark text-white shadow-sm"
                      : "btn-outline-secondary bg-white text-secondary"
                      }`}
                    style={{ fontSize: "0.74rem" }}
                    onClick={() => handleSelectDateFilter(btn.val)}
                  >
                    {btn.label}
                  </button>
                ))}
              </div>

              {/* Custom Date Pickers (Smooth expand and collapse animation) */}
              <div
                style={{
                  display: "grid",
                  gridTemplateRows: dateFilter === "custom" ? "1fr" : "0fr",
                  opacity: dateFilter === "custom" ? 1 : 0,
                  transition: "grid-template-rows 0.32s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s ease",
                  pointerEvents: dateFilter === "custom" ? "auto" : "none",
                }}
              >
                <div style={{ overflow: "hidden" }}>
                  <div className="d-flex align-items-center gap-2 flex-wrap bg-light px-2 py-1 rounded-2 border mt-1">
                    <div className="d-flex align-items-center gap-1">
                      <span className="text-secondary small fw-medium" style={{ fontSize: "0.72rem" }}>From:</span>
                      <input
                        type="date"
                        className="form-control form-control-sm py-0 px-2 bg-white"
                        style={{ fontSize: "0.74rem", height: "26px", width: "130px" }}
                        value={customStartDate}
                        onChange={(e) => handleCustomStartDateChange(e.target.value)}
                      />
                    </div>
                    <div className="d-flex align-items-center gap-1">
                      <span className="text-secondary small fw-medium" style={{ fontSize: "0.72rem" }}>To:</span>
                      <input
                        type="date"
                        className="form-control form-control-sm py-0 px-2 bg-white"
                        style={{ fontSize: "0.74rem", height: "26px", width: "130px" }}
                        value={customEndDate}
                        onChange={(e) => handleCustomEndDateChange(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {searchError && (
              <div className="alert alert-warning py-2 px-3 mt-3 mb-0 small d-flex align-items-center justify-content-between gap-2 rounded-2">
                <div className="d-flex align-items-center gap-2">
                  <FiAlertTriangle className="flex-shrink-0" size={15} />
                  <span>{searchError}</span>
                </div>
                {dateFilter !== "all" && (
                  <button
                    type="button"
                    className="btn btn-sm btn-link text-dark p-0 text-decoration-none fw-semibold small"
                    onClick={() => handleSelectDateFilter("all")}
                  >
                    View All Sales
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 2-Column Workstation: Left (Sold Items) | Right (Return Cart & Refund Settlement - only shown when items selected) */}
        <div className="row g-3 align-items-start">
          {/* ========================================================
                COLUMN 1 (Left): Sold Items Catalog
               ======================================================== */}
          <div className="col-12 col-lg-7">
            <div className="card border shadow-sm rounded-3 bg-white">
              <div className="card-header bg-white border-bottom py-2 px-3 d-flex justify-content-between align-items-center">
                <div className="d-flex align-items-center gap-2">
                  <FiPackage className="text-dark" size={16} />
                  <span className="fw-bold small text-dark">Returnable Sold Items</span>
                </div>
                <span className="badge bg-light text-secondary border small">
                  {soldItemsList.filter((it) => it.returnableQuantity > 0).length} returnable item(s) found
                </span>
              </div>

              <div className="card-body p-0" style={{ maxHeight: "calc(100vh - 240px)", overflowY: "auto" }}>
                {isSearchingSales ? (
                  <div className="text-center py-5">
                    <span className="spinner-border spinner-border-sm text-secondary me-2" role="status" />
                    <span className="text-muted small">Loading sold items from database...</span>
                  </div>
                ) : soldItemsList.filter((it) => it.returnableQuantity > 0).length === 0 ? (
                  <div className="text-center py-5 text-muted small p-4">
                    <FiCheckCircle size={36} className="text-success opacity-75 mb-2" />
                    <p className="mb-1 fw-semibold text-dark">No pending returnable items</p>
                    <p className="mb-2 text-muted">
                      All items are in stock or have already been refunded. Past returns can be viewed in the audit trail.
                    </p>
                    <Link
                      to="/history"
                      state={{ defaultType: "return" }}
                      className="btn btn-sm btn-outline-dark d-inline-flex align-items-center gap-1"
                    >
                      <FiFileText size={13} /> View Return Audit Trail
                    </Link>
                  </div>
                ) : (
                  <div className="list-group list-group-flush">
                    {soldItemsList
                      .filter((item) => item.returnableQuantity > 0)
                      .map((item) => {
                        const inCart = returnCart.find(
                          (c) => c.id === item.id || (c.saleId === item.saleId && c.stockId === item.stockId)
                        );

                        return (
                          <div
                            key={item.id}
                            className={`list-group-item p-3 transition-all ${inCart ? "bg-light bg-opacity-75" : ""
                              }`}
                            style={{
                              borderLeft: inCart ? "3px solid #198754" : "3px solid transparent",
                            }}
                          >
                            <div className="d-flex align-items-center justify-content-between gap-3">
                              {/* Left: Product Name, Details & Quantities */}
                              <div className="flex-grow-1 min-w-0">
                                {/* Title, Category & Status Badges */}
                                <div className="d-flex align-items-center gap-2 mb-1 flex-wrap">
                                  <span className="fw-bold text-dark fs-6 text-truncate" style={{ maxWidth: "240px" }}>
                                    {item.productName}
                                  </span>
                                  {item.saleSource === "shopkeeper" && (
                                    <span
                                      className="badge py-1 px-2 d-inline-flex align-items-center gap-1"
                                      style={{
                                        backgroundColor: "#f5f3ff",
                                        color: "#6d28d9",
                                        border: "1px solid #ddd6fe",
                                        fontSize: "0.68rem",
                                        fontWeight: "600",
                                        letterSpacing: "0.01em",
                                      }}
                                      title={item.shopkeeperName ? `Consignment from ${item.shopkeeperName}` : "Consignment stock sale"}
                                    >
                                      <FiUsers size={11} />
                                      Other Shopkeeper Sale{item.shopkeeperName ? ` (${item.shopkeeperName})` : ""}
                                    </span>
                                  )}

                                  {inCart && (
                                    <span
                                      className="badge bg-success-subtle text-success border border-success-subtle py-1 px-2"
                                      style={{ fontSize: "0.68rem" }}
                                    >
                                      In Cart (x{inCart.returnQuantity})
                                    </span>
                                  )}
                                </div>

                                {/* Invoice, Date & Customer (Guaranteed no-wrap on invoice number) */}
                                <div className="text-muted d-flex align-items-center gap-2 mb-2 flex-wrap" style={{ fontSize: "0.74rem" }}>
                                  <span>Inv: <strong className="text-dark">#{item.saleNumber}</strong></span>
                                  {item.saleDate && (
                                    <>
                                      <span>&bull;</span>
                                      <span>{new Date(item.saleDate).toLocaleDateString()}</span>
                                    </>
                                  )}
                                  {item.customerName && (
                                    <>
                                      <span>&bull;</span>
                                      <span>{item.customerName}</span>
                                    </>
                                  )}
                                </div>

                                {/* Quantities / Returnable status tags */}
                                <div className="d-flex align-items-center gap-2 flex-wrap">
                                  <span
                                    className="badge bg-light text-dark border fw-normal py-1 px-2"
                                    style={{ fontSize: "0.72rem" }}
                                  >
                                    Sold: <strong className="fw-semibold">{item.soldQuantity} pcs</strong>
                                  </span>
                                  <span
                                    className="badge bg-success-subtle text-success border border-success-subtle fw-medium py-1 px-2"
                                    style={{ fontSize: "0.72rem" }}
                                  >
                                    Available to Return: <strong className="fw-bold">{item.returnableQuantity} pcs</strong>
                                  </span>
                                </div>
                              </div>

                              {/* Right: Price & Button */}
                              <div className="text-end flex-shrink-0 d-flex flex-column align-items-end justify-content-center">
                                <div className="fw-bold text-dark fs-6 mb-1 text-nowrap">
                                  Rs. {Number(item.unitSellingPrice || 0).toLocaleString()}
                                </div>
                                <button
                                  type="button"
                                  className={`btn btn-sm px-3 rounded-2 fw-semibold d-inline-flex align-items-center gap-1 shadow-sm ${inCart ? "btn-outline-dark" : "btn-dark"
                                    }`}
                                  style={{ fontSize: "0.75rem", whiteSpace: "nowrap" }}
                                  onClick={() => handleAddToCart(item)}
                                >
                                  <FiPlus size={13} />
                                  <span>{inCart ? "Add More" : "Add to Refund"}</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ========================================================
                COLUMN 2 (Right): Return Cart & Settlement (Permanently visible)
               ======================================================== */}
          <div className="col-12 col-lg-5">
            <div
              className="card border shadow-sm rounded-3 bg-white"
              style={{
                maxHeight: "calc(100vh - 90px)",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div className="card-header bg-white border-bottom py-2.5 px-3 d-flex justify-content-between align-items-center flex-shrink-0">
                <div className="d-flex align-items-center gap-2 flex-wrap">
                  <FiRotateCcw className="text-danger" size={16} />
                  <span className="fw-bold small text-dark">Items to Refund / Exchange</span>
                  {lastScannedBarcode && (
                    <span
                      className="badge bg-success-subtle text-success border font-monospace px-2 py-0"
                      style={{ fontSize: "0.68rem" }}
                      title="Last scanned barcode or QR code"
                    >
                      <FiZap size={10} className="me-1" />
                      {lastScannedBarcode}
                    </span>
                  )}
                </div>
                <div className="d-flex align-items-center gap-2">
                  <span className="badge bg-dark text-white small">
                    {returnCart.length} item(s)
                  </span>
                  {returnCart.length > 0 && (
                    <button
                      type="button"
                      className="btn btn-sm btn-link text-danger p-0 text-decoration-none small"
                      onClick={handleClearCart}
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* Exchange with New Purchase / Replacement Toggle */}
              <div className="px-3 py-2 bg-light border-bottom d-flex align-items-center justify-content-between flex-shrink-0">
                <div className="form-check form-switch mb-0 d-flex align-items-center">
                  <input
                    className="form-check-input cursor-pointer"
                    type="checkbox"
                    role="switch"
                    id="exchangeModeSwitch"
                    style={{ width: "2.4em", height: "1.25em", cursor: "pointer" }}
                    checked={isExchangeMode}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setIsExchangeMode(checked);
                      if (!checked) {
                        setExchangeCart([]);
                        setExchangeSearchQuery("");
                        setShowExchangeDropdown(false);
                      }
                    }}
                  />
                  <label
                    className="form-check-label fw-bold small text-dark ms-2 cursor-pointer user-select-none d-flex align-items-center gap-1.5"
                    htmlFor="exchangeModeSwitch"
                  >
                    <FiRefreshCw size={13} className={isExchangeMode ? "text-primary" : "text-muted"} />
                    <span>Exchange with New Purchase / Add Replacement Items</span>
                  </label>
                </div>
                {isExchangeMode && (
                  <span className="badge bg-primary text-white py-0.5 px-2 font-monospace" style={{ fontSize: "0.68rem" }}>
                    {exchangeCart.length} item{exchangeCart.length === 1 ? "" : "s"}
                  </span>
                )}
              </div>

              <div
                className="card-body p-3 overflow-auto"
                style={{
                  flex: 1,
                  paddingBottom: "2.5rem",
                }}
              >
                {/* Cart Items List */}
                {returnCart.length === 0 ? (
                  <div className="text-center py-4 text-muted border-bottom mb-3">
                    <FiRotateCcw size={26} className="opacity-40 mb-2 text-secondary" />
                    <p className="small mb-1 fw-semibold text-dark">No Items in Refund Cart</p>
                    <p className="small text-muted mb-0" style={{ fontSize: "0.74rem" }}>
                      Scan item barcode / QR code or click <strong>"+ Add to Refund"</strong> to begin.
                    </p>
                  </div>
                ) : (
                  <div className="d-flex flex-column gap-2 mb-3">
                    {returnCart.map((item) => {
                      const itemSubtotal = item.returnQuantity * item.unitSellingPrice;
                      const isAtMax = item.returnQuantity >= item.availableReturnQuantity;
                      const itemOriginalSold = Number(((item.returnQuantity || 1) * (item.unitSellingPrice || 0)).toFixed(2));
                      const currentRefund = item.actualRefundAmount !== "" && item.actualRefundAmount != null
                        ? Number(item.actualRefundAmount)
                        : (item.refundPreset === "custom" ? 0 : itemOriginalSold);
                      const itemRetained = Math.max(0, Number((itemOriginalSold - currentRefund).toFixed(2)));
                      const deductionPercent = itemOriginalSold > 0 ? Math.round((itemRetained / itemOriginalSold) * 100) : 0;
                      const currentPreset = item.refundPreset || "full";

                      const activeBarcodes = (Array.isArray(item.returnBarcodes) && item.returnBarcodes.length > 0)
                        ? item.returnBarcodes
                        : (Array.isArray(item.soldBarcodes) && item.soldBarcodes.length > 0)
                          ? item.soldBarcodes.slice(0, item.returnQuantity)
                          : (item.barcode && item.barcode !== "N/A"
                            ? Array(item.returnQuantity).fill(item.barcode)
                            : []);

                      const unselectedBarcodes = (Array.isArray(item.soldBarcodes) ? item.soldBarcodes : []).filter(
                        (bc) => !activeBarcodes.includes(bc)
                      );

                      return (
                        <div
                          key={item.id}
                          className="rounded-3 shadow-xs mb-2"
                          style={{
                            border: "1.5px solid #fca5a5",
                            backgroundColor: "#fff8f8",
                            borderRadius: "10px",
                            padding: "12px 14px",
                          }}
                        >
                          {/* Section Tag Banner */}
                          <div className="d-flex align-items-center justify-content-between">
                            <div className="d-flex align-items-center gap-1.5 flex-wrap">
                              <span
                                className="badge bg-danger text-white d-inline-flex align-items-center gap-1 py-1 px-2 fw-bold text-uppercase shadow-xs"
                                style={{ fontSize: "0.68rem", letterSpacing: "0.4px" }}
                              >
                                <FiRotateCcw size={11} />
                                <span>1. Return Item (Credit)</span>
                              </span>
                              {item.saleSource === "shopkeeper" && (
                                <span
                                  className="badge py-0.5 px-1.5 d-inline-flex align-items-center gap-1"
                                  style={{
                                    backgroundColor: "#f5f3ff",
                                    color: "#6d28d9",
                                    border: "1px solid #ddd6fe",
                                    fontSize: "0.64rem",
                                    fontWeight: "600",
                                  }}
                                >
                                  <FiUsers size={10} />
                                  Consignment{item.shopkeeperName ? ` (${item.shopkeeperName})` : ""}
                                </span>
                              )}
                            </div>
                            <div className="d-flex align-items-center gap-2">
                              <span className="text-muted font-monospace" style={{ fontSize: "0.68rem" }}>
                                #{item.saleNumber}
                              </span>
                              <button
                                type="button"
                                className="btn btn-sm btn-link text-danger p-0 ms-1 d-inline-flex align-items-center"
                                onClick={() => handleRemoveFromCart(item.id)}
                                title="Remove item"
                              >
                                <FiTrash2 size={14} />
                              </button>
                            </div>
                          </div>

                          {/* Red Divider Line with clear margin from top and bottom */}
                          <div
                            className="border-bottom border-danger-subtle"
                            style={{
                              marginTop: "14px",
                              marginBottom: "12px",
                            }}
                          />

                          {/* Product Name & Pricing Header */}
                          <div className="d-flex justify-content-between align-items-start mb-2">
                            <div>
                              <h6 className="fw-bolder text-dark mb-0 fs-6">{item.productName}</h6>
                              <div className="text-muted d-flex align-items-center gap-1 flex-wrap mt-0.5" style={{ fontSize: "0.72rem" }}>
                                <span>Original Sold Price:</span>
                                <strong className="text-dark">Rs. {itemOriginalSold.toLocaleString()}</strong>
                                <span>({formatUnit(item.unitSellingPrice)} each)</span>
                              </div>
                            </div>
                            <div className="text-end">
                              <div className="small text-muted" style={{ fontSize: "0.68rem" }}>Refund Value</div>
                              <div className="fw-bold text-dark fs-6 font-monospace">
                                Rs. {currentRefund.toLocaleString()}
                              </div>
                            </div>
                          </div>

                          {/* IMEIs: Only show if there are actual serialized barcodes */}
                          {(activeBarcodes.length > 0 || unselectedBarcodes.length > 0) && (
                            <div className="my-2 p-2 bg-light rounded-2 border">
                              <div className="d-flex align-items-center justify-content-between mb-1">
                                <span className="fw-bold text-dark d-flex align-items-center gap-1" style={{ fontSize: "0.70rem" }}>
                                  <FiTag size={11} className="text-danger" />
                                  <span>Serialized IMEIs ({activeBarcodes.length}):</span>
                                </span>
                              </div>

                              {activeBarcodes.length > 0 && (
                                <div className="d-flex flex-wrap gap-1">
                                  {activeBarcodes.map((bc, bIdx) => (
                                    <span
                                      key={`${bc}-${bIdx}`}
                                      className="badge bg-white text-dark border border-secondary-subtle font-monospace py-0.5 px-1.5 d-inline-flex align-items-center gap-1 shadow-xs"
                                      style={{ fontSize: "0.70rem" }}
                                    >
                                      <FiTag size={9} className="text-danger" />
                                      <strong className="text-dark">{bc}</strong>
                                      {item.returnQuantity > 1 && (
                                        <button
                                          type="button"
                                          className="btn btn-link text-danger p-0 ms-1 border-0 text-decoration-none"
                                          style={{ fontSize: "0.80rem", lineHeight: 1 }}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleRemoveBarcodeFromItem(item.id, bc);
                                          }}
                                          title={`Remove IMEI ${bc}`}
                                        >
                                          &times;
                                        </button>
                                      )}
                                    </span>
                                  ))}
                                </div>
                              )}

                              {unselectedBarcodes.length > 0 && item.returnQuantity < item.availableReturnQuantity && (
                                <div className="mt-1.5 pt-1 border-top border-light-subtle">
                                  <span className="text-muted d-block mb-1" style={{ fontSize: "0.64rem" }}>
                                    Click to add sold IMEI:
                                  </span>
                                  <div className="d-flex flex-wrap gap-1">
                                    {unselectedBarcodes.map((bc, uIdx) => (
                                      <button
                                        key={`${bc}-${uIdx}`}
                                        type="button"
                                        className="btn btn-sm btn-outline-secondary py-0 px-2 font-monospace rounded-pill d-inline-flex align-items-center gap-1"
                                        style={{ fontSize: "0.65rem", height: "18px" }}
                                        onClick={() => handleAddToCart(item, bc)}
                                      >
                                        <FiPlus size={8} />
                                        <span>{bc}</span>
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Quantity Stepper */}
                          <div className="d-flex align-items-center justify-content-between py-2 border-top">
                            <span className="text-secondary fw-semibold" style={{ fontSize: "0.73rem" }}>
                              Return Qty (Max {item.availableReturnQuantity}):
                            </span>
                            <div className="input-group input-group-sm" style={{ width: "110px" }}>
                              <button
                                type="button"
                                className="btn btn-outline-secondary px-2"
                                onClick={() => handleUpdateCartQty(item.id, -1)}
                              >
                                <FiMinus size={11} />
                              </button>
                              <input
                                type="number"
                                className="form-control text-center p-0 fw-bold bg-white"
                                value={item.returnQuantity}
                                min="1"
                                max={item.availableReturnQuantity}
                                onChange={(e) => handleSetCartQty(item.id, e.target.value)}
                              />
                              <button
                                type="button"
                                className="btn btn-outline-secondary px-2"
                                disabled={isAtMax}
                                onClick={() => handleUpdateCartQty(item.id, 1)}
                              >
                                <FiPlus size={11} />
                              </button>
                            </div>
                          </div>

                          {/* Agreed Refund Value Control */}
                          <div className="pt-2 border-top">
                            <div className="d-flex justify-content-between align-items-center mb-1">
                              <label className="form-label mb-0 small fw-bold text-dark d-flex align-items-center gap-1" style={{ fontSize: "0.73rem" }}>
                                <FiDollarSign size={13} className="text-success" />
                                <span>Agreed Refund Value (Rs.):</span>
                              </label>
                              {itemRetained > 0 && (
                                <span className="badge bg-success-subtle text-success border border-success-subtle py-0.5 px-1.5 fw-semibold" style={{ fontSize: "0.66rem" }}>
                                  Shop Keeps: +Rs. {itemRetained.toLocaleString()}
                                </span>
                              )}
                            </div>

                            <div className="input-group input-group-sm mb-1.5">
                              <span className="input-group-text bg-light fw-bold text-secondary border-end-0" style={{ fontSize: "0.75rem" }}>
                                Rs.
                              </span>
                              <input
                                type="number"
                                className="form-control fw-bold text-dark border-start-0 ps-1"
                                style={{ fontSize: "0.85rem" }}
                                placeholder="Enter refund value"
                                min="0"
                                max={itemOriginalSold}
                                value={item.actualRefundAmount !== undefined ? item.actualRefundAmount : itemOriginalSold}
                                onChange={(e) => handleUpdateItemRefundAmount(item.id, e.target.value)}
                              />
                            </div>

                            {/* Preset Chips */}
                            <div className="d-flex align-items-center gap-1 flex-wrap">
                              <span className="text-secondary small me-1" style={{ fontSize: "0.68rem" }}>Presets:</span>
                              {[
                                { id: "full", label: "Full Refund" },
                                { id: "10", label: "-10%" },
                                { id: "20", label: "-20%" },
                                { id: "25", label: "-25%" },
                                { id: "custom", label: "Custom" },
                              ].map((chip) => {
                                const isSelected = currentPreset === chip.id;
                                return (
                                  <button
                                    key={chip.id}
                                    type="button"
                                    className={`btn btn-sm py-0 px-2 rounded-pill fw-semibold ${isSelected
                                      ? "btn-dark text-white shadow-xs"
                                      : "btn-outline-secondary bg-white text-secondary"
                                      }`}
                                    style={{ fontSize: "0.68rem", height: "22px", lineHeight: "20px" }}
                                    onClick={() => handleApplyRefundPreset(item.id, chip.id)}
                                  >
                                    {chip.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* ========================================================
                      EXCHANGE / NEW PURCHASE SECTION (When Exchange is Toggled)
                     ======================================================== */}
                {isExchangeMode && (
                  <div className="mb-3 pt-3 border-top">
                    {/* Section Tag Banner */}
                    <div className="d-flex align-items-center justify-content-between mb-2">
                      <span
                        className="badge bg-primary text-white d-inline-flex align-items-center gap-1.5 py-1 px-2.5 fw-bold text-uppercase shadow-xs"
                        style={{ fontSize: "0.68rem", letterSpacing: "0.4px" }}
                      >
                        <FiPackage size={11} />
                        <span>2. Replacement Purchase (Shop Stock)</span>
                      </span>
                      <span className="badge bg-primary-subtle text-primary border border-primary-subtle py-0.5 px-2 font-monospace fw-bold" style={{ fontSize: "0.68rem" }}>
                        {exchangeCart.length} selected
                      </span>
                    </div>

                    {/* Stock Search / Barcode Scan Input with Dropdown */}
                    <div className="position-relative mb-2">
                      <div className="input-group input-group-sm">
                        <span className="input-group-text bg-white border-end-0 text-muted">
                          {isSearchingExchangeStock ? (
                            <span className="spinner-border spinner-border-sm text-primary" role="status" style={{ width: "12px", height: "12px" }} />
                          ) : (
                            <FiSearch size={13} />
                          )}
                        </span>
                        <input
                          ref={exchangeSearchInputRef}
                          type="text"
                          className="form-control border-start-0 border-end-0 ps-1"
                          placeholder="Scan IMEI / Barcode or Search Shop Stock..."
                          value={exchangeSearchQuery}
                          onChange={handleExchangeSearchChange}
                          onFocus={() => {
                            if (exchangeSearchResults.length > 0) setShowExchangeDropdown(true);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              if (exchangeSearchResults.length === 1) {
                                handleAddExchangeItem(exchangeSearchResults[0]);
                              } else if (exchangeSearchQuery.trim()) {
                                searchExchangeStock(exchangeSearchQuery.trim());
                              }
                            }
                          }}
                          style={{ fontSize: "0.78rem" }}
                        />
                        {exchangeSearchQuery && (
                          <button
                            type="button"
                            className="btn btn-outline-secondary border-start-0"
                            onClick={() => {
                              setExchangeSearchQuery("");
                              setShowExchangeDropdown(false);
                            }}
                          >
                            <FiX size={12} />
                          </button>
                        )}
                      </div>

                      {/* Floating Autocomplete Dropdown */}
                      {showExchangeDropdown && exchangeSearchResults.length > 0 && (
                        <div
                          ref={exchangeDropdownRef}
                          className="position-absolute w-100 bg-white border shadow-lg rounded-2 mt-1 overflow-auto"
                          style={{ maxHeight: "260px", zIndex: 1050 }}
                        >
                          <div className="py-1 px-2.5 bg-light border-bottom text-muted fw-semibold d-flex justify-content-between align-items-center" style={{ fontSize: "0.68rem" }}>
                            <span>Available Inventory ({exchangeSearchResults.length} {exchangeSearchResults.length === 1 ? "piece" : "pieces"} found)</span>
                            <span className="text-secondary">Click + Add to select</span>
                          </div>
                          {exchangeSearchResults.map((stock) => {
                            const price = Number(stock.estimatedSalePricePerUnit || stock.unitPrice || 0);
                            const isAlreadyAdded = stock.barcode && stock.barcode !== "N/A" && exchangeCart.some(
                              (it) => it.barcode && it.barcode.toLowerCase() === stock.barcode.toLowerCase()
                            );

                            return (
                              <div
                                key={stock._id}
                                className={`p-2 border-bottom d-flex align-items-center justify-content-between ${isAlreadyAdded ? "bg-light opacity-60" : "cursor-pointer"
                                  }`}
                                style={{ transition: "background 0.15s ease", cursor: isAlreadyAdded ? "not-allowed" : "pointer" }}
                                onClick={() => {
                                  if (!isAlreadyAdded) handleAddExchangeItem(stock);
                                }}
                              >
                                <div className="me-2 text-truncate">
                                  <div className="fw-bold text-dark small text-truncate">
                                    {stock.productName}
                                  </div>
                                  <div className="d-flex align-items-center gap-1.5 flex-wrap text-muted mt-0.5" style={{ fontSize: "0.68rem" }}>
                                    {stock.barcode && stock.barcode !== "N/A" ? (
                                      <span className="font-monospace text-dark bg-light px-1.5 py-0.5 rounded border fw-semibold">
                                        IEMI: {stock.barcode}
                                      </span>
                                    ) : (
                                      <span className="text-muted">No IMEI (Bulk)</span>
                                    )}
                                    <span className="badge bg-success-subtle text-success border border-success-subtle px-1.5 py-0.5">
                                      {stock.isSerialized ? "1 piece" : `${stock.quantity} in stock`}
                                    </span>
                                  </div>
                                </div>
                                <div className="text-end flex-shrink-0">
                                  <div className="fw-bold text-dark small font-monospace">
                                    Rs. {price.toLocaleString()}
                                  </div>
                                  {isAlreadyAdded ? (
                                    <span className="badge bg-secondary-subtle text-secondary border px-2 py-0.5 mt-0.5" style={{ fontSize: "0.66rem" }}>
                                      In Cart
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      className="btn btn-sm btn-outline-primary py-0 px-2 fw-semibold mt-0.5"
                                      style={{ fontSize: "0.68rem" }}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleAddExchangeItem(stock);
                                      }}
                                    >
                                      + Add
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Exchange Items Cart List */}
                    {exchangeCart.length === 0 ? (
                      <div className="p-3 text-center border rounded-2 bg-light mb-2">
                        <FiPackage size={22} className="text-muted opacity-50 mb-1" />
                        <div className="small text-muted" style={{ fontSize: "0.74rem" }}>
                          Search stock above to add replacement items to exchange.
                        </div>
                      </div>
                    ) : (
                      <div className="d-flex flex-column gap-2 mb-2">
                        {exchangeCart.map((exc) => {
                          const curPrice = exc.customSellingPrice !== "" && exc.customSellingPrice != null
                            ? Number(exc.customSellingPrice)
                            : Number(exc.defaultSellingPrice || 0);
                          const itemTotal = (exc.quantity || 1) * curPrice;

                          return (
                            <div
                              key={exc.id}
                              className="rounded-3 shadow-xs mb-2"
                              style={{
                                border: "1.5px solid #93c5fd",
                                backgroundColor: "#f0f7ff",
                                borderRadius: "10px",
                                padding: "12px 14px",
                              }}
                            >
                              <div className="d-flex justify-content-between align-items-start mb-2">
                                <div className="text-truncate me-2">
                                  <div className="d-flex align-items-center gap-1.5 flex-wrap">
                                    <span className="badge bg-primary-subtle text-primary border border-primary-subtle py-0.5 px-1.5 font-monospace" style={{ fontSize: "0.62rem" }}>
                                      NEW ITEM
                                    </span>
                                    <strong className="text-dark small">{exc.productName}</strong>
                                  </div>
                                  <div className="d-flex align-items-center gap-1.5 flex-wrap text-muted mt-1" style={{ fontSize: "0.68rem" }}>
                                    {exc.barcode && exc.barcode !== "N/A" && (
                                      <span className="font-monospace text-dark bg-white px-1.5 py-0.5 rounded border border-secondary-subtle">
                                        {exc.barcode}
                                      </span>
                                    )}
                                    <span className="text-secondary">
                                      Available: {exc.availableQuantity} pcs
                                    </span>
                                  </div>
                                </div>
                                <div className="d-flex align-items-center gap-1">
                                  <span className="fw-bolder text-dark small text-nowrap font-monospace">
                                    Rs. {itemTotal.toLocaleString()}
                                  </span>
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-link text-danger p-0 ms-1 d-inline-flex align-items-center"
                                    onClick={() => handleRemoveExchangeItem(exc.id)}
                                    title="Remove item"
                                  >
                                    <FiTrash2 size={13} />
                                  </button>
                                </div>
                              </div>

                              {/* Controls: Qty Stepper & Custom Selling Price */}
                              <div className="d-flex align-items-center justify-content-between gap-2 mt-2 pt-2 border-top border-primary-subtle">
                                <div className="d-flex align-items-center gap-1">
                                  <span className="text-secondary fw-semibold" style={{ fontSize: "0.72rem" }}>Qty:</span>
                                  <div className="input-group input-group-sm" style={{ width: "95px" }}>
                                    <button
                                      type="button"
                                      className="btn btn-outline-secondary px-1.5 py-0"
                                      style={{ height: "26px" }}
                                      onClick={() => handleUpdateExchangeQty(exc.id, -1)}
                                    >
                                      <FiMinus size={10} />
                                    </button>
                                    <span
                                      className="form-control text-center p-0 fw-bold bg-white"
                                      style={{ fontSize: "0.78rem", height: "26px", lineHeight: "24px" }}
                                    >
                                      {exc.quantity}
                                    </span>
                                    <button
                                      type="button"
                                      className="btn btn-outline-secondary px-1.5 py-0"
                                      style={{ height: "26px" }}
                                      disabled={exc.quantity >= exc.availableQuantity}
                                      onClick={() => handleUpdateExchangeQty(exc.id, 1)}
                                    >
                                      <FiPlus size={10} />
                                    </button>
                                  </div>
                                </div>

                                <div className="d-flex align-items-center gap-1.5">
                                  <span className="text-secondary fw-semibold text-nowrap" style={{ fontSize: "0.72rem" }}>Selling Price:</span>
                                  <div className="input-group input-group-sm" style={{ width: "125px" }}>
                                    <span className="input-group-text px-1.5 bg-white text-muted border-end-0 fw-semibold" style={{ fontSize: "0.72rem", height: "26px" }}>
                                      Rs.
                                    </span>
                                    <input
                                      type="number"
                                      min="0"
                                      className="form-control fw-bold text-dark border-start-0 ps-1 py-0 bg-white"
                                      style={{ fontSize: "0.80rem", height: "26px" }}
                                      value={exc.customSellingPrice !== undefined ? exc.customSellingPrice : exc.defaultSellingPrice}
                                      onChange={(e) => handleUpdateExchangePrice(exc.id, e.target.value)}
                                      placeholder="0"
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* ========================================================
                      SETTLEMENT / SUMMARY BOX
                     ======================================================== */}
                {isExchangeMode ? (
                  <div className="p-3 bg-light rounded-3 border mb-3 shadow-xs">
                    <div className="d-flex justify-content-between align-items-center mb-1.5">
                      <span className="small text-muted fw-medium">Total Return Credit:</span>
                      <span className="fw-bold text-success small font-monospace fs-6">
                        +Rs. {totalRefundAmount.toLocaleString()} <span className="fw-normal text-muted" style={{ fontSize: "0.70rem" }}>({totalUnitsReturned} pcs)</span>
                      </span>
                    </div>
                    <div className="d-flex justify-content-between align-items-center mb-2.5">
                      <span className="small text-muted fw-medium">New Purchase Total:</span>
                      <span className="fw-bold text-dark small font-monospace fs-6">
                        -Rs. {exchangeCartTotal.toLocaleString()} <span className="fw-normal text-muted" style={{ fontSize: "0.70rem" }}>({exchangeTotalUnits} pcs)</span>
                      </span>
                    </div>

                    {/* Net Settlement High-Contrast Badge */}
                    {exchangeNetDifference > 0 ? (
                      <div className="p-3 rounded-2 border border-success bg-success-subtle d-flex align-items-center justify-content-between mt-2.5 shadow-xs">
                        <div>
                          <div className="fw-bolder text-success-emphasis" style={{ fontSize: "0.85rem" }}>
                            Customer Pays Shop:
                          </div>
                          <div className="text-secondary" style={{ fontSize: "0.68rem" }}>
                            Replacement total exceeds return credit
                          </div>
                        </div>
                        <span className="fs-5 fw-bolder text-success font-monospace">
                          Rs. {exchangeNetDifference.toLocaleString()}
                        </span>
                      </div>
                    ) : exchangeNetDifference < 0 ? (
                      <div className="p-3 rounded-2 border border-warning bg-warning-subtle d-flex align-items-center justify-content-between mt-2.5 shadow-xs">
                        <div>
                          <div className="fw-bolder text-dark" style={{ fontSize: "0.85rem" }}>
                            Shop Refunds to Customer:
                          </div>
                          <div className="text-secondary" style={{ fontSize: "0.68rem" }}>
                            Return credit exceeds replacement total
                          </div>
                        </div>
                        <span className="fs-5 fw-bolder text-dark font-monospace">
                          Rs. {Math.abs(exchangeNetDifference).toLocaleString()}
                        </span>
                      </div>
                    ) : (
                      <div className="p-3 rounded-2 border border-secondary bg-white d-flex align-items-center justify-content-between mt-2.5 shadow-xs">
                        <div>
                          <div className="fw-bolder text-dark" style={{ fontSize: "0.85rem" }}>
                            Even Exchange:
                          </div>
                          <div className="text-secondary" style={{ fontSize: "0.68rem" }}>
                            Equal value &bull; No net cash exchange
                          </div>
                        </div>
                        <span className="fs-5 fw-bolder text-dark font-monospace">
                          Rs. 0
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-3 bg-light rounded-3 border mb-3 shadow-xs">
                    <div className="d-flex justify-content-between align-items-center mb-1.5">
                      <span className="small text-muted">Total Units to Return:</span>
                      <span className="fw-semibold text-dark small">{totalUnitsReturned} pcs</span>
                    </div>
                    <div className="d-flex justify-content-between align-items-center mb-1.5">
                      <span className="small text-muted">Stock Asset Restored:</span>
                      <span className="fw-semibold text-primary small" title={formatFullAmount(totalCostRefunded)}>
                        +{formatUnit(totalCostRefunded)}
                      </span>
                    </div>
                    {totalRetainedProfit > 0 && (
                      <div className="d-flex justify-content-between align-items-center mb-1.5">
                        <span className="small text-muted">Retained Shop Fee / Deduction:</span>
                        <span
                          className="badge bg-success text-white px-2 py-0.5 fw-bold shadow-xs d-inline-flex align-items-center gap-1"
                          style={{ fontSize: "0.72rem" }}
                        >
                          +Rs. {totalRetainedProfit.toLocaleString()}
                        </span>
                      </div>
                    )}
                    <div className="d-flex justify-content-between align-items-center pt-2 border-top border-secondary-subtle">
                      <div>
                        <span className="fw-bold text-dark d-block">Agreed Cash Refund to Customer:</span>
                        <span className="text-muted small" style={{ fontSize: "0.68rem" }}>Direct net refund amount</span>
                      </div>
                      <span className="fs-5 fw-bold text-dark" title={formatFullAmount(totalRefundAmount)}>
                        Rs. {totalRefundAmount.toLocaleString()}
                      </span>
                    </div>
                  </div>
                )}

                {/* Submit Action Button */}
                <div className="pb-4">
                  <button
                    type="button"
                    className="btn btn-dark w-100 py-2.5 fw-semibold d-flex align-items-center justify-content-center gap-2 shadow-sm rounded-2"
                    onClick={handleSubmitReturn}
                    disabled={isSubmitting || returnCart.length === 0}
                  >
                    {isSubmitting ? (
                      <>
                        <span className="spinner-border spinner-border-sm" role="status" />
                        {isExchangeMode ? "Processing Exchange..." : "Processing Refund..."}
                      </>
                    ) : isExchangeMode ? (
                      <>
                        <FiRefreshCw size={15} />
                        {exchangeNetDifference > 0
                          ? `Complete Exchange • Customer Pays Rs. ${exchangeNetDifference.toLocaleString()}`
                          : exchangeNetDifference < 0
                            ? `Complete Exchange • Refund Rs. ${Math.abs(exchangeNetDifference).toLocaleString()}`
                            : `Complete Even Exchange • Rs. 0`}
                      </>
                    ) : (
                      <>
                        <FiCheckCircle size={16} className="text-success" />
                        Complete Refund &bull; Rs. {totalRefundAmount.toLocaleString()}
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          COMPLETED RETURN RECEIPT MODAL
          ========================================================================= */}
      {completedReturnReceipt && (
        <ReturnReceiptModal
          receipt={completedReturnReceipt}
          onClose={() => setCompletedReturnReceipt(null)}
        />
      )}
    </div>
  );
}
