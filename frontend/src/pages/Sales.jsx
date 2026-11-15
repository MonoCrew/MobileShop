import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  FiSearch,
  FiShoppingCart,
  FiCheckCircle,
  FiAlertCircle,
  FiPlus,
  FiMinus,
  FiDollarSign,
  FiPrinter,
  FiRefreshCw,
  FiPackage,
  FiTag,
  FiCreditCard,
  FiTrash2,
  FiX,
  FiHash,
  FiCheck,
  FiUser,
  FiFileText,
} from "react-icons/fi";
import Swal from "sweetalert2";
import api from "../api/axios";
import { formatUnit, formatFullAmount } from "../utils/unitChanger";
import SaleReceiptModal from "../components/sales/SaleReceiptModal";

// Fast, Typo-Tolerant & Fuzzy Matcher
const isFuzzyMatch = (target, query) => {
  if (!target || !query) return false;
  const t = String(target).toLowerCase().trim();
  const q = String(query).toLowerCase().trim();

  // 1. Direct Substring
  if (t.includes(q)) return true;

  // 2. Character-Sequence Subsequence (e.g. "chgr" or "chager" matches "charger")
  let qIdx = 0;
  for (let i = 0; i < t.length && qIdx < q.length; i++) {
    if (t[i] === q[qIdx]) qIdx++;
  }
  if (qIdx === q.length) return true;

  // 3. Small Edit Distance (1 character typo tolerance for queries >= 3 chars)
  if (Math.abs(t.length - q.length) <= 2 && q.length >= 3) {
    let mismatches = 0;
    let i = 0;
    let j = 0;
    while (i < t.length && j < q.length) {
      if (t[i] !== q[j]) {
        mismatches++;
        if (mismatches > 1) break;
        if (t.length > q.length) {
          i++;
          continue;
        } else if (q.length > t.length) {
          j++;
          continue;
        }
      }
      i++;
      j++;
    }
    if (mismatches <= 1) return true;
  }

  // 4. Multi-word tokens
  const words = q.split(/\s+/).filter(Boolean);
  if (words.length > 1) {
    return words.every((w) => t.includes(w));
  }

  return false;
};

