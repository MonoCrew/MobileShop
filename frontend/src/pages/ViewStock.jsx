import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { FiDownload, FiPlus, FiAlertCircle, FiRefreshCw } from "react-icons/fi";
import api from "../api/axios";

// View Stock Components
import StockStatsHeader from "../components/view-stock/StockStatsHeader";
import StockToolbar from "../components/view-stock/StockToolbar";
import StockFilterChips from "../components/view-stock/StockFilterChips";
import StockFiltersModal from "../components/view-stock/StockFiltersModal";
import StockVirtualTable from "../components/view-stock/StockVirtualTable";
import StockVirtualGrid from "../components/view-stock/StockVirtualGrid";
import StockVirtualCompact from "../components/view-stock/StockVirtualCompact";
import StockSkeleton from "../components/view-stock/StockSkeleton";
import StockEmptyState from "../components/view-stock/StockEmptyState";
import GiveToShopkeeperModal from "../components/view-stock/GiveToShopkeeperModal";
import StockDetailModal from "../components/view-stock/StockDetailModal";

const CHUNK_LIMIT = 50;

export default function ViewStock() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // URL Query Parameters Parsing
  const urlSearch = searchParams.get("search") || "";
  const urlProductName = searchParams.get("productName") || searchParams.get("name") || "";
  const urlMinPrice = searchParams.get("minPrice") || "";
  const urlMaxPrice = searchParams.get("maxPrice") || "";
  const urlStockStatus = searchParams.get("stockStatus") || "";
  const urlPaymentStatus = searchParams.get("paymentStatus") || "";
  const urlSupplier = searchParams.get("supplierId") || searchParams.get("supplier") || "";
  const urlSort = searchParams.get("sort") || "newest";
  const urlView = searchParams.get("view") || "table";
  const urlStockMode = searchParams.get("stockMode") || "batch";

  // Resolved Supplier Object for active filter chip display
  const [selectedSupplierObj, setSelectedSupplierObj] = useState(null);

  useEffect(() => {
    if (!urlSupplier) {
      setSelectedSupplierObj(null);
      return;
    }
    let isCancelled = false;
    api
      .get(`/suppliers/${encodeURIComponent(urlSupplier)}`)
      .then((res) => {
        if (!isCancelled && res.data?.success && res.data?.data) {
          setSelectedSupplierObj(res.data.data);
        }
      })
      .catch(() => {});

    return () => {
      isCancelled = true;
    };
  }, [urlSupplier]);

  // Local Immediate Search Input State for 400ms Debouncing
  const [searchInput, setSearchInput] = useState(urlSearch);
  const [isDebouncing, setIsDebouncing] = useState(false);
  const searchInputRef = useRef(null);

  // Filter Drawer State
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);

  // Shopkeeper Consignment Transfer Modal State
  const [giveShopkeeperModalItem, setGiveShopkeeperModalItem] = useState(null);

  // Stock Detail Modal State
  const [selectedDetailStock, setSelectedDetailStock] = useState(null);

  // Core Stock Data & Pagination State (Source of Truth)
  const [stocks, setStocks] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(null);
  const [isLoadingInitial, setIsLoadingInitial] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  // Stats State
  const [stats, setStats] = useState(null);
  const [isLoadingStats, setIsLoadingStats] = useState(true);

  // Request Cancellation & In-flight Refs to prevent race conditions & duplicate requests
  const abortControllerRef = useRef(null);
  const isFetchingRef = useRef(false);

  // Sync search input if URL changes externally
  useEffect(() => {
    setSearchInput(urlSearch);
  }, [urlSearch]);

  // Fetch Filtered Inventory Summary Cards directly from MongoDB aggregation
  const fetchStats = useCallback(async () => {
    try {
      setIsLoadingStats(true);
      const params = {};
      if (urlStockMode) params.stockMode = urlStockMode;
      if (urlSearch.trim()) params.search = urlSearch.trim();
      if (urlProductName.trim()) params.productName = urlProductName.trim();
      if (urlMinPrice !== "") params.minPrice = urlMinPrice;
      if (urlMaxPrice !== "") params.maxPrice = urlMaxPrice;
      if (urlStockStatus) params.stockStatus = urlStockStatus;
      if (urlPaymentStatus) params.paymentStatus = urlPaymentStatus;
      if (urlSupplier.trim()) params.supplierId = urlSupplier.trim();

      const res = await api.get("/stock/stats", { params });
      if (res.data?.success) {
        setStats(res.data.data);
      }
    } catch (err) {
      console.error("Failed to load inventory statistics:", err);
      setStats({
        totalProducts: 0,
        totalUnits: 0,
        inventoryValue: 0,
        paidToSuppliers: 0,
        remainingToSuppliers: 0,
      });
    } finally {
      setIsLoadingStats(false);
    }
  }, [
    urlStockMode,
    urlSearch,
    urlProductName,
    urlMinPrice,
    urlMaxPrice,
    urlStockStatus,
    urlPaymentStatus,
    urlSupplier,
  ]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Helper to build search param updates cleanly
  const updateUrlParams = useCallback(
    (updates) => {
      const next = new URLSearchParams(searchParams);
      Object.entries(updates).forEach(([key, val]) => {
        if (val === "" || val === null || val === undefined) {
          next.delete(key);
        } else {
          next.set(key, String(val));
        }
      });
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  // Debounced search handler: updates URL after 400ms of typing inactivity
  useEffect(() => {
    if (searchInput === urlSearch) {
      setIsDebouncing(false);
      return;
    }

    setIsDebouncing(true);
    const timer = setTimeout(() => {
      setIsDebouncing(false);
      updateUrlParams({ search: searchInput.trim() });
    }, 400);

    return () => clearTimeout(timer);
  }, [searchInput, urlSearch, updateUrlParams]);

  // High-Precision Hardware Barcode Scanner State Machine
  const scannerState = useRef({
    buffer: "",
    lastKeystrokeTime: 0,
    firstKeyChar: null,
    firstKeyTarget: null,
    firstKeyValueBefore: "",
    isScanning: false,
    reverted: false,
    timeoutId: null,
  });

  // Action on Complete: Update input, autofocus input, trigger immediate query, clear buffer
  const handleBarcodeScanned = useCallback(
    (scannedBarcode) => {
      if (!scannedBarcode) return;
      const cleanCode = scannedBarcode.trim();
      if (!cleanCode) return;

      // Close filter drawer if open to prioritize search results
      setIsFilterModalOpen(false);

      // 1. Update search input state
      setSearchInput(cleanCode);
      setIsDebouncing(false);

      // 2. Trigger immediate query without waiting for debounce
      updateUrlParams({ search: cleanCode });

      // 3. Automatically populate DOM input and highlight the search input field
      if (searchInputRef.current) {
        searchInputRef.current.value = cleanCode;
        searchInputRef.current.focus();
        searchInputRef.current.select?.();
      }
    },
    [updateUrlParams]
  );

  const handleImmediateSearch = useCallback(
    (term) => {
      const query = (term !== undefined ? term : searchInput).trim();
      setIsDebouncing(false);
      updateUrlParams({ search: query || null });
    },
    [searchInput, updateUrlParams]
  );

  // Global Hardware Barcode Scanner Listener
  useEffect(() => {
    // Inter-keystroke threshold for hardware scanners: typically < 30–50ms
    const RAPID_KEY_INTERVAL_MS = 50;
    const SCAN_TIMEOUT_MS = 80;
    const MIN_BARCODE_LENGTH = 3;

    const resetScannerState = () => {
      if (scannerState.current.timeoutId) {
        clearTimeout(scannerState.current.timeoutId);
      }
      scannerState.current = {
        buffer: "",
        lastKeystrokeTime: 0,
        firstKeyChar: null,
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

      const now = Date.now();

      // Handle terminating Enter (or Tab) key
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
            handleBarcodeScanned(code);
          }
          return;
        }

        return;
      }

      // Handle single printable characters (exclude Ctrl/Alt/Meta combos)
      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const timeDelta = scannerState.current.lastKeystrokeTime
          ? now - scannerState.current.lastKeystrokeTime
          : 999999;

        // If burst has already confirmed scanner active:
        if (scannerState.current.isScanning) {
          e.preventDefault();
          e.stopPropagation();

          scannerState.current.buffer += e.key;
          scannerState.current.lastKeystrokeTime = now;

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
              handleBarcodeScanned(code);
            } else {
              resetScannerState();
            }
          }, SCAN_TIMEOUT_MS);

          return;
        }

        // Check if incoming key arrived rapidly (time delta <= 50ms)
        const isRapid = timeDelta <= RAPID_KEY_INTERVAL_MS;

        if (isRapid && scannerState.current.buffer.length > 0) {
          // Hardware scanner detected!
          e.preventDefault();
          e.stopPropagation();

          scannerState.current.isScanning = true;
          scannerState.current.buffer += e.key;
          scannerState.current.lastKeystrokeTime = now;

          // Revert first character if it leaked into an active focused input
          if (!scannerState.current.reverted) {
            scannerState.current.reverted = true;
            const target = scannerState.current.firstKeyTarget;
            const valBefore = scannerState.current.firstKeyValueBefore;

            if (target && target !== searchInputRef.current) {
              target.value = valBefore;
              target.blur?.();
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
              handleBarcodeScanned(code);
            } else {
              resetScannerState();
            }
          }, SCAN_TIMEOUT_MS);

          return;
        }

        // Potential first key of a new scan (or normal human typing)
        const activeEl = document.activeElement;
        const isInput =
          activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA");

        if (scannerState.current.timeoutId) {
          clearTimeout(scannerState.current.timeoutId);
        }

        scannerState.current = {
          buffer: e.key,
          lastKeystrokeTime: now,
          firstKeyChar: e.key,
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
  }, [handleBarcodeScanned]);

  // Active filter count for badge
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (urlProductName.trim() !== "") count++;
    if (urlMinPrice !== "") count++;
    if (urlMaxPrice !== "") count++;
    if (urlPaymentStatus !== "") count++;
    if (urlSupplier !== "") count++;
    return count;
  }, [urlProductName, urlMinPrice, urlMaxPrice, urlPaymentStatus, urlSupplier]);

  const hasAnyFilter = activeFilterCount > 0 || !!urlSearch.trim();

  /**
   * Primary Database Fetch Function: Keyset Pagination & Server-Side Filtering
   * When cursor is null: Resets list and loads first 50 items.
   * When cursor is provided: Appends next 50 items.
   */
  const loadStockData = useCallback(
    async ({ cursor = null, isInitial = false } = {}) => {
      // Abort previous in-flight request to prevent race conditions
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        // Synchronously reset the guard so this new call can proceed,
        // since the aborted call's finally block runs asynchronously.
        isFetchingRef.current = false;
      }

      // Prevent duplicate simultaneous requests (checked after abort so
      // a StrictMode re-mount can cancel the previous and start fresh)
      if (isFetchingRef.current) return;

      const controller = new AbortController();
      abortControllerRef.current = controller;
      isFetchingRef.current = true;

      if (isInitial) {
        setIsLoadingInitial(true);
        setErrorMessage(null);
      } else {
        setIsLoadingMore(true);
      }

      try {
        const params = {
          limit: CHUNK_LIMIT,
          sort: urlSort,
          stockMode: urlStockMode,
        };

        if (cursor) params.cursor = cursor;
        if (urlSearch.trim()) params.search = urlSearch.trim();
        if (urlProductName.trim()) params.productName = urlProductName.trim();
        if (urlMinPrice !== "") params.minPrice = urlMinPrice;
        if (urlMaxPrice !== "") params.maxPrice = urlMaxPrice;
        if (urlStockStatus) params.stockStatus = urlStockStatus;
        if (urlPaymentStatus) params.paymentStatus = urlPaymentStatus;
        if (urlSupplier.trim()) params.supplierId = urlSupplier.trim();

        const response = await api.get("/stock", {
          params,
          signal: controller.signal,
        });

        if (response.data?.success) {
          const { data = [], nextCursor: newCursor = null, hasMore: more = false, totalCount: total } =
            response.data;

          if (isInitial) {
            setStocks(data);
            if (typeof total === "number") {
              setTotalCount(total);
            }
          } else {
            // Append next chunk without duplicates
            setStocks((prev) => {
              const existingIds = new Set(prev.map((i) => i._id));
              const freshItems = data.filter((i) => !existingIds.has(i._id));
              return [...prev, ...freshItems];
            });
          }

          setNextCursor(newCursor);
          setHasMore(more);
          setErrorMessage(null);
        }
      } catch (err) {
        // Ignore aborted requests
        if (err.name === "CanceledError" || err.code === "ERR_CANCELED" || controller.signal.aborted) {
          return;
        }
        console.error("Error loading stock from database:", err);
        setErrorMessage(
          err.response?.data?.message || "Failed to load stock data. Please check your connection."
        );
      } finally {
        if (!controller.signal.aborted) {
          isFetchingRef.current = false;
          if (isInitial) {
            setIsLoadingInitial(false);
          } else {
            setIsLoadingMore(false);
          }
        }
      }
    },
    [
      urlStockMode,
      urlSearch,
      urlProductName,
      urlMinPrice,
      urlMaxPrice,
      urlStockStatus,
      urlPaymentStatus,
      urlSupplier,
      urlSort,
    ]
  );

  // Trigger fresh initial fetch from database whenever search, filters, or sort change
  useEffect(() => {
    loadStockData({ cursor: null, isInitial: true });

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [loadStockData]);

  // Next 50-chunk fetch handler triggered proactively by virtualizer near ~80% scroll
  const handleLoadMore = useCallback(() => {
    if (!hasMore || isLoadingMore || isLoadingInitial || isFetchingRef.current || !nextCursor) {
      return;
    }
    loadStockData({ cursor: nextCursor, isInitial: false });
  }, [hasMore, isLoadingMore, isLoadingInitial, nextCursor, loadStockData]);

  // Filter actions
  const handleApplyFilters = (newFilters) => {
    updateUrlParams({
      productName: newFilters.productName,
      name: null,
      minPrice: newFilters.minPrice,
      maxPrice: newFilters.maxPrice,
      stockStatus: null,
      paymentStatus: newFilters.paymentStatus,
      supplier: newFilters.supplier,
      supplierId: null,
    });
  };

  const handleResetFilters = () => {
    updateUrlParams({
      productName: null,
      name: null,
      minPrice: null,
      maxPrice: null,
      stockStatus: null,
      paymentStatus: null,
      supplier: null,
      supplierId: null,
      search: null,
    });
    setSearchInput("");
  };

  const handleRemoveSingleFilter = (key) => {
    if (key === "search") {
      setSearchInput("");
      updateUrlParams({ search: null });
    } else if (key === "productName") {
      updateUrlParams({ productName: null, name: null });
    } else if (key === "price_range") {
      updateUrlParams({ minPrice: null, maxPrice: null });
    } else if (key === "supplier") {
      updateUrlParams({ supplier: null, supplierId: null });
    } else {
      updateUrlParams({ [key]: null });
    }
  };

  const handleSortChange = (newSort) => {
    updateUrlParams({ sort: newSort });
  };

  const handleViewModeChange = (newView) => {
    updateUrlParams({ view: newView });
  };

  const handleManualRefresh = () => {
    fetchStats();
    loadStockData({ cursor: null, isInitial: true });
  };

  // CSV Export utility
  const handleExportCSV = () => {
    if (!stocks.length) return;
    const headers = [
      "Product Name",
      "IEMI Number",
      "Supplier",
      "Available Quantity",
      "Unit Price (PKR)",
      "Total Batch Price (PKR)",
      "Est. Sale Price / Unit (PKR)",
      "Est. Total Sale Value (PKR)",
      "Payment Status",
      "Created Date",
    ];

    const rows = stocks.map((s) => [
      `"${(s.productName || "").replace(/"/g, '""')}"`,
      `"${s.barcode || ""}"`,
      `"${(s.supplier?.name || (typeof s.supplier === "string" ? s.supplier : "")).replace(/"/g, '""')}"`,
      s.quantity,
      s.unitPrice,
      s.totalPrice,
      s.estimatedSalePricePerUnit != null ? s.estimatedSalePricePerUnit : "",
      s.estimatedTotalSaleValue != null ? s.estimatedTotalSaleValue : "",
      s.paymentStatus,
      s.createdAt ? new Date(s.createdAt).toISOString() : "",
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `inventory_export_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Printable Receipt handler for batch or individual stock intake
  const handlePrintReceipt = (item) => {
    if (!item) return;
    const isBatch = Boolean(item.isBatch || (item.items && item.items.length > 0));
    const receiptItems =
      isBatch && Array.isArray(item.items) && item.items.length > 0
        ? item.items.map((it) => ({
            productName: it.productName,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            subtotal: it.subtotal || it.quantity * it.unitPrice,
            barcodes: it.barcodes || [],
            category: it.category || "General",
          }))
        : [
            {
              productName: item.productName,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              subtotal: item.totalPrice,
              barcodes: item.barcodes || [],
              category: "General",
            },
          ];

    setActiveReceiptData({
      receiptNumber: item.invoiceNumber || `INV-${item._id?.toString().slice(-6) || "INTAKE"}`,
      allInvoiceNumbers: item.invoiceNumber ? [item.invoiceNumber] : [],
      date: item.purchaseDate || item.createdAt || new Date().toISOString(),
      supplier: item.supplier?.name || item.supplierName || item.customerName || "General Supplier",
      customerName: item.customerName || "",
      isLocalPurchase: Boolean(item.isLocalPurchase),
      items: receiptItems,
      totalUnits: isBatch ? (item.totalQuantity || item.quantity) : item.quantity,
      grandTotal: item.totalPrice,
      amountPaid: item.amountPaid,
      amountDue: item.amountDue,
      paymentStatus: item.paymentStatus || "Paid",
    });
  };

  return (
    <div className="container-fluid p-0 d-flex flex-column flex-grow-1 pos-hide-vscroll">
      {/* Page Header */}
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center mb-3 gap-3 flex-shrink-0">
        <div>
          <h1 className="h4 fw-bold text-dark mb-1">Stock Inventory</h1>
          <p className="text-secondary small mb-0">
            Browse, search, and manage high-volume stock with server-side keyset indexing.
          </p>
        </div>
        <div className="d-flex gap-2">
          <button
            type="button"
            className="btn btn-outline-dark btn-sm d-inline-flex align-items-center gap-2"
            onClick={handleExportCSV}
            disabled={!stocks.length}
            title="Export loaded items to CSV"
          >
            <FiDownload size={14} /> Export CSV
          </button>
          <button
            type="button"
            className="btn btn-dark btn-sm d-inline-flex align-items-center gap-2"
            onClick={() => navigate("/add-stock")}
          >
            <FiPlus size={14} /> Add Stock
          </button>
        </div>
      </div>

      {/* Real-time Inventory Summary Cards */}
      <StockStatsHeader stats={stats} loading={isLoadingStats} />

      {/* Toolbar: Debounced Search, View Switcher, Sort, Filter Drawer */}
      <StockToolbar
        search={searchInput}
        onSearchChange={setSearchInput}
        onClearSearch={() => {
          setSearchInput("");
          updateUrlParams({ search: null });
        }}
        isSearching={isDebouncing || (isLoadingInitial && !stocks.length)}
        activeFilterCount={activeFilterCount}
        onOpenFilters={() => setIsFilterModalOpen(true)}
        sort={urlSort}
        onSortChange={handleSortChange}
        viewMode={urlView}
        onViewModeChange={handleViewModeChange}
        stockMode={urlStockMode}
        onStockModeChange={(mode) => updateUrlParams({ stockMode: mode })}
        onRefresh={handleManualRefresh}
        totalCount={totalCount}
        loadedCount={stocks.length}
        isLoading={isLoadingInitial || isLoadingMore}
        searchInputRef={searchInputRef}
        onSearchSubmit={handleImmediateSearch}
      />

      {/* Active Filter Badges & Results Counter */}
      <StockFilterChips
        search={urlSearch}
        filters={{
          productName: urlProductName,
          minPrice: urlMinPrice,
          maxPrice: urlMaxPrice,
          stockStatus: urlStockStatus,
          paymentStatus: urlPaymentStatus,
          supplier: urlSupplier,
          supplierName: selectedSupplierObj?.name,
        }}
        sort={urlSort}
        totalCount={totalCount}
        loadedCount={stocks.length}
        hasMore={hasMore}
        onRemoveFilter={handleRemoveSingleFilter}
        onClearAll={handleResetFilters}
      />

      {/* Error Alert with Retry */}
      {errorMessage && (
        <div className="alert alert-danger d-flex align-items-center justify-content-between p-3 rounded-3 mb-3">
          <div className="d-flex align-items-center gap-2">
            <FiAlertCircle size={18} className="text-danger flex-shrink-0" />
            <span className="small">{errorMessage}</span>
          </div>
          <button
            type="button"
            className="btn btn-outline-danger btn-sm d-inline-flex align-items-center gap-1"
            onClick={handleManualRefresh}
          >
            <FiRefreshCw size={12} /> Retry
          </button>
        </div>
      )}

      {/* Primary Virtualized Views */}
      <div className="flex-grow-1 position-relative">
        {isLoadingInitial || isDebouncing ? (
          <StockSkeleton type={urlView} count={6} />
        ) : stocks.length === 0 ? (
          <StockEmptyState
            hasFilters={hasAnyFilter}
            onResetFilters={handleResetFilters}
          />
        ) : (
          <div key={urlView} className="pos-view-transition">
            {urlView === "table" && (
              <StockVirtualTable
                items={stocks}
                hasMore={hasMore}
                isLoadingMore={isLoadingMore}
                onLoadMore={handleLoadMore}
                isLoading={isLoadingInitial || isDebouncing}
                onGiveToShopkeeper={(item) => setGiveShopkeeperModalItem(item)}
                onViewDetail={(item) => setSelectedDetailStock(item)}
                onViewDetails={(item) => setSelectedDetailStock(item)}
              />
            )}

            {urlView === "grid" && (
              <StockVirtualGrid
                items={stocks}
                hasMore={hasMore}
                isLoadingMore={isLoadingMore}
                onLoadMore={handleLoadMore}
                onViewDetail={(item) => setSelectedDetailStock(item)}
                onViewDetails={(item) => setSelectedDetailStock(item)}
              />
            )}

            {urlView === "compact" && (
              <StockVirtualCompact
                items={stocks}
                hasMore={hasMore}
                isLoadingMore={isLoadingMore}
                onLoadMore={handleLoadMore}
                onGiveToShopkeeper={(item) => setGiveShopkeeperModalItem(item)}
                onViewDetail={(item) => setSelectedDetailStock(item)}
                onViewDetails={(item) => setSelectedDetailStock(item)}
              />
            )}
          </div>
        )}
      </div>

      {/* Offcanvas/Modal for Advanced Database Filters */}
      <StockFiltersModal
        isOpen={isFilterModalOpen}
        onClose={() => setIsFilterModalOpen(false)}
        currentFilters={{
          productName: urlProductName,
          minPrice: urlMinPrice,
          maxPrice: urlMaxPrice,
          paymentStatus: urlPaymentStatus,
          supplier: urlSupplier,
        }}
        onApplyFilters={handleApplyFilters}
        onResetFilters={handleResetFilters}
      />

      {/* Give to Another Shopkeeper Consignment Modal */}
      <GiveToShopkeeperModal
        isOpen={Boolean(giveShopkeeperModalItem)}
        stockItem={giveShopkeeperModalItem}
        onClose={() => setGiveShopkeeperModalItem(null)}
        onTransferSuccess={(result) => {
          if (result?.updatedStock) {
            setStocks((prev) =>
              prev.map((s) => {
                if (
                  s._id === result.updatedStock._id ||
                  (giveShopkeeperModalItem && s._id === giveShopkeeperModalItem._id)
                ) {
                  const transferQty = result?.transfer?.originalQuantity || 1;
                  const newQty = Math.max(0, (s.quantity ?? s.availableQuantity ?? 0) - transferQty);
                  const newTransferred = (s.transferredQuantity || 0) + transferQty;
                  return {
                    ...s,
                    quantity: newQty,
                    availableQuantity: newQty,
                    transferredQuantity: newTransferred,
                    totalPrice: result.updatedStock.totalPrice,
                  };
                }
                return s;
              })
            );
          }
          loadStockData({ isInitial: true });
          fetchStats();
        }}
      />

      {/* Stock Detail Modal Popup */}
      {selectedDetailStock && (
        <StockDetailModal
          stock={selectedDetailStock}
          onClose={() => setSelectedDetailStock(null)}
        />
      )}
    </div>
  );
}