export default function Sales() {
  // Search & Filters State
  const [searchQuery, setSearchQuery] = useState("");
  const [isDebouncing, setIsDebouncing] = useState(false);
  const [stockStatusFilter, setStockStatusFilter] = useState("in_stock"); // 'all', 'in_stock', 'low_stock'
  const [sortBy, setSortBy] = useState("newest");

  // Barcode Scanner & Search Input Refs
  const [isScanning, setIsScanning] = useState(false);
  const searchInputRef = useRef(null);
  const customerInputRef = useRef(null);
  const debounceTimerRef = useRef(null);

  // Inventory Data & Cursor Pagination
  const [inventory, setInventory] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoadingInventory, setIsLoadingInventory] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Multi-Item POS Cart State
  const [cart, setCart] = useState([]);
  const [customerName, setCustomerName] = useState("");
  const [existingCustomers, setExistingCustomers] = useState([]);
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [saleNotes, setSaleNotes] = useState("");

  const handleClearCart = useCallback(() => {
    setCart([]);
    setCustomerName("");
    setSaleNotes("");
    setSaleError(null);
  }, []);

  // Submitting State & Notifications
  const [isSubmittingSale, setIsSubmittingSale] = useState(false);
  const [saleError, setSaleError] = useState(null);
  const [completedSaleData, setCompletedSaleData] = useState(null); // Receipt modal
  const [toastMessage, setToastMessage] = useState(null);

  // Product Barcodes Inspection Modal State
  const [selectedProductForBarcodes, setSelectedProductForBarcodes] = useState(null);
  const [isBarcodesModalOpen, setIsBarcodesModalOpen] = useState(false);
  const [isLoadingBarcodes, setIsLoadingBarcodes] = useState(false);
  const [barcodeFilterSearch, setBarcodeFilterSearch] = useState("");
  const [barcodeStatusFilter, setBarcodeStatusFilter] = useState("all"); // 'all', 'available', 'sold'
  const [copiedBarcode, setCopiedBarcode] = useState(null);

  // AbortController ref for search cancellation
  const abortControllerRef = useRef(null);



  // 1. Fetch Inventory from MongoDB using cursor pagination & filters
  const fetchInventory = useCallback(
    async (cursorVal = null, append = false, queryOverride = null) => {
      if (append) {
        setIsLoadingMore(true);
      } else {
        setIsLoadingInventory(true);
      }

      if (abortControllerRef.current && !append) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      try {
        const effectiveQuery = queryOverride !== null ? queryOverride : searchQuery;
        const params = {
          limit: 30,
          sort: sortBy,
          stockStatus: stockStatusFilter !== "all" ? stockStatusFilter : undefined,
        };

        if (effectiveQuery && effectiveQuery.trim()) {
          params.search = effectiveQuery.trim();
        }
        if (cursorVal) {
          params.cursor = cursorVal;
        }

        const res = await api.get("/stock", {
          params,
          signal: abortControllerRef.current.signal,
        });

        if (res.data?.success) {
          const items = res.data.data || [];

          setInventory((prev) => (append ? [...prev, ...items] : items));
          setNextCursor(res.data.nextCursor || null);
          setHasMore(Boolean(res.data.hasMore));
          if (!cursorVal) {
            setTotalCount(res.data.totalCount || items.length);
          }
        }
      } catch (err) {
        if (err.name !== "CanceledError" && err.name !== "AbortError" && err.code !== "ERR_CANCELED") {
          console.error("Error fetching inventory for sales:", err);
        }
      } finally {
        setIsLoadingInventory(false);
        setIsLoadingMore(false);
      }
    },
    [searchQuery, stockStatusFilter, sortBy]
  );

  // Fetch inventory on mount and when stock filter or sort option changes
  useEffect(() => {
    fetchInventory(null, false);
  }, [stockStatusFilter, sortBy]);

  // Fetch known customer names from database for autocomplete suggestions
  useEffect(() => {
    let isMounted = true;
    api
      .get("/customers?limit=100")
      .then((res) => {
        if (isMounted && res.data?.success && Array.isArray(res.data.data)) {
          setExistingCustomers(res.data.data);
        }
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, []);

  // Cross-tab synchronization & cache invalidation
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const bc = new BroadcastChannel("pos_system_sync");
    bc.onmessage = (event) => {
      if (
        event.data?.type === "stock_updated" ||
        event.data?.type === "return_completed" ||
        event.data?.type === "local_purchase_updated" ||
        event.data?.type === "sale_completed"
      ) {
        fetchInventory(null, false);
      }
    };
    return () => bc.close();
  }, [fetchInventory]);

  // Clean up debounce timer on component unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Real-time Debounced Search Handler (350ms)
  const handleSearchChange = (e) => {
    const val = e.target.value;
    setSearchQuery(val);
    setIsDebouncing(true);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      setIsDebouncing(false);
      fetchInventory(null, false, val);
    }, 350);
  };

  const handleClearSearch = () => {
    setSearchQuery("");
    setIsDebouncing(false);
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    fetchInventory(null, false, "");
    searchInputRef.current?.focus();
  };

  // Keep fresh inventory and cart references for instant checks
  const inventoryRef = useRef(inventory);
  useEffect(() => {
    inventoryRef.current = inventory;
  }, [inventory]);

  const cartRef = useRef(cart);
  useEffect(() => {
    cartRef.current = cart;
  }, [cart]);

  // Auto-dismiss toast feedback
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 2500);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  // A) Barcode-based Serialized / Catalog Unit Addition
  // Attaches the exact scanned barcode unit, increments quantity for catalog stock,
  // and prevents duplicate selling of the identical physical serialized unit piece
  const addScannedUnitToCart = useCallback((unit, code, stockItemId = null) => {
    setSaleError(null);

    setCart((prevCart) => {
      const isCatalog = Boolean(unit.isCatalogOnly);
      const targetStockId = unit.stockId || unit._id;

      // LEVEL 1: Check whether that exact serialized unit already exists in the cart
      // For serialized pieces (!isCatalog), 1 physical piece = 1 document, cannot be duplicated
      if (!isCatalog) {
        if (stockItemId) {
          const alreadyInById = prevCart.some(
            (it) => !it.isCatalogOnly && Array.isArray(it.stockItemIds) && it.stockItemIds.includes(stockItemId)
          );
          if (alreadyInById) {
            setSaleError(`This physical unit (IEMI: "${code}") is already in this sale.`);
            return prevCart;
          }
        } else {
          // If no specific stockItemId, count how many units with this barcode are already in cart
          let inCartCount = 0;
          prevCart.forEach((it) => {
            if (!it.isCatalogOnly && Array.isArray(it.barcodes)) {
              it.barcodes.forEach((b) => {
                if (b && b.toLowerCase() === code.toLowerCase()) inCartCount++;
              });
            }
          });
          const maxAvailForBarcode = unit.availableQuantity ?? unit.quantity ?? 1;
          if (inCartCount >= maxAvailForBarcode) {
            setSaleError(`All available units with IEMI "${code}" (${maxAvailForBarcode} pcs) are already in this sale.`);
            return prevCart;
          }
        }
      }

      const existingIdx = prevCart.findIndex(
        (it) =>
          (targetStockId && it.stockId === targetStockId) ||
          (it.productName && it.productName.toLowerCase() === unit.productName.toLowerCase())
      );

      if (existingIdx >= 0) {
        const existing = prevCart[existingIdx];
        const maxQty = unit.availableQuantity ?? existing.availableQuantity ?? unit.quantity ?? 0;
        if (existing.quantity >= maxQty) {
          setSaleError(
            `Cannot add more "${unit.productName}". Maximum available stock (${maxQty} pcs) already in cart.`
          );
          return prevCart;
        }

        const updated = [...prevCart];
        const nextQty = existing.quantity + 1;
        const currentBarcodes = Array.isArray(existing.barcodes) ? existing.barcodes : [];
        const currentStockItemIds = Array.isArray(existing.stockItemIds) ? existing.stockItemIds : [];

        updated[existingIdx] = {
          ...existing,
          quantity: nextQty,
          barcodes: [...currentBarcodes, code],
          stockItemIds: stockItemId ? [...currentStockItemIds, stockItemId] : currentStockItemIds,
          barcode: code,
          availableQuantity: maxQty,
        };
        setToastMessage(`Updated "${unit.productName}" quantity to ${nextQty} (IEMI: ${code}).`);
        return updated;
      }

      // New cart line item with exact physical barcode
      const initialSalePrice =
        unit.sellingPrice != null && unit.sellingPrice !== ""
          ? unit.sellingPrice
          : unit.estimatedSalePricePerUnit != null
            ? unit.estimatedSalePricePerUnit
            : "";

      const newItem = {
        stockId: targetStockId,
        productName: unit.productName,
        storage: unit.storage || unit.parentStock?.storage || "",
        color: unit.color || unit.parentStock?.color || "",
        barcode: code,
        barcodes: [code],
        stockItemIds: stockItemId ? [stockItemId] : [],
        isCatalogOnly: isCatalog,
        availableQuantity: unit.availableQuantity ?? unit.quantity ?? 1,
        unitPurchaseCost:
          unit.unitPurchaseCost != null
            ? unit.unitPurchaseCost
            : unit.unitPrice || unit.purchaseCost || 0,
        estimatedSalePricePerUnit:
          unit.estimatedSalePricePerUnit != null
            ? unit.estimatedSalePricePerUnit
            : unit.parentStock?.estimatedSalePricePerUnit ?? null,
        estimatedTotalSaleValue:
          unit.estimatedTotalSaleValue != null
            ? unit.estimatedTotalSaleValue
            : unit.parentStock?.estimatedTotalSaleValue ?? null,
        unitSellingPrice: initialSalePrice,
        sellingPrice: initialSalePrice,
        quantity: 1,
        supplier:
          unit.supplier?.name ||
          (typeof unit.supplier === "string" ? unit.supplier : "Unknown Supplier"),
        category: unit.category || "General",
      };

      setToastMessage(`Added "${unit.productName}" (IEMI: ${code}) to cart.`);
      return [...prevCart, newItem];
    });
  }, []);

  // Helper: Resolves matching IMEI / barcode for a product based on search query or available units
  const resolveTargetBarcode = useCallback(
    (product, query = null) => {
      if (!product) return null;
      const q = (query !== null ? query : searchQuery || "").trim().toLowerCase();
      const serializedUnits = Array.isArray(product.serializedUnits) ? product.serializedUnits : [];
      const barcodes = Array.isArray(product.barcodes) ? product.barcodes : [];

      const cartBarcodeCounts = {};
      const cartStockItemIds = new Set();
      cartRef.current.forEach((it) => {
        if (Array.isArray(it.stockItemIds)) {
          it.stockItemIds.forEach((id) => id && cartStockItemIds.add(id));
        }
        if (Array.isArray(it.barcodes)) {
          it.barcodes.forEach((b) => {
            if (b && b !== "N/A") {
              const lb = b.toLowerCase();
              cartBarcodeCounts[lb] = (cartBarcodeCounts[lb] || 0) + 1;
            }
          });
        } else if (it.barcode && it.barcode !== "N/A") {
          const lb = it.barcode.toLowerCase();
          cartBarcodeCounts[lb] = (cartBarcodeCounts[lb] || 0) + 1;
        }
      });

      const isBarcodeFull = (bc) => {
        if (!bc) return false;
        const lower = bc.toLowerCase();
        const inCart = cartBarcodeCounts[lower] || 0;
        const totalAvailForBc =
          serializedUnits.filter(
            (u) => u.barcode && u.barcode.toLowerCase() === lower && u.status === "available"
          ).length || barcodes.filter((b) => b && b.toLowerCase() === lower).length || 1;
        return inCart >= totalAvailForBc;
      };

      const isUnitInCart = (u) => {
        if (!u) return false;
        const uId = u._id || u.stockItemId;
        if (uId && cartStockItemIds.has(uId)) return true;
        return isBarcodeFull(u.barcode);
      };

      // 1. If user typed or searched an IMEI, prioritize matching that exact searched IMEI
      if (q) {
        // Exact match in serializedUnits
        const exactUnit =
          serializedUnits.find((u) => u.barcode && u.barcode.toLowerCase() === q && u.status === "available" && !isUnitInCart(u)) ||
          serializedUnits.find((u) => u.barcode && u.barcode.toLowerCase() === q && u.status === "available") ||
          serializedUnits.find((u) => u.barcode && u.barcode.toLowerCase() === q);
        if (exactUnit) return exactUnit.barcode;

        // Exact match in barcodes array
        const exactBc =
          barcodes.find((b) => b && b.toLowerCase() === q && !isBarcodeFull(b)) ||
          barcodes.find((b) => b && b.toLowerCase() === q);
        if (exactBc) return exactBc;

        // Substring match in serializedUnits
        const subUnit =
          serializedUnits.find(
            (u) =>
              u.barcode &&
              u.barcode.toLowerCase().includes(q) &&
              u.status === "available" &&
              !isUnitInCart(u)
          ) ||
          serializedUnits.find(
            (u) => u.barcode && u.barcode.toLowerCase().includes(q) && u.status === "available"
          ) ||
          serializedUnits.find((u) => u.barcode && u.barcode.toLowerCase().includes(q));
        if (subUnit) return subUnit.barcode;

        // Substring match in barcodes
        const subBc =
          barcodes.find(
            (b) =>
              b &&
              b.toLowerCase().includes(q) &&
              !isBarcodeFull(b)
          ) ||
          barcodes.find((b) => b && b.toLowerCase().includes(q));
        if (subBc) return subBc;

        if (
          product.barcode &&
          product.barcode.toLowerCase().includes(q) &&
          product.barcode.toUpperCase() !== "N/A"
        ) {
          return product.barcode;
        }
      }

      // 2. If no query or query didn't match an IMEI, pick the first available unit not yet in cart
      const availUnitNotCart = serializedUnits.find(
        (u) => u.barcode && u.status === "available" && !isUnitInCart(u)
      );
      if (availUnitNotCart) return availUnitNotCart.barcode;

      const bcNotCart = barcodes.find((b) => b && !isBarcodeFull(b));
      if (bcNotCart) return bcNotCart;

      // Fallbacks
      if (serializedUnits.length > 0) {
        const avail = serializedUnits.find((u) => u.status === "available" && !isUnitInCart(u)) ||
          serializedUnits.find((u) => u.status === "available");
        if (avail) return avail.barcode;
        if (serializedUnits[0]?.barcode) return serializedUnits[0].barcode;
      }
      if (barcodes.length > 0) return barcodes[0];
      if (product.barcode && product.barcode.toUpperCase() !== "N/A") return product.barcode;

      return null;
    },
    [searchQuery]
  );

  // B) Manual Catalog Product Addition (+ Add button / Catalog click)
  // Automatically selects the exact searched IMEI if the user searched an IMEI!
  const addToCart = useCallback(
    (product, explicitBarcode = null) => {
      setSaleError(null);
      if (!product || product.quantity <= 0) {
        setSaleError(`"${product?.productName || "Product"}" is currently out of stock.`);
        return;
      }

      // If this product has serialized IMEI barcodes, resolve the target barcode (prioritizing the search query)
      const targetBarcode = explicitBarcode || resolveTargetBarcode(product, searchQuery);
      if (targetBarcode) {
        const serializedUnits = Array.isArray(product.serializedUnits) ? product.serializedUnits : [];
        const matchedUnit = serializedUnits.find(
          (u) => u.barcode && u.barcode.toLowerCase() === targetBarcode.toLowerCase() && u.status === "available"
        );
        addScannedUnitToCart(product, targetBarcode, matchedUnit?._id || null);
        return;
      }

      setCart((prevCart) => {
        const existingIdx = prevCart.findIndex((it) => it.stockId === product._id);

        if (existingIdx >= 0) {
          const existing = prevCart[existingIdx];
          if (existing.quantity >= product.quantity) {
            setSaleError(
              `Cannot add more "${product.productName}". Maximum available stock (${product.quantity} pcs) already in cart.`
            );
            return prevCart;
          }

          const updated = [...prevCart];
          const nextQty = existing.quantity + 1;

          updated[existingIdx] = {
            ...existing,
            quantity: nextQty,
          };
          setToastMessage(`Updated "${product.productName}" quantity to ${nextQty}.`);
          return updated;
        }

        // Add new manual cart item (barcodes array is empty)
        const unitCost = product.unitPrice || 0;
        const initialPrice = "";

        const newItem = {
          stockId: product._id,
          productName: product.productName,
          storage: product.storage || "",
          color: product.color || "",
          barcode: product.barcode || "N/A",
          barcodes: [],
          stockItemIds: [],
          availableQuantity: product.quantity,
          unitPurchaseCost: unitCost,
          estimatedSalePricePerUnit:
            product.estimatedSalePricePerUnit != null ? product.estimatedSalePricePerUnit : null,
          estimatedTotalSaleValue:
            product.estimatedTotalSaleValue != null ? product.estimatedTotalSaleValue : null,
          unitSellingPrice: initialPrice,
          sellingPrice: initialPrice,
          quantity: 1,
          supplier:
            product.supplier?.name ||
            (typeof product.supplier === "string" ? product.supplier : "Unknown Supplier"),
          category: product.category || "General",
        };

        return [...prevCart, newItem];
      });
    },
    [addScannedUnitToCart, resolveTargetBarcode, searchQuery]
  );

  // Remove a specific barcode / unit from cart or entire line item if none remain
  const removeBarcodeFromCart = useCallback((stockId, barcodeToRemove, stockItemIdToRemove = null, indexToRemove = null) => {
    setCart((prev) =>
      prev
        .map((it) => {
          if (it.stockId !== stockId) return it;
          let currentBarcodes = Array.isArray(it.barcodes) ? [...it.barcodes] : [];
          let currentStockItemIds = Array.isArray(it.stockItemIds) ? [...it.stockItemIds] : [];

          let removeIdx = -1;
          if (indexToRemove != null && indexToRemove >= 0 && indexToRemove < currentBarcodes.length) {
            removeIdx = indexToRemove;
          } else if (stockItemIdToRemove) {
            removeIdx = currentStockItemIds.indexOf(stockItemIdToRemove);
          }
          if (removeIdx === -1 && barcodeToRemove) {
            removeIdx = currentBarcodes.findIndex((b) => b && b.toLowerCase() === String(barcodeToRemove).toLowerCase());
          }
          if (removeIdx === -1 && currentBarcodes.length > 0) {
            removeIdx = currentBarcodes.length - 1;
          }

          if (removeIdx >= 0) {
            currentBarcodes.splice(removeIdx, 1);
            if (currentStockItemIds.length > removeIdx) {
              currentStockItemIds.splice(removeIdx, 1);
            }
          }

          if (currentBarcodes.length === 0 || it.quantity <= 1) {
            return null; // remove line item
          }
          return {
            ...it,
            quantity: it.quantity - 1,
            barcodes: currentBarcodes,
            stockItemIds: currentStockItemIds,
            barcode: currentBarcodes[currentBarcodes.length - 1] || "N/A",
          };
        })
        .filter(Boolean)
    );
    setSaleError(null);
  }, []);

  // Remove / Cancel specific item from cart: releases its barcodes for re-scanning
  const removeFromCart = (stockId) => {
    setCart((prev) => prev.filter((it) => it.stockId !== stockId));
    setSaleError(null);
  };

  // Update quantity of an item in cart
  const updateCartQty = (stockId, newQty) => {
    setCart((prev) =>
      prev.map((it) => {
        if (it.stockId !== stockId) return it;
        const parsed = parseInt(newQty, 10);
        const validQty = Math.max(1, Math.min(it.availableQuantity, isNaN(parsed) ? 1 : parsed));

        // When decreasing quantity, trim barcodes and stockItemIds array so released barcodes can be re-scanned
        let updatedBarcodes = Array.isArray(it.barcodes) ? [...it.barcodes] : [];
        let updatedStockItemIds = Array.isArray(it.stockItemIds) ? [...it.stockItemIds] : [];
        if (validQty < updatedBarcodes.length) {
          updatedBarcodes = updatedBarcodes.slice(0, validQty);
          updatedStockItemIds = updatedStockItemIds.slice(0, validQty);
        }

        return {
          ...it,
          quantity: validQty,
          barcodes: updatedBarcodes,
          stockItemIds: updatedStockItemIds,
        };
      })
    );
  };

  // Update individual item selling price in cart
  const updateCartPrice = (stockId, newPrice) => {
    setCart((prev) =>
      prev.map((it) => {
        if (it.stockId !== stockId) return it;
        return {
          ...it,
          unitSellingPrice: newPrice,
          sellingPrice: newPrice,
        };
      })
    );
  };

  // Process barcode: direct backend query -> exact unit / catalog addition
  const handleScanBarcode = useCallback(
    async (rawCode) => {
      const code = rawCode == null ? "" : String(rawCode).trim();
      if (!code) return false;

      setSaleError(null);
      setIsScanning(true);

      try {
        const res = await api.get(`/stock/barcode/${encodeURIComponent(code)}`);
        const unit = res.data?.data;

        if (unit) {
          // 1. If barcode was already sold in a previous completed sale
          if (unit.status === "sold") {
            setSaleError("This IEMI number has already been sold and is no longer available.");
            setSearchQuery("");
            return true;
          }

          // 2. If unit is damaged, returned, or unavailable
          if (unit.status && unit.status !== "available") {
            setSaleError(
              `The scanned unit with IEMI "${code}" is currently ${unit.status} and cannot be sold.`
            );
            setSearchQuery("");
            return true;
          }

          // 3. Check catalog availability
          if (unit.availableQuantity <= 0) {
            setSaleError(`Product "${unit.productName}" is out of stock (0 available).`);
            setSearchQuery("");
            return true;
          }

          // 4. Unit is valid and available: add exact physical unit to cart
          addScannedUnitToCart(unit, code, unit._id || unit.stockItemId || null);
          setSearchQuery("");
          requestAnimationFrame(() => searchInputRef.current?.focus());
          return true;
        } else {
          setSaleError("IEMI number not found.");
          setSearchQuery("");
          return false;
        }
      } catch (err) {
        if (err.response?.status === 404 || err.status === 404) {
          setSaleError("IEMI number not found.");
          setSearchQuery("");
          return false;
        }
        setSaleError(err.response?.data?.message || err.message || "Failed to scan IEMI number.");
        setSearchQuery("");
        return false;
      } finally {
        setIsScanning(false);
      }
    },
    [addScannedUnitToCart]
  );

  // Instant Typo-Tolerant & Fuzzy Filtered Inventory
  const filteredInventory = useMemo(() => {
    if (!searchQuery.trim()) return inventory;
    const q = searchQuery.trim().toLowerCase();

    return inventory.filter((item) => {
      if (isFuzzyMatch(item.productName, q)) return true;
      if (item.barcode && item.barcode !== "N/A" && isFuzzyMatch(item.barcode, q)) return true;
      if (Array.isArray(item.barcodes) && item.barcodes.some((b) => b && b !== "N/A" && isFuzzyMatch(b, q))) return true;
      const sName = item.supplier?.name || item.supplierName || (typeof item.supplier === "string" ? item.supplier : "");
      if (sName && isFuzzyMatch(sName, q)) return true;
      if (item.category && isFuzzyMatch(item.category, q)) return true;
      return false;
    });
  }, [inventory, searchQuery]);

  // Handle Enter key in Search Bar (Barcode Gun Scan or instant search/select)
  const handleSearchKeyDown = async (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const code = searchQuery.trim();
      if (!code) return;

      // Cancel debounce timer immediately so background inventory search isn't triggered
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        setIsDebouncing(false);
      }

      // Check if it's an exact barcode scan first via LRU cache & deduplicated lookup
      const isBarcode = await handleScanBarcode(code);
      if (isBarcode) {
        return;
      }

      // If exactly 1 item matches in the filtered catalog, add it directly on Enter
      if (filteredInventory.length === 1) {
        const singleItem = filteredInventory[0];
        if (singleItem.quantity > 0) {
          const targetBc = resolveTargetBarcode(singleItem, code);
          addToCart(singleItem, targetBc);
          setSearchQuery("");
          return;
        }
      }

      // Otherwise immediately trigger server search for the query without waiting for debounce
      fetchInventory(null, false, code);
    }
  };

  // Open Barcode Inspection Modal for a specific product
  const openBarcodesModal = useCallback(async (product) => {
    const initialUnits = product.serializedUnits || [];
    const initialBarcodes =
      product.barcodes ||
      (product.barcode && product.barcode !== "N/A" ? [product.barcode] : []);

    setSelectedProductForBarcodes({
      stockId: product._id,
      productName: product.productName,
      availableQuantity: product.quantity,
      unitPrice: product.unitPrice,
      estimatedSalePricePerUnit: product.estimatedSalePricePerUnit ?? null,
      estimatedTotalSaleValue: product.estimatedTotalSaleValue ?? null,
      supplier:
        product.supplier?.name ||
        (typeof product.supplier === "string" ? product.supplier : "Unknown Supplier"),
      barcodes: initialBarcodes,
      units: initialUnits,
    });
    setIsBarcodesModalOpen(true);
    setBarcodeFilterSearch("");
    setBarcodeStatusFilter("all");
    setIsLoadingBarcodes(true);

    try {
      const res = await api.get(`/stock/${product._id}/barcodes`);
      if (res.data?.success && res.data?.data) {
        setSelectedProductForBarcodes((prev) => ({
          ...prev,
          availableQuantity: res.data.data.availableQuantity,
          estimatedSalePricePerUnit:
            res.data.data.estimatedSalePricePerUnit ?? prev?.estimatedSalePricePerUnit ?? null,
          estimatedTotalSaleValue:
            res.data.data.estimatedTotalSaleValue ?? prev?.estimatedTotalSaleValue ?? null,
          barcodes: res.data.data.units.map((u) => u.barcode).filter(Boolean),
          units: res.data.data.units,
        }));
      }
    } catch (err) {
      console.error("Failed to load fresh barcodes:", err);
    } finally {
      setIsLoadingBarcodes(false);
    }
  }, []);

  const handleCopyBarcode = (bc) => {
    navigator.clipboard?.writeText(bc);
    setCopiedBarcode(bc);
    setTimeout(() => setCopiedBarcode(null), 1500);
  };

  const handleAddUnitFromModal = (unitRecord) => {
    if (unitRecord.status !== "available") {
      setSaleError(
        `IEMI "${unitRecord.barcode}" is marked as "${unitRecord.status}" and cannot be added.`
      );
      return;
    }

    const unitId = unitRecord._id || unitRecord.stockItemId;
    if (unitId) {
      const isAlreadyIn = cartRef.current.some(
        (it) => Array.isArray(it.stockItemIds) && it.stockItemIds.includes(unitId)
      );
      if (isAlreadyIn) {
        setSaleError(`This physical unit (IEMI: ${unitRecord.barcode}) is already in this sale.`);
        return;
      }
    }

    addScannedUnitToCart(
      {
        stockId: selectedProductForBarcodes.stockId,
        productName: selectedProductForBarcodes.productName,
        storage: unitRecord.storage || selectedProductForBarcodes.storage || "",
        color: unitRecord.color || selectedProductForBarcodes.color || "",
        availableQuantity: selectedProductForBarcodes.availableQuantity,
        unitPurchaseCost: selectedProductForBarcodes.unitPrice,
        purchaseCost: selectedProductForBarcodes.unitPrice,
        estimatedSalePricePerUnit: selectedProductForBarcodes.estimatedSalePricePerUnit,
        estimatedTotalSaleValue: selectedProductForBarcodes.estimatedTotalSaleValue,
        supplier: selectedProductForBarcodes.supplier,
      },
      unitRecord.barcode,
      unitId || null
    );
  };

  const filteredModalUnits = useMemo(() => {
    if (!selectedProductForBarcodes) return [];
    let list = selectedProductForBarcodes.units || [];
    if (list.length === 0 && selectedProductForBarcodes.barcodes?.length > 0) {
      list = selectedProductForBarcodes.barcodes.map((bc) => ({
        barcode: bc,
        status: selectedProductForBarcodes.availableQuantity > 0 ? "available" : "sold",
      }));
    }

    if (barcodeStatusFilter !== "all") {
      list = list.filter((u) => u.status === barcodeStatusFilter);
    }

    if (barcodeFilterSearch.trim()) {
      const q = barcodeFilterSearch.trim().toLowerCase();
      list = list.filter((u) => (u.barcode || "").toLowerCase().includes(q));
    }

    return list;
  }, [selectedProductForBarcodes, barcodeStatusFilter, barcodeFilterSearch]);

  // High-Precision Global Hardware Barcode Scanner State Machine
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
      // If user is actively typing inside Customer Name or other non-scanner text inputs / textareas, do NOT hijack!
      const target = e.target;
      const isFocusedInOtherInput =
        target &&
        (target.tagName === "TEXTAREA" ||
          (target.tagName === "INPUT" &&
            target !== searchInputRef.current &&
            !target.classList?.contains("pos-barcode-scanner-input")));

      if (isFocusedInOtherInput) {
        if (scannerState.current.isScanning || scannerState.current.buffer) {
          resetScannerState();
        }
        return;
      }

      // Ignore standalone modifier keys
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
              // If focused in search input, sync React state
              if (target.placeholder?.includes("Search")) {
                setSearchQuery(valBefore);
              }
              // Blur non-barcode inputs
              if (!target.classList?.contains("pos-barcode-scanner-input")) {
                target.blur();
              }
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

        // Potential first key of a new scan (or human typing)
        const activeEl = document.activeElement;
        const isInput =
          activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA");

        if (scannerState.current.timeoutId) {
          clearTimeout(scannerState.current.timeoutId);
        }

        scannerState.current = {
          buffer: e.key,
          firstKeyChar: e.key,
          firstKeyTime: now,
          firstKeyTarget: isInput ? activeEl : null,
          firstKeyValueBefore: isInput ? activeEl.value : "",
          isScanning: false,
          reverted: false,
          timeoutId: setTimeout(() => {
            resetScannerState();
          }, SCAN_TIMEOUT_MS),
        };
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

  // Grand totals across all cart items
  const grandTotalCost = Number(
    cart
      .reduce((sum, it) => sum + (Number(it.unitPurchaseCost) || 0) * (Number(it.quantity) || 1), 0)
      .toFixed(2)
  );

  const grandTotalSale = Number(
    cart
      .reduce((sum, it) => {
        const unitVal =
          it.unitSellingPrice !== undefined && it.unitSellingPrice !== ""
            ? Number(it.unitSellingPrice)
            : Number(it.sellingPrice) || 0;
        const qty = Number(it.quantity) || 1;
        return sum + (unitVal * qty);
      }, 0)
      .toFixed(2)
  );

  const grandTotalUnits = cart.reduce((sum, it) => sum + (Number(it.quantity) || 1), 0);
  const netDiff = Number((grandTotalSale - grandTotalCost).toFixed(2));
  const isProfit = netDiff > 0;
  const isLoss = netDiff < 0;

  // Submit Multi-Item Sale Order to Backend
  const handleCompleteSale = async (e) => {
    e.preventDefault();
    if (cart.length === 0) {
      setSaleError("Your sales cart is empty. Add products to proceed.");
      return;
    }

    // Validate that all items have valid prices and quantities
    for (const it of cart) {
      const price = Number(
        it.unitSellingPrice !== undefined && it.unitSellingPrice !== ""
          ? it.unitSellingPrice
          : it.sellingPrice
      );
      if (
        (it.unitSellingPrice === "" && it.sellingPrice === "") ||
        isNaN(price) ||
        price <= 0
      ) {
        setSaleError(`Please enter a valid selling price per unit for "${it.productName}".`);
        return;
      }
      if (!it.isSmallItem && (it.quantity <= 0 || it.quantity > it.availableQuantity)) {
        setSaleError(
          `Invalid quantity for "${it.productName}". Available: ${it.availableQuantity}, requested: ${it.quantity}.`
        );
        return;
      }
      if (it.isSmallItem && it.quantity <= 0) {
        setSaleError(`Invalid quantity for "${it.productName}". Minimum is 1.`);
        return;
      }
    }

    // Customer Name is Compulsory
    const custTrimmed = customerName.trim();
    if (!custTrimmed) {
      setSaleError("Customer name is compulsory. Please enter or select a customer name before completing the sale.");
      customerInputRef.current?.focus();
      return;
    }

    // Prompt user confirmation via SweetAlert popup
    const matchedCustomer = existingCustomers.find(
      (c) => c && c.name && c.name.toLowerCase() === custTrimmed.toLowerCase()
    );

    const result = await Swal.fire({
      title: "Are you sure?",
      text: `Do you want to complete this sale${custTrimmed ? ` for customer "${custTrimmed}"` : ""} for ${cart.length} item(s) totaling ${formatUnit(grandTotalSale)}?`,
      icon: "question",
      showCancelButton: true,
      confirmButtonColor: "#212529",
      cancelButtonColor: "#6c757d",
      confirmButtonText: "Yes, Complete Sale!",
      cancelButtonText: "Cancel",
      reverseButtons: true,
    });

    if (!result.isConfirmed) {
      return;
    }

    setIsSubmittingSale(true);
    setSaleError(null);

    try {
      const payload = {
        items: cart.map((it) => {
          const unitPriceVal = Number(
            it.unitSellingPrice !== undefined && it.unitSellingPrice !== ""
              ? it.unitSellingPrice
              : it.sellingPrice
          ) || 0;
          const qty = Number(it.quantity) || 1;
          const lineTotal = Number((unitPriceVal * qty).toFixed(2));
          const cleanBarcodes = Array.isArray(it.barcodes)
            ? it.barcodes.filter(
              (b) =>
                b &&
                typeof b === "string" &&
                b.trim() !== "" &&
                b.toUpperCase() !== "N/A"
            )
            : [];

          const isSmall = Boolean(it.isSmallItem);
          return {
            stockId: isSmall ? null : it.stockId,
            productName: it.productName,
            storage: it.storage || "",
            color: it.color || "",
            barcodes: cleanBarcodes,
            stockItemIds: Array.isArray(it.stockItemIds) ? it.stockItemIds.filter(Boolean) : [],
            barcode:
              cleanBarcodes[0] ||
              (it.barcode && it.barcode.toUpperCase() !== "N/A"
                ? it.barcode.trim()
                : "N/A"),
            quantity: qty,
            totalAmount: lineTotal,
            sellingPrice: unitPriceVal,
            unitPurchaseCost: it.unitPurchaseCost || 0,
            costPrice: it.unitPurchaseCost || 0,
            isSmallItem: isSmall,
            category: isSmall ? "Small Item" : (it.category || "General"),
            supplier: isSmall ? "Small Item / Counter" : (it.supplier || "Unknown Supplier"),
            description: (it.description || saleNotes || "").trim(),
          };
        }),
        paymentMethod: paymentMethod || "Cash",
        customerName: custTrimmed,
        customerId: matchedCustomer ? (matchedCustomer._id || null) : null,
        billDescription: saleNotes.trim(),
        description: saleNotes.trim(),
        notes: custTrimmed
          ? `Customer: ${custTrimmed}${saleNotes ? ` - ${saleNotes.trim()}` : ""}`
          : (saleNotes ? saleNotes.trim() : ""),
      };

      const res = await api.post("/sales", payload);

      if (res.data?.success) {
        const sale = res.data.data.sale;
        if (!sale.customerName && custTrimmed) {
          sale.customerName = custTrimmed;
        }
        if (!sale.billDescription && saleNotes.trim()) {
          sale.billDescription = saleNotes.trim();
        }
        if (!sale.description && saleNotes.trim()) {
          sale.description = saleNotes.trim();
        }
        setCompletedSaleData(sale);
        // setToastMessage(`Sale ${sale.saleNumber} completed successfully!`);

        // Refresh inventory in background
        fetchInventory(null, false);

        // Refresh customer list in background
        api
          .get("/customers?limit=100")
          .then((r) => {
            if (r.data?.success && Array.isArray(r.data.data)) {
              setExistingCustomers(r.data.data);
            }
          })
          .catch(() => {});

        // Reset cart and customer name
        setCart([]);
        setCustomerName("");
        setSaleNotes("");
      } else {
        setSaleError(res.data?.message || "Failed to process sale.");
      }
    } catch (err) {
      console.error("Sale submission error:", err);
      setSaleError(
        err.response?.data?.message || err.message || "Failed to complete sale transaction."
      );
    } finally {
      setIsSubmittingSale(false);
    }
  };

  return (
    <div className="container-fluid p-0 d-flex flex-column flex-grow-1">
      {/* Toast Alert */}
      {toastMessage && (
        <div
          className="alert alert-success alert-dismissible fade show position-fixed top-0 end-0 m-3 shadow-lg z-3 py-2 px-3"
          style={{ maxWidth: "380px" }}
          role="alert"
        >
          <div className="d-flex align-items-center gap-2">
            <FiCheckCircle className="text-success flex-shrink-0" size={18} />
            <span className="small fw-semibold text-dark">{toastMessage}</span>
          </div>
          <button
            type="button"
            className="btn-close"
            onClick={() => setToastMessage(null)}
            aria-label="Close"
          />
        </div>
      )}

      {/* POS 2-Column Workstation */}
      <div className="row g-3 flex-grow-1 align-items-stretch" style={{ minHeight: "calc(100vh - 125px)" }}>
        {/* ========================================================
            COLUMN 1 (Left - col-12 col-lg-7 col-xl-7): Inventory Catalog & Scanner
           ======================================================== */}
        <div className="col-12 col-lg-7 col-xl-7 d-flex flex-column">
          <div className="card border shadow-sm rounded-3 bg-white flex-grow-1 d-flex flex-column overflow-hidden h-100">
            {/* Catalog Header with Unified Real-time Debounced Search & Barcode Scanner */}
            <div className="card-header bg-white border-bottom py-2 px-3 flex-shrink-0">
              <div className="row g-2 align-items-center">
                <div className="col-12">
                  <div className="input-group input-group-sm">
                    <span className="input-group-text bg-white text-secondary border-end-0">
                      <FiSearch size={14} />
                    </span>
                    <input
                      ref={searchInputRef}
                      type="text"
                      className="form-control form-control-sm border-start-0"
                      placeholder="Search product, IEMI, supplier... (or scan IEMI & press Enter)"
                      value={searchQuery}
                      onChange={handleSearchChange}
                      onKeyDown={handleSearchKeyDown}
                      autoFocus
                    />
                    {(isDebouncing || isLoadingInventory || isScanning) && (
                      <span className="input-group-text bg-white border-start-0 py-0 px-2">
                        <span
                          className="spinner-border spinner-border-sm text-secondary"
                          style={{ width: "12px", height: "12px" }}
                          role="status"
                        />
                      </span>
                    )}
                    {searchQuery && (
                      <button
                        type="button"
                        className="btn btn-outline-secondary"
                        onClick={handleClearSearch}
                        title="Clear search"
                      >
                        <FiX size={12} />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Filter Pills & Sorting */}
              <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mt-2 pt-2 border-top">
                <div className="d-flex gap-2 flex-wrap">
                  <button
                    type="button"
                    className={`btn btn-sm py-1 px-3 rounded-pill ${stockStatusFilter === "in_stock"
                        ? "btn-dark text-white shadow-sm"
                        : "btn-outline-secondary bg-white text-secondary"
                      }`}
                    style={{ fontSize: "0.72rem" }}
                    onClick={() => setStockStatusFilter("in_stock")}
                  >
                    In Stock Only
                  </button>

                  <button
                    type="button"
                    className={`btn btn-sm py-1 px-3 rounded-pill ${stockStatusFilter === "low_stock"
                        ? "btn-warning text-dark fw-semibold shadow-sm"
                        : "btn-outline-secondary bg-white text-secondary"
                      }`}
                    style={{ fontSize: "0.72rem" }}
                    onClick={() => setStockStatusFilter("low_stock")}
                  >
                    Low Stock (≤20)
                  </button>

                  <button
                    type="button"
                    className={`btn btn-sm py-1 px-3 rounded-pill ${stockStatusFilter === "all"
                        ? "btn-dark text-white shadow-sm"
                        : "btn-outline-secondary bg-white text-secondary"
                      }`}
                    style={{ fontSize: "0.72rem" }}
                    onClick={() => setStockStatusFilter("all")}
                  >
                    All Catalog
                  </button>
                </div>

                <div className="d-flex align-items-center gap-2">
                  <span className="text-secondary small" style={{ fontSize: "0.72rem" }}>
                    {searchQuery.trim()
                      ? `Showing: ${filteredInventory.length} of ${totalCount || inventory.length}`
                      : `Total Catalog: ${totalCount || inventory.length}`}
                  </span>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary py-0 px-2 d-inline-flex align-items-center gap-1"
                    style={{ fontSize: "0.72rem", height: "24px" }}
                    onClick={() => fetchInventory(null, false)}
                    title="Refresh inventory"
                  >
                    <FiRefreshCw size={11} />
                    <span>Refresh</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Inventory List (Scrollable) */}
            <div className="card-body p-0 flex-grow-1 overflow-y-auto">
              {isLoadingInventory ? (
                <div className="p-4 text-center">
                  <div className="spinner-border spinner-border-sm text-dark mb-2" role="status" />
                  <p className="small text-secondary mb-0">Querying database inventory...</p>
                </div>
              ) : filteredInventory.length === 0 ? (
                <div className="p-5 text-center text-secondary">
                  <FiPackage size={36} className="opacity-40 mb-2" />
                  <h6 className="fw-bold text-dark mb-1">No Matching Stock Found</h6>
                  <p className="small text-muted mb-2">
                    {searchQuery
                      ? `No items match "${searchQuery}". Try a different keyword.`
                      : "No inventory items registered in this category."}
                  </p>
                  {searchQuery && (
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-dark px-3 py-1 shadow-sm"
                      onClick={handleClearSearch}
                    >
                      Clear Search
                    </button>
                  )}
                </div>
              ) : (
                <div className="table-responsive overflow-x-hidden">
                  <table
                    className="table table-hover align-middle mb-0 w-100"
                    style={{ fontSize: "0.78rem" }}
                  >
                    <thead className="table-light text-secondary sticky-top">
                      <tr>
                        <th className="ps-3 py-2" style={{ width: "28%" }}>Product Name</th>
                        <th className="py-2" style={{ width: "16%" }}>IEMI</th>
                        <th className="py-2 text-center" style={{ width: "18%" }}>Available</th>
                        <th className="py-2 text-end" style={{ width: "18%" }}>Unit Cost</th>
                        <th className="py-2 text-center pe-3" style={{ width: "20%", minWidth: "100px" }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredInventory.map((item) => {
                        const targetBarcode = resolveTargetBarcode(item, searchQuery);
                        const isBarcodeSearched = Boolean(
                          searchQuery &&
                          searchQuery.trim() &&
                          targetBarcode &&
                          targetBarcode.toLowerCase().includes(searchQuery.trim().toLowerCase())
                        );

                        const inCartItem = cart.find((c) => c.stockId === item._id);
                        let isThisBarcodeInCart = false;
                        if (targetBarcode && inCartItem) {
                          const lower = targetBarcode.toLowerCase();
                          const inCartCount = (inCartItem.barcodes || []).filter(
                            (b) => b && b.toLowerCase() === lower
                          ).length;
                          const serializedUnits = Array.isArray(item.serializedUnits) ? item.serializedUnits : [];
                          const totalAvailForBc =
                            serializedUnits.filter(
                              (u) => u.barcode && u.barcode.toLowerCase() === lower && u.status === "available"
                            ).length || (item.barcodes || []).filter((b) => b && b.toLowerCase() === lower).length || 1;
                          isThisBarcodeInCart = inCartCount >= totalAvailForBc;
                        }

                        // If user searched for a specific barcode, determine inCart state for this row by THAT barcode
                        const inCart = isBarcodeSearched ? isThisBarcodeInCart : Boolean(inCartItem);
                        const isOutOfStock = item.quantity <= 0;
                        const isLow = item.quantity > 0 && item.quantity <= 20;

                        return (
                          <tr
                            key={item._id}
                            className={`cursor-pointer ${inCart ? "pos-sale-row-selected" : ""
                              }`}
                            onClick={() => {
                              if (isOutOfStock) return;
                              if (inCart) {
                                if (isBarcodeSearched && targetBarcode) {
                                  removeBarcodeFromCart(item._id, targetBarcode);
                                } else {
                                  removeFromCart(item._id);
                                }
                              } else {
                                addToCart(item, targetBarcode);
                              }
                            }}
                            style={{ cursor: isOutOfStock ? "not-allowed" : "pointer" }}
                          >
                            <td className="ps-3 py-2">
                              <span className="fw-bold text-dark d-flex align-items-center gap-1 text-truncate" style={{ maxWidth: "200px" }} title={item.productName}>
                                <span className="text-truncate">{item.productName}</span>
                                {item.storage && (
                                  <span
                                    className="badge bg-primary-subtle text-primary border border-primary-subtle flex-shrink-0"
                                    style={{ fontSize: "0.6rem", fontWeight: "600", padding: "1px 4px" }}
                                  >
                                    {item.storage}
                                  </span>
                                )}
                                {item.color && (
                                  <span
                                    className="badge bg-secondary-subtle text-secondary border border-secondary-subtle flex-shrink-0"
                                    style={{ fontSize: "0.6rem", fontWeight: "600", padding: "1px 4px" }}
                                  >
                                    {item.color}
                                  </span>
                                )}
                                {item.isLocalPurchase && (
                                  <span
                                    className="badge bg-danger-subtle text-danger border border-danger-subtle flex-shrink-0"
                                    style={{ fontSize: "0.6rem", fontWeight: "600", padding: "1px 4px" }}
                                  >
                                    Local
                                  </span>
                                )}
                              </span>
                            </td>

                            <td className="py-2 text-secondary font-monospace" style={{ fontSize: "0.74rem" }}>
                              {(() => {
                                const rawCount =
                                  item.barcodesCount ||
                                  (item.barcodes
                                    ? item.barcodes.length
                                    : item.barcode && item.barcode.toUpperCase() !== "N/A"
                                      ? 1
                                      : 0);

                                if (rawCount === 0) {
                                  return <span className="text-muted small">N/A</span>;
                                }

                                if (rawCount > 1) {
                                  return (
                                    <div>
                                      <button
                                        type="button"
                                        className="btn btn-sm btn-outline-dark py-0 px-2 rounded-pill font-monospace d-inline-flex align-items-center gap-1 shadow-sm text-nowrap"
                                        style={{ fontSize: "0.72rem", cursor: "pointer" }}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          openBarcodesModal(item);
                                        }}
                                        title={`Click to view all ${rawCount} IEMI numbers for ${item.productName}`}
                                      >
                                        <FiTag size={11} className="text-primary flex-shrink-0" />
                                        <span className="fw-bold">{rawCount} IEMI Numbers</span>
                                      </button>
                                      {isBarcodeSearched && targetBarcode && (
                                        <div
                                          className="font-monospace text-primary fw-bold mt-1"
                                          style={{ fontSize: "0.72rem" }}
                                          title={`Matched IMEI: ${targetBarcode}`}
                                        >
                                          ✓ {targetBarcode}
                                        </div>
                                      )}
                                    </div>
                                  );
                                }

                                const singleBc =
                                  (item.barcodes && item.barcodes[0]) || item.barcode;
                                return (
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-light border py-0 px-2 rounded-2 font-monospace text-dark d-inline-flex align-items-center gap-1 text-nowrap"
                                    style={{ fontSize: "0.72rem", cursor: "pointer" }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openBarcodesModal(item);
                                    }}
                                    title={`Click to view IEMI details (${singleBc})`}
                                  >
                                    <FiTag size={10} className="text-secondary flex-shrink-0" />
                                    <span>{singleBc}</span>
                                  </button>
                                );
                              })()}
                            </td>

                            <td className="py-2 text-center">
                              <span
                                className={`text-dark fw-bold px-2 py-1 ${isOutOfStock
                                    ? " text-danger"
                                    : isLow
                                      ? " text-warning "
                                      : " text-success "
                                  }`}
                              >
                                {isOutOfStock ? "0 Out of Stock" : item.quantity}
                              </span>
                            </td>

                            <td
                              className="py-2 text-end fw-semibold text-secondary text-nowrap"
                              title={formatFullAmount(item.unitPrice || 0)}
                            >
                              {formatUnit(item.unitPrice || 0)}
                            </td>

                            <td className="py-2 text-center pe-3 text-nowrap">
                              <button
                                type="button"
                                className={`btn btn-sm py-1 px-2 rounded-2 d-inline-flex align-items-center justify-content-center gap-1 text-nowrap ${inCart
                                    ? "btn-dark text-white"
                                    : "btn-outline-dark"
                                  }`}
                                style={{ fontSize: "0.72rem", whiteSpace: "nowrap" }}
                                disabled={isOutOfStock}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (isOutOfStock) return;
                                  if (inCart) {
                                    if (isBarcodeSearched && targetBarcode) {
                                      removeBarcodeFromCart(item._id, targetBarcode);
                                    } else {
                                      removeFromCart(item._id);
                                    }
                                  } else {
                                    addToCart(item, targetBarcode);
                                  }
                                }}
                                title={inCart ? "Click to deselect and remove from cart" : "Add to cart"}
                              >
                                {inCart ? <FiCheck size={11} /> : <FiPlus size={11} />}
                                <span>
                                  {inCart
                                    ? isBarcodeSearched
                                      ? "In Cart"
                                      : `In Cart (${inCartItem?.quantity || 1})`
                                    : "Add"}
                                </span>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Load More Button for Cursor Pagination */}
              {hasMore && !isLoadingInventory && (
                <div className="p-2 text-center border-top bg-light">
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-dark py-1 px-3"
                    disabled={isLoadingMore}
                    onClick={() => fetchInventory(nextCursor, true)}
                    style={{ fontSize: "0.75rem" }}
                  >
                    {isLoadingMore ? "Loading more items..." : "Load More Products"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ========================================================
            COLUMN 2 (Right - col-12 col-lg-5 col-xl-5): POS Multi-Item Cart Station
           ======================================================== */}
        <div className="col-12 col-lg-5 col-xl-5 d-flex flex-column">
          <div className="card border shadow-sm rounded-3 bg-white flex-grow-1 d-flex flex-column overflow-hidden h-100">
            {/* Terminal Header */}
            <div className="card-header bg-dark text-white py-2 px-3 d-flex justify-content-between align-items-center flex-shrink-0">
              <div className="d-flex align-items-center gap-2">
                <FiShoppingCart size={15} />
                <span className="fw-semibold small">Sales Cart ({cart.length} items)</span>
              </div>
              {cart.length > 0 && (
                <button
                  type="button"
                  className="btn btn-sm btn-outline-light py-1 px-2"
                  style={{ fontSize: "0.7rem" }}
                  onClick={handleClearCart}
                  title="Clear entire cart"
                >
                  Clear All
                </button>
              )}
            </div>

            {/* Customer Name Simple Input Strip */}
            <div className="px-3 py-2 bg-light border-bottom flex-shrink-0">
              <div className="input-group input-group-sm">
                <span
                  className="input-group-text bg-white text-secondary fw-semibold px-2"
                  style={{ fontSize: "0.75rem" }}
                >
                  <FiUser size={13} className="text-muted me-1" /> Customer <span className="text-danger fw-bold ms-0.5">*</span>:
                </span>
                <input
                  ref={customerInputRef}
                  type="text"
                  list="posCustomerSuggestions"
                  className={`form-control form-control-sm bg-white ${saleError && !customerName.trim() ? "is-invalid border-danger" : ""}`}
                  style={{ fontSize: "0.82rem" }}
                  placeholder="Enter or select customer name (Required)..."
                  value={customerName}
                  onChange={(e) => {
                    setCustomerName(e.target.value);
                    if (saleError && e.target.value.trim()) {
                      setSaleError(null);
                    }
                  }}
                  autoComplete="off"
                  required
                />
                {customerName && (
                  <button
                    type="button"
                    className="btn btn-outline-secondary px-2"
                    onClick={() => setCustomerName("")}
                    title="Clear customer name"
                  >
                    <FiX size={12} />
                  </button>
                )}
              </div>
              {saleError && !customerName.trim() && (
                <div className="text-danger small mt-1 d-flex align-items-center gap-1" style={{ fontSize: "0.72rem" }}>
                  <FiAlertCircle size={12} className="flex-shrink-0" />
                  <span>Customer name is compulsory to proceed with sale.</span>
                </div>
              )}
              <datalist id="posCustomerSuggestions">
                {existingCustomers.map((c, idx) => (
                  <option key={c._id || idx} value={c.name}>
                    {c.phone ? `${c.name} (${c.phone})` : c.name}
                  </option>
                ))}
              </datalist>
            </div>

            {/* Optional Bill Description / Terms Input */}
            <div className="px-3 py-2 bg-light border-bottom flex-shrink-0">
              <div className="input-group input-group-sm">
                <span
                  className="input-group-text bg-white text-secondary fw-semibold px-2"
                  style={{ fontSize: "0.75rem" }}
                >
                  <FiFileText size={12} className="text-muted me-1" /> Description:
                </span>
                <input
                  type="text"
                  className="form-control form-control-sm bg-white"
                  style={{ fontSize: "0.80rem" }}
                  placeholder="e.g. No warranty, No return (Optional)..."
                  value={saleNotes}
                  onChange={(e) => setSaleNotes(e.target.value)}
                  autoComplete="off"
                />
                {saleNotes && (
                  <button
                    type="button"
                    className="btn btn-outline-secondary px-2"
                    onClick={() => setSaleNotes("")}
                    title="Clear description"
                  >
                    <FiX size={12} />
                  </button>
                )}
              </div>
              {/* Quick Preset Terms Chips */}
              <div className="d-flex align-items-center gap-1 mt-1 flex-wrap">
                {["No Warranty", "No Return, No Exchange", "7 Days Checking Warranty", "LCD / Touch No Warranty"].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className={`btn btn-xs py-0 px-2 rounded-pill border ${
                      saleNotes === preset
                        ? "btn-dark text-white fw-bold shadow-xs"
                        : "btn-white bg-white text-secondary"
                    }`}
                    style={{ fontSize: "0.64rem", height: "20px", lineHeight: "18px" }}
                    onClick={() => setSaleNotes((prev) => (prev === preset ? "" : preset))}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Cart Body */}
            <div className="card-body p-3 flex-grow-1 overflow-y-auto d-flex flex-column">
              {cart.length === 0 ? (
                /* Empty Cart Placeholder */
                <div className="m-auto text-center p-4 text-secondary">
                  <div
                    className="d-inline-flex p-3 rounded-circle bg-light border mb-3"
                    style={{ width: "64px", height: "64px" }}
                  >
                    <FiShoppingCart size={32} className="text-secondary m-auto opacity-50" />
                  </div>
                  <h6 className="fw-bold text-dark mb-1">Your Sales Cart is Empty</h6>
                  <p className="small text-muted mb-3" style={{ maxWidth: "260px" }}>
                    Select products from the left catalog or scan barcodes to add multiple items to this sale bill.
                  </p>
                  <span className="badge bg-light text-secondary border px-3 py-1">
                    Ready for Checkout
                  </span>
                </div>
              ) : (
                /* Active Multi-Item Cart List */
                <form onSubmit={handleCompleteSale} className="d-flex flex-column flex-grow-1">
                  {saleError && (
                    <div className="alert alert-danger py-2 px-3 small mb-3">
                      <FiAlertCircle className="me-1" size={14} />
                      {saleError}
                    </div>
                  )}

                  {/* List of Cart Items */}
                  <div className="d-flex flex-column gap-2 mb-3">
                    {cart.map((item, idx) => {
                      const itemCost = Number(item.unitPurchaseCost || 0);
                      const unitSellingPrice =
                        item.unitSellingPrice !== undefined && item.unitSellingPrice !== ""
                          ? item.unitSellingPrice
                          : item.sellingPrice;
                      const numUnitPrice = Number(unitSellingPrice) || 0;
                      const lineCost = Number((itemCost * item.quantity).toFixed(2));
                      const lineTotal = Number((numUnitPrice * item.quantity).toFixed(2));
                      const lineDiff = Number((lineTotal - lineCost).toFixed(2));
                      const lineProfit = lineDiff > 0;
                      const lineLoss = lineDiff < 0;

                      const hasEstUnit =
                        item.estimatedSalePricePerUnit != null &&
                        !isNaN(Number(item.estimatedSalePricePerUnit));
                      const hasEstTotal =
                        item.estimatedTotalSaleValue != null &&
                        !isNaN(Number(item.estimatedTotalSaleValue));
                      const estUnitVal = hasEstUnit
                        ? Number(item.estimatedSalePricePerUnit)
                        : null;
                      const estTotalVal = hasEstTotal
                        ? Number(item.estimatedTotalSaleValue)
                        : null;
                      const currentQtyEstTotal = hasEstUnit
                        ? Number((estUnitVal * item.quantity).toFixed(2))
                        : null;

                      return (
                        <div
                          key={item.stockId || idx}
                          className="p-2 border rounded-2 bg-white shadow-sm position-relative"
                        >
                          {/* Item Header & Cancel Button */}
                          <div className="d-flex justify-content-between align-items-center mb-1">
                            <div className="d-flex align-items-center gap-2 text-truncate pe-2">
                              <span
                                className="fw-bold text-dark text-truncate"
                                style={{ fontSize: "0.85rem" }}
                                title={item.productName}
                              >
                                {item.productName}
                              </span>
                              {item.storage && (
                                <span
                                  className="badge bg-primary-subtle text-primary border border-primary-subtle flex-shrink-0"
                                  style={{ fontSize: "0.62rem", fontWeight: "600", padding: "1px 4px" }}
                                >
                                  {item.storage}
                                </span>
                              )}
                              {item.color && (
                                <span
                                  className="badge bg-secondary-subtle text-secondary border border-secondary-subtle flex-shrink-0"
                                  style={{ fontSize: "0.62rem", fontWeight: "600", padding: "1px 4px" }}
                                >
                                  {item.color}
                                </span>
                              )}
                              {item.isSmallItem && (
                                <span
                                  className="badge bg-warning text-dark border border-warning-subtle flex-shrink-0 py-1 px-2"
                                  style={{ fontSize: "0.66rem", fontWeight: 600 }}
                                >
                                  Small Item
                                </span>
                              )}
                            </div>

                            {/* Cancel / Delete Item Button */}
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-danger p-0 rounded-circle flex-shrink-0 d-inline-flex align-items-center justify-content-center"
                              style={{ width: "22px", height: "22px" }}
                              onClick={() => removeFromCart(item.stockId)}
                              title={`Remove ${item.productName} from cart`}
                            >
                              <FiTrash2 size={12} />
                            </button>
                          </div>

                          {/* Subtitle: Purchase Price & Available */}
                          <div
                            className="d-flex align-items-center flex-wrap gap-2 text-secondary mb-2"
                            style={{ fontSize: "0.72rem" }}
                          >
                            <span>
                              Purchase Price:{" "}
                              <strong className="text-dark" title={formatFullAmount(itemCost)}>
                                PKR {itemCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </strong>
                            </span>
                            {!item.isSmallItem && (
                              <>
                                <span>•</span>
                                <span>
                                  Available:{" "}
                                  <strong className="text-success fw-bold">
                                    {item.availableQuantity} pcs
                                  </strong>
                                </span>
                              </>
                            )}
                          </div>

                          {/* Estimated Pricing Panel (Stock Record Reference for Regular Items) */}
                          {!item.isSmallItem && (
                            <div
                              className="p-2 mb-2 rounded-2 border bg-light"
                              style={{ fontSize: "0.72rem" }}
                            >
                              <div className="d-flex align-items-center justify-content-between mb-1 pb-1 border-bottom">
                                <span className="fw-semibold text-secondary text-uppercase" style={{ fontSize: "0.65rem", letterSpacing: "0.5px" }}>
                                  Saved Stock Estimates
                                </span>
                                <span className="badge bg-secondary-subtle text-secondary border py-0 px-1" style={{ fontSize: "0.62rem" }}>
                                  Reference
                                </span>
                              </div>
                              <div className="d-flex justify-content-between align-items-center py-1">
                                <span className="text-muted">Est. Sale Price / Unit:</span>
                                {hasEstUnit ? (
                                  <strong className="text-dark font-monospace">
                                    PKR {estUnitVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </strong>
                                ) : (
                                  <span className="text-muted fst-italic">Not set</span>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Scanned Serialized Barcodes */}
                          {item.barcodes && item.barcodes.length > 0 && (
                            <div className="d-flex flex-wrap align-items-center gap-1 mb-2">
                              <span className="text-secondary fw-semibold" style={{ fontSize: "0.68rem" }}>
                                Barcodes ({item.barcodes.length}):
                              </span>
                              {item.barcodes.map((bc, bIdx) => (
                                <span
                                  key={bIdx}
                                  className="badge bg-light text-dark border font-monospace px-1.5 py-0.5 d-inline-flex align-items-center gap-1"
                                  style={{ fontSize: "0.68rem" }}
                                >
                                  <span>{bc}</span>
                                  <button
                                    type="button"
                                    className="btn btn-link p-0 text-muted border-0 d-inline-flex align-items-center fw-bold"
                                    style={{ fontSize: "0.75rem", lineHeight: 1, textDecoration: "none" }}
                                    onClick={() => removeBarcodeFromCart(item.stockId, bc, item.stockItemIds?.[bIdx], bIdx)}
                                    title="Remove this unit from cart"
                                  >
                                    &times;
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Actual Sale Inputs: Qty Stepper & Actual Unit Selling Price */}
                          <div className="row g-2 align-items-end mb-2">
                            {/* Quantity Stepper */}
                            <div className="col-5">
                              <label className="text-secondary fw-semibold mb-1 d-block" style={{ fontSize: "0.68rem" }}>
                                Actual Qty
                              </label>
                              <div className="input-group input-group-sm pos-cart-input-group">
                                <button
                                  type="button"
                                  className="btn btn-outline-secondary px-1"
                                  onClick={() => updateCartQty(item.stockId, item.quantity - 1)}
                                  disabled={item.quantity <= 1}
                                  title="Decrease quantity"
                                >
                                  <FiMinus size={11} />
                                </button>
                                <input
                                  type="number"
                                  className="form-control form-control-sm text-center fw-bold px-1"
                                  style={{ fontSize: "0.82rem" }}
                                  min="1"
                                  max={item.isSmallItem ? 99999 : item.availableQuantity}
                                  value={item.quantity}
                                  onChange={(e) => updateCartQty(item.stockId, e.target.value)}
                                />
                                <button
                                  type="button"
                                  className="btn btn-outline-secondary px-1"
                                  onClick={() => updateCartQty(item.stockId, item.quantity + 1)}
                                  disabled={!item.isSmallItem && item.quantity >= item.availableQuantity}
                                  title="Increase quantity"
                                >
                                  <FiPlus size={11} />
                                </button>
                              </div>
                            </div>

                            {/* Actual Selling Price Input */}
                            <div className="col-7">
                              <label className="text-secondary fw-semibold mb-1 d-block" style={{ fontSize: "0.68rem" }}>
                                Actual Unit Price (PKR)
                              </label>
                              <div className="input-group input-group-sm pos-cart-input-group">
                                <span
                                  className="input-group-text bg-white text-secondary fw-semibold px-2"
                                  style={{ fontSize: "0.7rem" }}
                                >
                                  PKR
                                </span>
                                <input
                                  type="number"
                                  step="any"
                                  min="0"
                                  className="form-control form-control-sm fw-bold text-dark text-start"
                                  style={{ fontSize: "0.82rem" }}
                                  value={unitSellingPrice}
                                  onChange={(e) => updateCartPrice(item.stockId, e.target.value)}
                                  placeholder="0.00"
                                  required
                                />
                              </div>
                            </div>
                          </div>

                          {/* Actual Line Total & Margin */}
                          <div
                            className="d-flex justify-content-between align-items-center pt-1 border-top bg-light-subtle px-1 rounded-1"
                            style={{ fontSize: "0.72rem" }}
                          >
                            <span className="text-secondary">Actual Total:</span>
                            <div className="d-flex align-items-center gap-1">
                              <strong className="text-dark font-monospace">
                                {numUnitPrice > 0
                                  ? `PKR ${lineTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                  : "PKR 0.00"}
                              </strong>
                              {numUnitPrice > 0 && (
                                <span
                                  className={`badge py-0 px-1 ${lineProfit
                                      ? "bg-success-subtle text-success border border-success-subtle"
                                      : lineLoss
                                        ? "bg-danger-subtle text-danger border border-danger-subtle"
                                        : "bg-secondary-subtle text-secondary"
                                    }`}
                                  style={{ fontSize: "0.64rem" }}
                                >
                                  {lineProfit
                                    ? `+PKR ${lineDiff.toLocaleString()}`
                                    : lineLoss
                                      ? `-PKR ${Math.abs(lineDiff).toLocaleString()}`
                                      : "Even"}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Grand Total Order Card */}
                  <div className="p-3 border rounded-3 bg-light mb-3 mt-auto">
                    <div className="d-flex justify-content-between align-items-center mb-1 small text-secondary">
                      <span>Total Units ({cart.length} items):</span>
                      <strong className="text-dark">{grandTotalUnits} pcs</strong>
                    </div>

                    <div className="d-flex justify-content-between align-items-center mb-1 small text-secondary">
                      <span>Purchase Cost:</span>
                      <strong className="text-dark" title={formatFullAmount(grandTotalCost)}>
                        {formatUnit(grandTotalCost)}
                      </strong>
                    </div>

                    <div className="d-flex justify-content-between align-items-center mb-2">
                      <span className="fw-bold text-dark fs-6">Grand Total Bill:</span>
                      <strong className="text-dark fs-5" title={formatFullAmount(grandTotalSale)}>
                        {formatUnit(grandTotalSale)}
                      </strong>
                    </div>

                    <div className="border-top pt-2">
                      {isProfit ? (
                        <div className="p-2 rounded-2 bg-success text-white d-flex justify-content-between align-items-center">
                          <span className="small fw-semibold">Net Profit:</span>
                          <strong className="fs-6" title={formatFullAmount(netDiff)}>
                            +{formatUnit(netDiff)}
                          </strong>
                        </div>
                      ) : isLoss ? (
                        <div className="p-2 rounded-2 bg-danger text-white d-flex justify-content-between align-items-center">
                          <span className="small fw-semibold">Net Loss:</span>
                          <strong className="fs-6" title={formatFullAmount(Math.abs(netDiff))}>
                            -{formatUnit(Math.abs(netDiff))}
                          </strong>
                        </div>
                      ) : (
                        <div className="p-2 rounded-2 bg-secondary text-white d-flex justify-content-between align-items-center">
                          <span className="small fw-semibold">Break Even:</span>
                          <strong>Rs. 0</strong>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Complete Sale Action Button */}
                  <div>
                    <button
                      type="submit"
                      className="btn btn-dark w-100 py-2 fw-bold d-flex align-items-center justify-content-center gap-2 shadow-sm"
                      disabled={isSubmittingSale || cart.length === 0 || grandTotalSale <= 0}
                    >
                      {isSubmittingSale ? (
                        <>
                          <div className="spinner-border spinner-border-sm" role="status" />
                          <span>Processing Sale...</span>
                        </>
                      ) : (
                        <>
                          <FiCheckCircle size={16} />
                          <span>
                            Complete Sale ({cart.length} items • {formatUnit(grandTotalSale)})
                          </span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================
          STANDARDIZED SALE RECEIPT MODAL (80mm POS Slip)
         ======================================================== */}
      {completedSaleData && (
        <SaleReceiptModal
          receipt={completedSaleData}
          onClose={() => setCompletedSaleData(null)}
        />
      )}


      {/* ========================================================
          ALL BARCODES INSPECTION MODAL
         ======================================================== */}
      {isBarcodesModalOpen && selectedProductForBarcodes && (
        <div
          className="modal fade show d-block"
          style={{ backgroundColor: "rgba(0,0,0,0.6)", zIndex: 1060 }}
          tabIndex="-1"
          role="dialog"
          onClick={() => setIsBarcodesModalOpen(false)}
        >
          <div
            className="modal-dialog modal-dialog-centered modal-dialog-scrollable"
            style={{ maxWidth: "560px" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-content border-0 shadow-lg rounded-3 overflow-hidden">
              {/* Header */}
              <div className="modal-header bg-dark text-white py-3 px-3 d-flex justify-content-between align-items-center">
                <div>
                  <div className="d-flex align-items-center gap-2">
                    <FiTag className="text-warning" size={17} />
                    <h6 className="modal-title fw-bold mb-0">
                      All Barcodes — {selectedProductForBarcodes.productName}
                    </h6>
                  </div>
                  <small className="text-white-50" style={{ fontSize: "0.74rem" }}>
                    Select any available physical unit to add it directly to this sale
                  </small>
                </div>
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  onClick={() => setIsBarcodesModalOpen(false)}
                  aria-label="Close"
                />
              </div>

              {/* Body */}
              <div className="modal-body p-3">
                {/* Metric Summary Strip */}
                <div className="row g-2 mb-3">
                  <div className="col-4">
                    <div className="p-2 border rounded-2 bg-light text-center">
                      <span className="text-muted d-block small" style={{ fontSize: "0.68rem" }}>
                        Total Physical Units
                      </span>
                      <strong className="text-dark fs-6">
                        {selectedProductForBarcodes.units?.length ||
                          selectedProductForBarcodes.barcodes?.length ||
                          0}
                      </strong>
                    </div>
                  </div>
                  <div className="col-4">
                    <div className="p-2 border border-success-subtle bg-success-subtle rounded-2 text-center">
                      <span className="text-success d-block small fw-medium" style={{ fontSize: "0.68rem" }}>
                        Available
                      </span>
                      <strong className="text-success fs-6">
                        {selectedProductForBarcodes.units?.filter((u) => u.status === "available").length ??
                          selectedProductForBarcodes.availableQuantity}
                      </strong>
                    </div>
                  </div>
                  <div className="col-4">
                    <div className="p-2 border rounded-2 bg-light text-center">
                      <span className="text-muted d-block small" style={{ fontSize: "0.68rem" }}>
                        Already Sold
                      </span>
                      <strong className="text-secondary fs-6">
                        {selectedProductForBarcodes.units?.filter((u) => u.status === "sold").length ?? 0}
                      </strong>
                    </div>
                  </div>
                </div>

                {/* Filter and Search Bar */}
                <div className="d-flex gap-2 mb-3">
                  <div className="input-group input-group-sm flex-grow-1">
                    <span className="input-group-text bg-white border-end-0 text-secondary">
                      <FiSearch size={12} />
                    </span>
                    <input
                      type="text"
                      className="form-control form-control-sm border-start-0"
                      placeholder="Search IEMI..."
                      value={barcodeFilterSearch}
                      onChange={(e) => setBarcodeFilterSearch(e.target.value)}
                    />
                    {barcodeFilterSearch && (
                      <button
                        type="button"
                        className="btn btn-outline-secondary"
                        onClick={() => setBarcodeFilterSearch("")}
                      >
                        <FiX size={12} />
                      </button>
                    )}
                  </div>

                  <div className="btn-group btn-group-sm flex-shrink-0" role="group">
                    <button
                      type="button"
                      className={`btn btn-sm ${barcodeStatusFilter === "all" ? "btn-dark" : "btn-outline-secondary"}`}
                      style={{ fontSize: "0.72rem" }}
                      onClick={() => setBarcodeStatusFilter("all")}
                    >
                      All
                    </button>
                    <button
                      type="button"
                      className={`btn btn-sm ${barcodeStatusFilter === "available" ? "btn-success" : "btn-outline-secondary"}`}
                      style={{ fontSize: "0.72rem" }}
                      onClick={() => setBarcodeStatusFilter("available")}
                    >
                      Available
                    </button>
                    <button
                      type="button"
                      className={`btn btn-sm ${barcodeStatusFilter === "sold" ? "btn-secondary text-white" : "btn-outline-secondary"}`}
                      style={{ fontSize: "0.72rem" }}
                      onClick={() => setBarcodeStatusFilter("sold")}
                    >
                      Sold
                    </button>
                  </div>
                </div>

                {/* List of Barcodes */}
                {isLoadingBarcodes ? (
                  <div className="p-4 text-center">
                    <div className="spinner-border spinner-border-sm text-dark mb-2" role="status" />
                    <p className="small text-secondary mb-0">Querying database for serialized physical units...</p>
                  </div>
                ) : filteredModalUnits.length === 0 ? (
                  <div className="p-4 text-center text-muted">
                    <FiTag size={28} className="opacity-50 mb-2" />
                    <p className="small mb-0">No IEMI numbers match your search or filter.</p>
                  </div>
                ) : (
                  <div className="d-flex flex-column gap-2 overflow-y-auto pe-1" style={{ maxHeight: "320px" }}>
                    {(() => {
                      const stockId = selectedProductForBarcodes.stockId;
                      const cartItem = cart.find(
                        (c) =>
                          c.stockId === stockId ||
                          (c.productName && c.productName.toLowerCase() === selectedProductForBarcodes.productName.toLowerCase())
                      );
                      const inCartUnitIds = new Set(
                        cartItem && Array.isArray(cartItem.stockItemIds) ? cartItem.stockItemIds.filter(Boolean) : []
                      );
                      const remainingBcCount = {};
                      if (cartItem && Array.isArray(cartItem.barcodes)) {
                        const cIds = Array.isArray(cartItem.stockItemIds) ? cartItem.stockItemIds : [];
                        cartItem.barcodes.forEach((b, idx) => {
                          const id = cIds[idx];
                          if (!id && b) {
                            const lower = b.toLowerCase();
                            remainingBcCount[lower] = (remainingBcCount[lower] || 0) + 1;
                          }
                        });
                      }
                      const allocatedCounts = {};

                      return filteredModalUnits.map((u, uIdx) => {
                        const isAvailable = u.status === "available";
                        const isSold = u.status === "sold";
                        const unitId = u._id || u.stockItemId;
                        let inCurrentCart = false;
                        if (unitId && inCartUnitIds.has(unitId)) {
                          inCurrentCart = true;
                        } else if (u.barcode) {
                          const lower = u.barcode.toLowerCase();
                          const rem = remainingBcCount[lower] || 0;
                          const alloc = allocatedCounts[lower] || 0;
                          if (alloc < rem) {
                            inCurrentCart = true;
                            allocatedCounts[lower] = alloc + 1;
                          }
                        }

                        return (
                          <div
                            key={u._id || `${u.barcode}-${uIdx}`}
                            className={`d-flex align-items-center justify-content-between p-2 rounded-2 border ${inCurrentCart
                                ? "bg-primary-subtle border-primary-subtle"
                                : isAvailable
                                  ? "bg-white"
                                  : "bg-light opacity-75"
                              }`}
                          >
                            <div className="d-flex align-items-center gap-2">
                              <span className="text-secondary small fw-bold font-monospace" style={{ fontSize: "0.72rem", width: "24px" }}>
                                #{uIdx + 1}
                              </span>
                              <span className="fw-bold font-monospace text-dark px-2 py-1 bg-light border rounded-1" style={{ fontSize: "0.8rem" }}>
                                {u.barcode}
                              </span>
                              {u.storage && (
                                <span className="badge bg-primary-subtle text-primary border border-primary-subtle" style={{ fontSize: "0.68rem" }}>
                                  {u.storage}
                                </span>
                              )}
                              {u.color && (
                                <span className="badge bg-secondary-subtle text-secondary border border-secondary-subtle" style={{ fontSize: "0.68rem" }}>
                                  {u.color}
                                </span>
                              )}
                              {isAvailable && !inCurrentCart && (
                                <span className="badge bg-success-subtle text-success border border-success-subtle" style={{ fontSize: "0.68rem" }}>
                                  Available
                                </span>
                              )}
                              {inCurrentCart && (
                                <span className="badge bg-primary text-white" style={{ fontSize: "0.68rem" }}>
                                  In Current Cart
                                </span>
                              )}
                              {isSold && (
                                <span className="badge bg-secondary-subtle text-secondary border" style={{ fontSize: "0.68rem" }}>
                                  Sold
                                </span>
                              )}
                              {!isAvailable && !isSold && (
                                <span className="badge bg-danger-subtle text-danger border" style={{ fontSize: "0.68rem" }}>
                                  {u.status}
                                </span>
                              )}
                            </div>

                            <div className="d-flex align-items-center gap-1">
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-secondary py-1 px-2"
                                style={{ fontSize: "0.7rem" }}
                                onClick={() => handleCopyBarcode(u.barcode)}
                                title="Copy IEMI number to clipboard"
                              >
                                {copiedBarcode === u.barcode ? (
                                  <span className="text-success fw-bold">Copied!</span>
                                ) : (
                                  "Copy"
                                )}
                              </button>

                              {isAvailable && (
                                <button
                                  type="button"
                                  className={`btn btn-sm py-1 px-2 d-inline-flex align-items-center gap-1 ${inCurrentCart
                                      ? "btn-secondary text-white"
                                      : "btn-dark text-white"
                                    }`}
                                  style={{ fontSize: "0.7rem" }}
                                  onClick={() => {
                                    if (inCurrentCart) {
                                      removeBarcodeFromCart(selectedProductForBarcodes.stockId, u.barcode, u._id);
                                    } else {
                                      handleAddUnitFromModal(u);
                                    }
                                  }}
                                  title={inCurrentCart ? "Click to remove this physical unit from cart" : "Add this exact physical IEMI to cart"}
                                >
                                  {inCurrentCart ? (
                                    <>
                                      <FiCheckCircle size={11} />
                                      <span>In Cart</span>
                                    </>
                                  ) : (
                                    <>
                                      <FiPlus size={11} />
                                      <span>Add</span>
                                    </>
                                  )}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="modal-footer bg-light py-2 px-3">
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  onClick={() => setIsBarcodesModalOpen(false)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}




    </div>
  );
}
