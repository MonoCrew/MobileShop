import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import {
  FiSearch,
  FiTruck,
  FiPackage,
  FiLayers,
  FiCalendar,
  FiCheckCircle,
  FiAlertCircle,
  FiPlus,
  FiFileText,
  FiCopy,
  FiCheck,
  FiX,
  FiRefreshCw,
  FiHash,
  FiClock,
  FiCreditCard,
  FiRotateCcw,
  FiUsers,
  FiArrowDownLeft,
  FiArrowUpRight,
} from "react-icons/fi";
import api from "../api/axios.jsx";
import DatePicker from "../components/DatePicker";
import { formatUnit, formatFullAmount } from "../utils/unitChanger";

export default function SupplierLedger() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Selected supplier name and ID from query params
  const urlSupplier = searchParams.get("supplier") || "";
  const urlSupplierId = searchParams.get("id") || "";

  // Suppliers directory state
  const [suppliers, setSuppliers] = useState([]);
  const [isLoadingSuppliers, setIsLoadingSuppliers] = useState(true);
  const [suppliersError, setSuppliersError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all"); // 'all', 'due', 'settled'
  const [entityFilter, setEntityFilter] = useState("suppliers"); // 'suppliers', 'customers'

  // Selected supplier details & ledger state
  const [selectedSupplierName, setSelectedSupplierName] = useState(urlSupplier);
  const [selectedSupplierId, setSelectedSupplierId] = useState(null);
  const [details, setDetails] = useState(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState(null);

  // Active view tab in center panel
  const [centerTab, setCenterTab] = useState("items"); // 'items' | 'payments'
  const [itemsSearchQuery, setItemsSearchQuery] = useState("");

  // Barcode inspection modal state
  const [barcodeModalItem, setBarcodeModalItem] = useState(null);
  const [copiedBarcode, setCopiedBarcode] = useState(null);

  // Global success toast notification
  const [successToast, setSuccessToast] = useState(null);

  // Settle / Pay Outstanding Debt Modal State
  const [isSettleDebtModalOpen, setIsSettleDebtModalOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState("");

  // Create Supplier Popup Modal State
  const [showCreateSupplierModal, setShowCreateSupplierModal] = useState(false);
  const [newSupplierForm, setNewSupplierForm] = useState({
    name: "",
    totalAmount: "",
    amountPaid: "",
  });
  const [createSupplierError, setCreateSupplierError] = useState("");
  const [isSubmittingSupplier, setIsSubmittingSupplier] = useState(false);

  // Real-time duplicate check disabled: multiple entities can share names as distinct records
  const isDuplicateSupplier = false;

  const initialSelectedRef = useRef(false);
  const prevUrlIdRef = useRef(urlSupplierId);
  const prevUrlSupplierRef = useRef(urlSupplier);

  // ========================================================
  // Data Fetching: Suppliers Directory
  // ========================================================
  const fetchSuppliers = useCallback(async (showSkeleton = false) => {
    try {
      if (showSkeleton) {
        setIsLoadingSuppliers(true);
      }
      setSuppliersError(null);
      const res = await api.get("/suppliers");
      if (res.data?.success && Array.isArray(res.data?.data)) {
        setSuppliers(res.data.data);

        // Auto-select on initial load only if no supplier is specified in URL
        if (!initialSelectedRef.current) {
          initialSelectedRef.current = true;
          const currentUrlSupplier = new URLSearchParams(window.location.search).get("supplier");
          const currentUrlId = new URLSearchParams(window.location.search).get("id");
          if (!currentUrlSupplier && !currentUrlId && res.data.data.length > 0) {
            // Pick from suppliers by default since entityFilter defaults to "suppliers"
            const supplierOnlyList = res.data.data.filter((s) => !s.isCustomer && s.type !== "customer");
            const targetList = supplierOnlyList.length > 0 ? supplierOnlyList : res.data.data;
            // Pick top supplier (newest / most recently active)
            const initialSelection = targetList[0];
            setSelectedSupplierName(initialSelection.name);
            setSelectedSupplierId(initialSelection._id);
            prevUrlIdRef.current = String(initialSelection._id);
            prevUrlSupplierRef.current = initialSelection.name;
            setSearchParams({ supplier: initialSelection.name, id: initialSelection._id }, { replace: true });
          } else if (currentUrlId || currentUrlSupplier) {
            const found = res.data.data.find(
              (s) =>
                (currentUrlId && String(s._id) === currentUrlId) ||
                (!currentUrlId && currentUrlSupplier && (s.name || "").toLowerCase() === currentUrlSupplier.toLowerCase())
            );
            if (found) {
              setSelectedSupplierName(found.name);
              setSelectedSupplierId(found._id);
              prevUrlIdRef.current = String(found._id);
              prevUrlSupplierRef.current = found.name;
              const isCust = Boolean(found.isCustomer || found.type === "customer");
              setEntityFilter(isCust ? "customers" : "suppliers");
            }
          }
        }
      } else {
        setSuppliers([]);
      }
    } catch (err) {
      console.error("Failed to load suppliers directory:", err);
      setSuppliersError(err.response?.data?.message || "Failed to load suppliers.");
    } finally {
      setIsLoadingSuppliers(false);
    }
  }, []);

  useEffect(() => {
    fetchSuppliers(true);
  }, [fetchSuppliers]);

  // Sync selected supplier ONLY when URL param changes externally (e.g. browser back/forward)
  useEffect(() => {
    const urlChanged =
      urlSupplierId !== prevUrlIdRef.current || urlSupplier !== prevUrlSupplierRef.current;

    prevUrlIdRef.current = urlSupplierId;
    prevUrlSupplierRef.current = urlSupplier;

    if (!urlChanged) return;

    if (urlSupplierId) {
      const found = suppliers.find((s) => String(s._id) === urlSupplierId);
      if (found) {
        setSelectedSupplierName(found.name);
        setSelectedSupplierId(found._id);
        const isCust = Boolean(found.isCustomer || found.type === "customer");
        setEntityFilter(isCust ? "customers" : "suppliers");
      }
    } else if (urlSupplier) {
      const found = suppliers.find(
        (s) => String(s._id) === urlSupplier || (s.name || "").toLowerCase() === urlSupplier.toLowerCase()
      );
      if (found) {
        setSelectedSupplierName(found.name);
        setSelectedSupplierId(found._id);
        const isCust = Boolean(found.isCustomer || found.type === "customer");
        setEntityFilter(isCust ? "customers" : "suppliers");
      }
    }
  }, [urlSupplierId, urlSupplier, suppliers]);

  // ========================================================
  // Data Fetching: Selected Supplier Details & History
  // ========================================================
  const fetchSupplierDetails = useCallback(async (identifier) => {
    if (!identifier) {
      setDetails(null);
      return;
    }
    try {
      setIsLoadingDetails(true);
      setDetailsError(null);
      const res = await api.get(`/suppliers/${encodeURIComponent(identifier)}/history`);
      if (res.data?.success && res.data?.data) {
        setDetails(res.data.data);
      } else {
        setDetails(null);
      }
    } catch (err) {
      console.error("Failed to load supplier history:", err);
      setDetailsError(err.response?.data?.message || "Failed to load history for this supplier.");
      setDetails(null);
    } finally {
      setIsLoadingDetails(false);
    }
  }, []);

  useEffect(() => {
    if (selectedSupplierId) {
      fetchSupplierDetails(selectedSupplierId);
    } else if (selectedSupplierName) {
      fetchSupplierDetails(selectedSupplierName);
    } else {
      setDetails(null);
    }
  }, [selectedSupplierId, selectedSupplierName, fetchSupplierDetails]);

  // Handle supplier card click on the left panel
  const handleSelectSupplier = (supplier) => {
    setSelectedSupplierName(supplier.name);
    setSelectedSupplierId(supplier._id);
    const isCust = Boolean(supplier.isCustomer || supplier.type === "customer");
    setEntityFilter(isCust ? "customers" : "suppliers");
    prevUrlIdRef.current = String(supplier._id);
    prevUrlSupplierRef.current = supplier.name;
    setSearchParams({ supplier: supplier.name, id: supplier._id }, { replace: true });
    setPaymentAmount("");
    setPaymentError("");
    setIsSettleDebtModalOpen(false);
  };

  // Instant active supplier reference from the loaded directory
  const selectedSupplierObj = useMemo(() => {
    if (selectedSupplierId) {
      const found = suppliers.find((s) => String(s._id) === String(selectedSupplierId));
      if (found) return found;
    }
    if (!selectedSupplierName) return null;
    return (
      suppliers.find(
        (s) => s.name?.toLowerCase() === selectedSupplierName.toLowerCase()
      ) || null
    );
  }, [suppliers, selectedSupplierId, selectedSupplierName]);

  // Check if loaded details belong to the active supplier
  const isCurrentDetails = useMemo(() => {
    if (selectedSupplierId && details?.supplier?._id) {
      return String(details.supplier._id) === String(selectedSupplierId);
    }
    return (
      Boolean(details?.supplier?.name) &&
      details?.supplier?.name?.toLowerCase() ===
      selectedSupplierName?.toLowerCase()
    );
  }, [details, selectedSupplierId, selectedSupplierName]);

  // Synchronous display metrics fallback so UI updates in 0ms without layout jumps
  const displayTotalPurchases = useMemo(() => {
    if (isCurrentDetails && details?.summary?.totalPurchases != null) {
      return details?.summary?.totalPurchases;
    }
    return selectedSupplierObj?.totalPurchases || 0;
  }, [isCurrentDetails, details, selectedSupplierObj]);

  const displayTotalDue = useMemo(() => {
    if (isCurrentDetails && details?.summary?.totalDue != null) {
      return details?.summary?.totalDue;
    }
    return selectedSupplierObj?.totalDue || 0;
  }, [isCurrentDetails, details, selectedSupplierObj]);

  const displayTotalPaid = useMemo(() => {
    if (isCurrentDetails && details?.summary?.totalPaid != null) {
      return details?.summary?.totalPaid;
    }
    if (selectedSupplierObj?.totalPaid != null) {
      return selectedSupplierObj.totalPaid;
    }
    return Math.max(
      0,
      (selectedSupplierObj?.totalPurchases || 0) -
      (selectedSupplierObj?.totalDue || 0)
    );
  }, [isCurrentDetails, details, selectedSupplierObj]);

  const displayTotalUnits = useMemo(() => {
    if (isCurrentDetails && details?.summary?.totalUnits != null) {
      return details?.summary?.totalUnits;
    }
    return selectedSupplierObj?.totalUnits || 0;
  }, [isCurrentDetails, details, selectedSupplierObj]);

  const displayInvoices = useMemo(() => {
    if (isCurrentDetails && details?.summary?.totalInvoices != null) {
      return details?.summary?.totalInvoices;
    }
    return selectedSupplierObj?.totalOrders || 0;
  }, [isCurrentDetails, details, selectedSupplierObj]);

  // Handler to switch between Suppliers and Customers
  const handleEntityFilterChange = (newEntity) => {
    setEntityFilter(newEntity);
    const matching = suppliers.filter((s) => {
      const isCust = Boolean(s.isCustomer || s.type === "customer");
      return newEntity === "customers" ? isCust : !isCust;
    });

    const currentEntityObj = suppliers.find(
      (s) => String(s._id) === String(selectedSupplierId)
    );
    const isCurrentCorrectType = currentEntityObj
      ? (newEntity === "customers"
        ? Boolean(currentEntityObj.isCustomer || currentEntityObj.type === "customer")
        : !currentEntityObj.isCustomer && currentEntityObj.type !== "customer")
      : false;

    if (!isCurrentCorrectType && matching.length > 0) {
      // Pick top entity of the new active tab immediately
      const nextSelection = matching[0];
      setSelectedSupplierName(nextSelection.name);
      setSelectedSupplierId(nextSelection._id);
      prevUrlIdRef.current = String(nextSelection._id);
      prevUrlSupplierRef.current = nextSelection.name;
      setSearchParams({ supplier: nextSelection.name, id: nextSelection._id }, { replace: true });
    }
  };

  // Filtered suppliers on the left list based on entityFilter, searchQuery, and statusFilter
  const filteredSuppliers = useMemo(() => {
    return suppliers.filter((s) => {
      const isCust = Boolean(s.isCustomer || s.type === "customer");
      if (entityFilter === "customers" && !isCust) return false;
      if (entityFilter === "suppliers" && isCust) return false;

      const matchesSearch =
        !searchQuery.trim() ||
        s.name.toLowerCase().includes(searchQuery.trim().toLowerCase());

      if (!matchesSearch) return false;

      if (statusFilter === "due") {
        return s.totalDue !== 0;
      }
      if (statusFilter === "settled") {
        return s.totalDue === 0 && (s.totalPurchases > 0 || (s.totalOrders || 0) > 0);
      }
      return true;
    });
  }, [suppliers, searchQuery, statusFilter, entityFilter]);

  // Aggregate stats by entity type for the buttons
  const entitySuppliers = useMemo(() => {
    return suppliers.filter((s) => {
      const isCust = Boolean(s.isCustomer || s.type === "customer");
      return entityFilter === "customers" ? isCust : !isCust;
    });
  }, [suppliers, entityFilter]);

  const supplierTotalCount = useMemo(() => {
    return suppliers.filter((s) => !s.isCustomer && s.type !== "customer").length;
  }, [suppliers]);

  const customerTotalCount = useMemo(() => {
    return suppliers.filter((s) => Boolean(s.isCustomer || s.type === "customer")).length;
  }, [suppliers]);

  const dueCount = useMemo(() => {
    return entitySuppliers.filter((s) => s.totalDue !== 0).length;
  }, [entitySuppliers]);

  const settledCount = useMemo(() => {
    return entitySuppliers.filter((s) => s.totalDue === 0 && (s.totalPurchases > 0 || (s.totalOrders || 0) > 0)).length;
  }, [entitySuppliers]);

  // Filtered purchased items on the center panel (only show if matching active supplier)
  const filteredPurchasedItems = useMemo(() => {
    if (!isCurrentDetails || !details?.items) return [];
    if (!itemsSearchQuery.trim()) return details.items;
    const q = itemsSearchQuery.trim().toLowerCase();
    return details.items.filter(
      (it) =>
        it.productName?.toLowerCase().includes(q) ||
        it.category?.toLowerCase().includes(q) ||
        it.invoiceNumber?.toLowerCase().includes(q) ||
        (Array.isArray(it.barcodes) && it.barcodes.some((b) => b?.toLowerCase().includes(q)))
    );
  }, [details, itemsSearchQuery, isCurrentDetails]);

  // Sorted payment history on the center panel (only show if matching active supplier)
  const sortedPaymentHistory = useMemo(() => {
    if (!isCurrentDetails || !details?.paymentHistory) return [];
    return [...details.paymentHistory].sort((a, b) => {
      const timeA = new Date(a.date || a.createdAt || 0).getTime();
      const timeB = new Date(b.date || b.createdAt || 0).getTime();
      if (timeB !== timeA) return timeB - timeA;
      return String(b.id || b.invoiceNumber || "").localeCompare(
        String(a.id || a.invoiceNumber || "")
      );
    });
  }, [details?.paymentHistory, isCurrentDetails]);

  // Barcode copy handler
  const handleCopyBarcode = (barcode) => {
    if (!barcode || barcode === "N/A") return;
    navigator.clipboard.writeText(barcode);
    setCopiedBarcode(barcode);
    setTimeout(() => {
      setCopiedBarcode((prev) => (prev === barcode ? null : prev));
    }, 1800);
  };


  // ========================================================
  // FORM HANDLERS: Tab B - Settle / Pay Outstanding Debt
  // ========================================================
  const handleSubmitPayment = async (e) => {
    e.preventDefault();
    const parsed = Number(paymentAmount);
    if (isNaN(parsed) || parsed <= 0) {
      setPaymentError("Please enter a valid amount greater than 0.");
      return;
    }

    const currentDue = displayTotalDue;
    const isSupplierOwes = currentDue < 0;
    const maxAmount = Math.abs(currentDue);
    const isCust = Boolean(selectedSupplierObj?.isCustomer || details?.supplier?.isCustomer);
    if (maxAmount > 0 && parsed > maxAmount + 0.05) {
      setPaymentError(
        isSupplierOwes
          ? `Settlement cannot exceed amount owed by ${isCust ? "customer" : "supplier"} of Rs. ${maxAmount.toLocaleString()}.`
          : `Payment cannot exceed current outstanding debt of Rs. ${currentDue.toLocaleString()}.`
      );
      return;
    }

    try {
      setIsSubmittingPayment(true);
      setPaymentError("");

      const targetIdentifier = selectedSupplierId || selectedSupplierName;
      const res = await api.post(
        `/suppliers/${encodeURIComponent(targetIdentifier)}/payments`,
        {
          amount: parsed,
          paymentDate,
          paymentMethod,
          notes: paymentNotes,
          flow: isSupplierOwes ? "collected" : "given",
          paymentType: isSupplierOwes ? "Supplier Refund" : "Debt Settlement",
          direction: isSupplierOwes ? "receive" : "pay",
        }
      );

      if (res.data?.success) {
        setSuccessToast(
          isSupplierOwes
            ? `Settlement of Rs. ${parsed.toLocaleString()} collected from ${selectedSupplierName} recorded successfully!`
            : `Payment settlement of Rs. ${parsed.toLocaleString()} recorded successfully for ${selectedSupplierName}!`
        );
        setTimeout(() => setSuccessToast(null), 4500);
        setPaymentAmount("");
        setPaymentNotes("");
        setIsSettleDebtModalOpen(false);

        // Refresh all synchronized data
        await Promise.all([
          fetchSupplierDetails(targetIdentifier),
          fetchSuppliers(),
        ]);
      } else {
        setPaymentError(res.data?.message || "Failed to record payment.");
      }
    } catch (err) {
      console.error("Error submitting payment settlement:", err);
      setPaymentError(
        err.response?.data?.message ||
        err.message ||
        "Failed to process payment."
      );
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  // ========================================================
  // FORM HANDLER: Modal - Create New Supplier
  // ========================================================
  const handleCreateSupplierSubmit = async (e) => {
    if (e) e.preventDefault();
    const cleanName = newSupplierForm.name.trim();
    const isCustomer = entityFilter === "customers";
    if (!cleanName) {
      setCreateSupplierError(`Please enter a ${isCustomer ? "customer" : "supplier"} name.`);
      return;
    }

    if (isDuplicateSupplier) {
      setCreateSupplierError(`${isCustomer ? "Customer" : "Supplier"} "${cleanName}" already exists.`);
      return;
    }

    const total = newSupplierForm.totalAmount === "" ? 0 : Number(newSupplierForm.totalAmount);
    const paid = newSupplierForm.amountPaid === "" ? 0 : Number(newSupplierForm.amountPaid);

    if (isNaN(total) || total < 0) {
      setCreateSupplierError("Total amount must be a valid positive number or 0.");
      return;
    }
    if (isNaN(paid) || paid < 0) {
      setCreateSupplierError("Amount paid must be a valid positive number or 0.");
      return;
    }
    if (total > 0 && paid > total) {
      setCreateSupplierError("Amount paid cannot exceed total amount.");
      return;
    }

    try {
      setIsSubmittingSupplier(true);
      setCreateSupplierError("");

      const res = await api.post("/suppliers", {
        name: cleanName,
        totalAmount: total,
        amountPaid: paid,
        type: isCustomer ? "customer" : "supplier",
      });

      if (res.data?.success) {
        setSuccessToast(`${isCustomer ? "Customer" : "Supplier"} "${cleanName}" created successfully!`);
        setTimeout(() => setSuccessToast(null), 4500);
        setShowCreateSupplierModal(false);
        setNewSupplierForm({ name: "", totalAmount: "", amountPaid: "" });

        // Refresh suppliers & customers directory
        await fetchSuppliers();

        // Automatically select the newly created entity in the center ledger
        const createdEntity = res.data?.data;
        if (createdEntity && createdEntity._id) {
          handleSelectSupplier(createdEntity);
        } else {
          handleSelectSupplier({ name: cleanName });
        }
      } else {
        setCreateSupplierError(res.data?.message || `Failed to create ${isCustomer ? "customer" : "supplier"}.`);
      }
    } catch (err) {
      console.error("Error creating supplier:", err);
      setCreateSupplierError(
        err.response?.data?.message || err.message || "Failed to create supplier."
      );
    } finally {
      setIsSubmittingSupplier(false);
    }
  };



  return (
    <div className="container-fluid p-0 d-flex flex-column flex-grow-1">
      {/* Toast Notification */}
      {successToast && (
        <div
          className="alert alert-success alert-dismissible fade show position-fixed top-0 end-0 m-3 shadow-lg z-3 py-2 px-3"
          style={{ maxWidth: "400px" }}
          role="alert"
        >
          <div className="d-flex align-items-center gap-2">
            <FiCheckCircle className="text-success flex-shrink-0" size={18} />
            <span className="small fw-semibold text-dark">
              {successToast}
            </span>
          </div>
          <button
            type="button"
            className="btn-close"
            onClick={() => setSuccessToast(null)}
            aria-label="Close"
          />
        </div>
      )}

      {/* ========================================================
          3-COLUMN MASTER-DETAIL WORKSPACE
         ======================================================== */}
      <div className="row g-3 flex-grow-1 align-items-stretch" style={{ minHeight: "calc(100vh - 45px)" }}>
        {/* ========================================================
            COLUMN 1 (Left - col-12 col-lg-4 col-xl-3): Suppliers Directory
           ======================================================== */}
        <div className="col-12 col-lg-4 col-xl-3 d-flex flex-column" style={{ height: "calc(100vh - 45px)", minHeight: "880px" }}>
          <div className="card border shadow-sm rounded-3 bg-white flex-grow-1 d-flex flex-column overflow-hidden h-100" style={{ height: "100%" }}>
            {/* Header */}
            <div className="card-header bg-white border-bottom py-2 px-2 d-flex justify-content-between align-items-center flex-shrink-0 gap-1">
              <div className="d-flex align-items-center gap-2 flex-shrink-0">
                <div className="d-inline-flex p-1 rounded-2 bg-dark text-white">
                  {entityFilter === "customers" ? <FiUsers size={13} /> : <FiTruck size={13} />}
                </div>
                <span className="fw-semibold text-dark small">
                  {entityFilter === "customers" ? "Customers" : "Suppliers"}
                </span>
                <span className="badge bg-light text-secondary border px-2 py-1" style={{ fontSize: "0.68rem" }}>
                  {filteredSuppliers.length}
                </span>
              </div>
              <button
                type="button"
                className="btn btn-sm btn-dark py-1 px-2 rounded-2 d-inline-flex align-items-center gap-1 shadow-sm flex-shrink-0 text-nowrap"
                style={{ fontSize: "0.72rem", whiteSpace: "nowrap" }}
                onClick={() => {
                  setNewSupplierForm({ name: "", totalAmount: "", amountPaid: "" });
                  setCreateSupplierError("");
                  setShowCreateSupplierModal(true);
                }}
                title={entityFilter === "customers" ? "Create a new entry" : "Create a new supplier"}
              >
                <FiPlus size={12} className="flex-shrink-0" />
                <span className="d-none d-xxl-inline">{entityFilter === "customers" ? "Add Customer" : "Add Supplier"}</span>
                <span className="d-inline d-xxl-none">{entityFilter === "customers" ? "Customer" : "Supplier"}</span>
              </button>
            </div>

            <div className="p-2 border-bottom bg-light flex-shrink-0">
              {/* Search Input */}
              <div className="input-group input-group-sm mb-2">
                <span className="input-group-text bg-white text-secondary">
                  <FiSearch size={13} />
                </span>
                <input
                  type="text"
                  className="form-control"
                  placeholder={entityFilter === "customers" ? "Search customers..." : "Search suppliers..."}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={() => setSearchQuery("")}
                    title="Clear search"
                  >
                    <FiX size={12} />
                  </button>
                )}
              </div>

              {/* Quick Status Filter Pills (Full Width Single Row: All, Due, Settled) */}
              <div className="d-flex gap-1 w-100">
                <button
                  type="button"
                  className={`btn btn-sm flex-fill py-1 px-1 rounded-2 text-nowrap ${statusFilter === "all"
                    ? "btn-dark text-white shadow-sm"
                    : "btn-outline-secondary bg-white text-secondary"
                    }`}
                  style={{ fontSize: "0.72rem", fontWeight: 500 }}
                  onClick={() => setStatusFilter("all")}
                >
                  All ({entitySuppliers.length})
                </button>
                <button
                  type="button"
                  className={`btn btn-sm flex-fill py-1 px-1 rounded-2 text-nowrap ${statusFilter === "due"
                    ? "btn-danger text-white shadow-sm"
                    : "btn-outline-secondary bg-white text-secondary"
                    }`}
                  style={{ fontSize: "0.72rem", fontWeight: 500 }}
                  onClick={() => setStatusFilter("due")}
                >
                  Due ({dueCount})
                </button>
                <button
                  type="button"
                  className={`btn btn-sm flex-fill py-1 px-1 rounded-2 text-nowrap ${statusFilter === "settled"
                    ? "btn-success text-white shadow-sm"
                    : "btn-outline-secondary bg-white text-secondary"
                    }`}
                  style={{ fontSize: "0.72rem", fontWeight: 500 }}
                  onClick={() => setStatusFilter("settled")}
                >
                  Settled ({settledCount})
                </button>
              </div>

              {/* Two Buttons Below: Suppliers and Customers (Suppliers selected by default) */}
              <div className="d-flex gap-1 w-100 mt-1">
                <button
                  type="button"
                  className={`btn btn-sm flex-fill py-1 px-2 rounded-2 text-nowrap d-flex align-items-center justify-content-center gap-2 ${entityFilter === "suppliers"
                      ? "btn-dark text-white shadow-sm"
                      : "btn-outline-secondary bg-white text-secondary"
                    }`}
                  style={{ fontSize: "0.73rem", fontWeight: 600 }}
                  onClick={() => handleEntityFilterChange("suppliers")}
                >
                  <FiTruck size={12} />
                  <span>Suppliers ({supplierTotalCount})</span>
                </button>
                <button
                  type="button"
                  className={`btn btn-sm flex-fill py-1 px-2 rounded-2 text-nowrap d-flex align-items-center justify-content-center gap-2 ${entityFilter === "customers"
                      ? "btn-dark text-white shadow-sm"
                      : "btn-outline-secondary bg-white text-secondary"
                    }`}
                  style={{ fontSize: "0.73rem", fontWeight: 600 }}
                  onClick={() => handleEntityFilterChange("customers")}
                >
                  <FiUsers size={12} />
                  <span>Customers ({customerTotalCount})</span>
                </button>
              </div>
            </div>

            {/* Scrollable Suppliers List */}
            <div
              className="p-2 overflow-y-auto overflow-x-hidden flex-grow-1"
              style={{ minHeight: 0, overflowX: "hidden" }}
            >
              {isLoadingSuppliers && suppliers.length === 0 ? (
                <div className="d-flex flex-column gap-2 p-1">
                  {[1, 2, 3, 4, 5].map((idx) => (
                    <div
                      key={idx}
                      className="p-3 border rounded-2 bg-light placeholder-glow"
                    >
                      <div className="placeholder col-7 mb-1" />
                      <div className="placeholder col-4" />
                    </div>
                  ))}
                </div>
              ) : suppliersError ? (
                <div className="p-3 text-center text-danger">
                  <FiAlertCircle size={20} className="mb-1" />
                  <p className="small mb-2">{suppliersError}</p>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-dark"
                    onClick={() => fetchSuppliers(true)}
                  >
                    Retry
                  </button>
                </div>
              ) : filteredSuppliers.length === 0 ? (
                <div key={`empty-${statusFilter}-${entityFilter}`} className="p-3 text-center text-secondary pos-tab-fade-transition">
                  {entityFilter === "customers" ? (
                    <FiUsers size={24} className="text-secondary opacity-50 mb-1" />
                  ) : (
                    <FiTruck size={24} className="text-secondary opacity-50 mb-1" />
                  )}
                  <h6 className="small fw-semibold text-dark mb-1">
                    No {entityFilter === "customers" ? "Customers" : "Suppliers"} Found
                  </h6>
                  <p className="small text-muted mb-0" style={{ fontSize: "0.72rem" }}>
                    {searchQuery
                      ? `No match for "${searchQuery}"`
                      : `No ${entityFilter === "customers" ? "customers" : "suppliers"} found.`}
                  </p>
                </div>
              ) : (
                <div key={statusFilter} className="d-flex flex-column gap-2 pos-tab-fade-transition">
                  {filteredSuppliers.map((supplier) => {
                    const isSelected = selectedSupplierId
                      ? String(supplier._id) === String(selectedSupplierId)
                      : selectedSupplierName &&
                      selectedSupplierName.toLowerCase() ===
                      supplier.name.toLowerCase();

                    const hasDue = supplier.totalDue > 0;

                    return (
                      <div
                        key={supplier._id || supplier.name}
                        onClick={() => handleSelectSupplier(supplier)}
                        className={`pos-supplier-item w-100 ${isSelected ? "active" : ""
                          }`}
                        style={{ boxSizing: "border-box" }}
                      >
                        {/* Line 1: Supplier Name with optional Customer span */}
                        <div
                          className="d-flex align-items-center justify-content-between gap-1"
                          style={{ minWidth: 0, lineHeight: 1.2 }}
                        >
                          <span
                            className="fw-bold text-dark text-truncate"
                            title={supplier.name}
                            style={{ fontSize: "0.84rem" }}
                          >
                            {supplier.name}
                          </span>
                          {(supplier.isCustomer || supplier.type === "customer") && (
                            <span
                              className="badge bg-secondary-subtle text-secondary border flex-shrink-0"
                              style={{
                                fontSize: "0.62rem",
                                padding: "0.15rem 0.4rem",
                                fontWeight: "600",
                                letterSpacing: "0.02em",
                              }}
                            >
                              Customer
                            </span>
                          )}
                        </div>

                        {/* Line 2: Order Metrics & Purchase Value */}
                        <div
                          className="text-secondary text-nowrap"
                          style={{ fontSize: "0.71rem", lineHeight: 1.2 }}
                        >
                          {supplier.totalOrders || 0} order{supplier.totalOrders === 1 ? "" : "s"} • {supplier.totalUnits || 0} pcs{supplier.totalPurchases > 0 ? ` • Rs. ${(supplier.totalPurchases || 0).toLocaleString()}` : ""}
                        </div>

                        {/* Line 3: Dedicated Full-Visibility Status Badge */}
                        <div className="d-flex align-items-center">
                          {supplier.totalDue > 0 ? (
                            <span
                              className="badge badge-status-due text-nowrap"
                              style={{ fontSize: "0.68rem", padding: "0.2rem 0.5rem", lineHeight: 1.2 }}
                              title={`Shop owes: Rs. ${supplier.totalDue.toLocaleString()}`}
                            >
                              Shop Owes: {formatUnit(supplier.totalDue)}
                            </span>
                          ) : supplier.totalDue < 0 ? (
                            <span
                              className="badge bg-warning text-dark border border-warning text-nowrap fw-bold"
                              style={{ fontSize: "0.68rem", padding: "0.2rem 0.5rem", lineHeight: 1.2 }}
                              title={`${supplier.isCustomer || supplier.type === "customer" ? "Customer" : "Supplier"} pays to shop: Rs. ${Math.abs(supplier.totalDue).toLocaleString()}`}
                            >
                              {supplier.isCustomer || supplier.type === "customer" ? "Customer Pays" : "Supplier Pays"}: {formatUnit(Math.abs(supplier.totalDue))}
                            </span>
                          ) : (supplier.totalPurchases > 0 || (supplier.totalOrders || 0) > 0) ? (
                            <span
                              className="badge badge-status-paid text-nowrap"
                              style={{ fontSize: "0.68rem", padding: "0.2rem 0.5rem", lineHeight: 1.2 }}
                            >
                              Settled
                            </span>
                          ) : (
                            <span
                              className="badge bg-light text-secondary border text-nowrap"
                              style={{ fontSize: "0.68rem", padding: "0.2rem 0.5rem", lineHeight: 1.2 }}
                            >
                              New
                            </span>
                          )}
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
            COLUMN 2 (Right - col-12 col-lg-8 col-xl-9): Supplier Stock & Purchase History
           ======================================================== */}
        <div className="col-12 col-lg-8 col-xl-9 d-flex flex-column gap-3" style={{ height: "calc(100vh - 45px)", minHeight: "880px" }}>
          {!selectedSupplierName ? (
            /* Empty State */
            <div className="card border shadow-sm rounded-3 bg-white p-5 text-center flex-grow-1 d-flex flex-column justify-content-center">
              <div
                className="d-inline-flex p-3 rounded-circle bg-light border mx-auto mb-3"
                style={{ width: "60px", height: "60px" }}
              >
                <FiTruck size={28} className="text-secondary m-auto" />
              </div>
              <h5 className="fw-bold text-dark mb-1">Select a Supplier</h5>
              <p
                className="text-secondary small mb-0"
                style={{ maxWidth: "400px", margin: "0 auto" }}
              >
                Choose any supplier from Column 1 to inspect purchased materials,
                track historical payment settlement, and record purchases.
              </p>
            </div>
          ) : (detailsError && !selectedSupplierObj) ? (
            /* Error State */
            <div className="card border shadow-sm rounded-3 bg-white p-4 text-center text-danger flex-grow-1 d-flex flex-column justify-content-center">
              <FiAlertCircle size={32} className="mb-2" />
              <h6 className="fw-bold mb-1">Failed to Load Details</h6>
              <p className="small mb-3">{detailsError}</p>
              <button
                type="button"
                className="btn btn-sm btn-outline-dark mx-auto"
                onClick={() => fetchSupplierDetails(selectedSupplierName)}
              >
                Try Again
              </button>
            </div>
          ) : (
            <div
              key={selectedSupplierName}
              className="d-flex flex-column gap-3 flex-grow-1 pos-supplier-switch-transition"
            >
              {/* Header Profile & Stat Metrics Card */}
              <div className="card border shadow-sm rounded-3 bg-white flex-shrink-0">
                <div className="card-body p-3">
                  <div className="d-flex justify-content-between align-items-center gap-2 mb-3 pb-2 border-bottom">
                    <div className="d-flex align-items-center gap-2 flex-grow-1 min-w-0" style={{ minWidth: 0 }}>
                      <div
                        className="rounded-3 d-flex align-items-center justify-content-center text-white fw-bold shadow-sm flex-shrink-0"
                        style={{
                          width: "42px",
                          height: "42px",
                          background:
                            "linear-gradient(135deg, #18181b 0%, #3f3f46 100%)",
                          fontSize: "0.95rem",
                        }}
                      >
                        {selectedSupplierName.slice(0, 2).toUpperCase()}
                      </div>

                      <div className="min-w-0" style={{ minWidth: 0 }}>
                        <div className="d-flex align-items-center gap-2 flex-wrap">
                          <h5 className="fw-bold text-dark mb-0 text-truncate" title={isCurrentDetails ? (details?.supplier?.name || selectedSupplierName) : (selectedSupplierObj?.name || selectedSupplierName)}>
                            {isCurrentDetails ? (details?.supplier?.name || selectedSupplierName) : (selectedSupplierObj?.name || selectedSupplierName)}
                          </h5>
                          {((details?.supplier && (details.supplier.isCustomer || details.supplier.type === "customer")) || (selectedSupplierObj && (selectedSupplierObj.isCustomer || selectedSupplierObj.type === "customer"))) && (
                            <span
                              className="badge bg-secondary-subtle text-secondary border flex-shrink-0"
                              style={{
                                fontSize: "0.68rem",
                                padding: "0.2rem 0.5rem",
                                fontWeight: "600",
                                letterSpacing: "0.02em",
                              }}
                            >
                              Customer
                            </span>
                          )}
                          {displayTotalDue > 0 ? (
                            <span
                              className="badge badge-status-due text-nowrap flex-shrink-0"
                              style={{ fontSize: "0.72rem" }}
                              title={formatFullAmount(displayTotalDue)}
                            >
                              Shop Pays: {formatUnit(displayTotalDue)}
                            </span>
                          ) : displayTotalDue < 0 ? (
                            <span
                              className="badge bg-warning text-dark border border-warning text-nowrap flex-shrink-0 fw-bold"
                              style={{ fontSize: "0.72rem" }}
                              title={`${(selectedSupplierObj?.isCustomer || details?.supplier?.isCustomer) ? "Customer" : "Supplier"} pays to shop: Rs. ${Math.abs(displayTotalDue).toLocaleString()}`}
                            >
                              {(selectedSupplierObj?.isCustomer || details?.supplier?.isCustomer) ? "Customer Pays Shop" : "Supplier Pays Shop"}: {formatUnit(Math.abs(displayTotalDue))}
                            </span>
                          ) : (
                            <span
                              className="badge badge-status-paid text-nowrap flex-shrink-0"
                              style={{ fontSize: "0.72rem" }}
                            >
                              All Settled
                            </span>
                          )}
                        </div>

                        <div
                          className="d-flex align-items-center gap-2 text-secondary small text-nowrap mt-1"
                          style={{ fontSize: "0.75rem" }}
                        >
                          <span className="d-flex align-items-center gap-1">
                            <FiCalendar size={12} />
                            <span>
                              {details?.supplier?.createdAt && isCurrentDetails
                                ? new Date(
                                  details.supplier?.createdAt
                                ).toLocaleDateString()
                                : (selectedSupplierObj?.isCustomer || details?.supplier?.isCustomer) ? "Active Customer" : "Active Vendor"}
                            </span>
                          </span>
                          <span>•</span>
                          <span>
                            {displayInvoices} Invoice(s)
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="d-flex align-items-center gap-2 flex-shrink-0">
                      <button
                        type="button"
                        className="btn btn-dark btn-sm py-1 px-3 rounded-2 d-inline-flex align-items-center gap-2 flex-shrink-0 text-nowrap shadow-sm"
                        style={{ fontSize: "0.75rem", whiteSpace: "nowrap" }}
                        onClick={() => {
                          setPaymentAmount(displayTotalDue !== 0 ? String(Math.abs(displayTotalDue)) : "");
                          setPaymentDate(new Date().toISOString().slice(0, 10));
                          setPaymentMethod("Cash");
                          setPaymentNotes("");
                          setPaymentError("");
                          setIsSettleDebtModalOpen(true);
                        }}
                        title="Settle balance with this supplier/customer"
                      >
                        <FiCreditCard size={13} className="flex-shrink-0" />
                        <span>Settle Balance</span>
                        {displayTotalDue !== 0 && (
                          <span
                            className={`badge ${displayTotalDue > 0 ? "bg-danger text-white" : "bg-warning text-dark"} rounded-pill ms-1`}
                            style={{ fontSize: "0.62rem", padding: "1px 6px" }}
                          >
                            {displayTotalDue > 0 ? "Shop Owes" : (selectedSupplierObj?.isCustomer || details?.supplier?.isCustomer) ? "Customer Pays" : "Supplier Pays"}
                          </span>
                        )}
                      </button>

                      <button
                        type="button"
                        className="btn btn-outline-dark btn-sm py-1 px-3 rounded-2 d-inline-flex align-items-center gap-1 flex-shrink-0 text-nowrap shadow-sm"
                        style={{ fontSize: "0.75rem", whiteSpace: "nowrap" }}
                        onClick={() => fetchSupplierDetails(selectedSupplierName)}
                        title="Refresh supplier ledger"
                      >
                        <FiRefreshCw size={12} />
                        <span>Refresh</span>
                      </button>
                    </div>
                  </div>

                  {/* 4 Quick Stat Metric Cards (2x2 Grid with uniform 12px gap) */}
                  <div className="pos-metric-grid">
                    {/* Card 1: Total Purchases */}
                    <div className="pos-metric-card pos-metric-value d-flex flex-column justify-content-between">
                      <span
                        className="pos-metric-label fw-semibold d-flex align-items-center text-truncate"
                        style={{ fontSize: "0.78rem", gap: "7px" }}
                      >
                        <FiCreditCard size={14} className="flex-shrink-0" />
                        <span>Total Purchases</span>
                      </span>
                      <strong
                        className="fw-bold pos-metric-val text-truncate d-block mt-1"
                        style={{ fontSize: "1.02rem" }}
                        title={formatFullAmount(displayTotalPurchases)}
                      >
                        {formatUnit(displayTotalPurchases)}
                      </strong>
                    </div>

                    {/* Card 2: Total Paid */}
                    <div className="pos-metric-card pos-metric-paid d-flex flex-column justify-content-between">
                      <span
                        className="pos-metric-label fw-semibold d-flex align-items-center text-truncate"
                        style={{ fontSize: "0.78rem", gap: "7px" }}
                      >
                        <FiCheckCircle size={14} className="flex-shrink-0" />
                        <span>Total Paid</span>
                      </span>
                      <strong
                        className="fw-bold pos-metric-val text-truncate d-block mt-1"
                        style={{ fontSize: "1.02rem" }}
                        title={formatFullAmount(displayTotalPaid)}
                      >
                        {formatUnit(displayTotalPaid)}
                      </strong>
                    </div>

                    {/* Card 3: Balance Left (Due) */}
                    <div
                      className={`pos-metric-card ${displayTotalDue > 0
                        ? "pos-metric-due"
                        : displayTotalDue < 0
                        ? "pos-metric-receivable"
                        : "pos-metric-settled"
                        } d-flex flex-column justify-content-between`}
                    >
                      <span
                        className="pos-metric-label fw-semibold d-flex align-items-center text-truncate"
                        style={{ fontSize: "0.78rem", gap: "7px" }}
                      >
                        <FiAlertCircle size={14} className="flex-shrink-0" />
                        <span>
                          {displayTotalDue > 0
                            ? ((selectedSupplierObj?.isCustomer || details?.supplier?.isCustomer) ? "Shop owes Customer" : "Shop owes Supplier")
                            : displayTotalDue < 0
                            ? ((selectedSupplierObj?.isCustomer || details?.supplier?.isCustomer) ? "Customer owes Shop" : "Supplier owes Shop")
                            : "Settled / Balanced"}
                        </span>
                      </span>
                      <strong
                        className="fw-bold pos-metric-val text-truncate d-block mt-1"
                        style={{ fontSize: "1.02rem" }}
                        title={formatFullAmount(Math.abs(displayTotalDue))}
                      >
                        {formatUnit(Math.abs(displayTotalDue))}
                      </strong>
                    </div>

                    {/* Card 4: Total Units Supplied */}
                    <div className="pos-metric-card pos-metric-units d-flex flex-column justify-content-between">
                      <span
                        className="text-secondary fw-semibold d-flex align-items-center text-truncate"
                        style={{ fontSize: "0.78rem", gap: "7px" }}
                      >
                        <FiPackage size={14} className="flex-shrink-0" />
                        <span>Units Supplied</span>
                      </span>
                      <strong
                        className="fw-bold text-dark text-truncate d-block mt-1"
                        style={{ fontSize: "1.02rem" }}
                        title={`${displayTotalUnits.toLocaleString()} pcs`}
                      >
                        {displayTotalUnits.toLocaleString()} pcs
                      </strong>
                    </div>
                  </div>
                </div>
              </div>

              {/* Center Tabbed Tables: Purchased Materials vs Payment Ledger */}
              <div className="card border shadow-sm rounded-3 bg-white flex-grow-1 d-flex flex-column overflow-hidden">
                <div className="card-header bg-white border-bottom py-2 px-3 d-flex flex-wrap justify-content-between align-items-center gap-2 flex-shrink-0">
                  <ul className="nav nav-pills card-header-pills gap-1">
                    <li className="nav-item">
                      <button
                        type="button"
                        className={`btn btn-sm d-inline-flex align-items-center gap-1 ${centerTab === "items"
                          ? "btn-dark text-white shadow-sm"
                          : "btn-light text-secondary border"
                          }`}
                        style={{ fontSize: "0.75rem" }}
                        onClick={() => setCenterTab("items")}
                      >
                        <FiPackage size={12} />
                        <span>
                          Materials ({isCurrentDetails ? (details?.items?.length || 0) : 0})
                        </span>
                      </button>
                    </li>
                    <li className="nav-item">
                      <button
                        type="button"
                        className={`btn btn-sm d-inline-flex align-items-center gap-1 ${centerTab === "payments"
                          ? "btn-dark text-white shadow-sm"
                          : "btn-light text-secondary border"
                          }`}
                        style={{ fontSize: "0.75rem" }}
                        onClick={() => setCenterTab("payments")}
                      >
                        <FiFileText size={12} />
                        <span>
                          Payment Details ({isCurrentDetails ? (details?.paymentHistory?.length || 0) : 0})
                        </span>
                      </button>
                    </li>
                  </ul>

                  {centerTab === "items" && isCurrentDetails && (details?.items?.length || 0) > 0 && (
                    <div
                      className="input-group input-group-sm"
                      style={{ width: "190px" }}
                    >
                      <span className="input-group-text bg-light text-secondary border">
                        <FiSearch size={11} />
                      </span>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Filter materials..."
                        value={itemsSearchQuery}
                        onChange={(e) => setItemsSearchQuery(e.target.value)}
                        style={{ fontSize: "0.75rem" }}
                      />
                    </div>
                  )}
                </div>

                <div className="card-body p-0 flex-grow-1 d-flex flex-column overflow-hidden">
                  {/* TAB 1: Purchased Items Table */}
                  {centerTab === "items" && (
                    <div key="items" className="table-responsive flex-grow-1 overflow-y-auto pos-tab-fade-transition">
                      <table
                        className="table table-sm table-hover align-middle mb-0 text-nowrap"
                        style={{ fontSize: "0.75rem" }}
                      >
                        <thead className="table-light text-secondary sticky-top">
                          <tr>
                            <th className="ps-3 py-1 text-nowrap" style={{ width: "85px" }}>Date</th>
                            <th className="py-1">Product</th>
                            <th className="py-1 text-center text-nowrap" style={{ width: "45px" }}>Qty</th>
                            <th className="py-1 text-end text-nowrap pe-3" style={{ width: "100px" }}>Total Cost</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(!isCurrentDetails && isLoadingDetails) ? (
                            <tr>
                              <td colSpan={4} className="text-center py-5 text-secondary">
                                <div className="spinner-border spinner-border-sm text-dark me-2" role="status" />
                                <span className="small">Loading materials...</span>
                              </td>
                            </tr>
                          ) : filteredPurchasedItems.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="text-center py-5 text-secondary">
                                <FiLayers size={28} className="opacity-50 mb-2" />
                                <h6 className="small fw-semibold text-dark mb-1">
                                  No Materials Found
                                </h6>
                                <p className="small text-muted mb-0">
                                  {itemsSearchQuery
                                    ? `No materials matching "${itemsSearchQuery}"`
                                    : "No purchase entries logged for this supplier yet."}
                                </p>
                              </td>
                            </tr>
                          ) : (
                            filteredPurchasedItems.map((item, idx) => (
                              <tr key={item.id || idx}>
                                <td className="ps-3 py-1 text-nowrap text-secondary">
                                  <div className="d-flex align-items-center gap-1">
                                    <FiCalendar size={11} className="text-muted flex-shrink-0" />
                                    <span>
                                      {item.purchaseDate
                                        ? new Date(
                                          item.purchaseDate
                                        ).toLocaleDateString()
                                        : "—"}
                                    </span>
                                  </div>
                                </td>

                                <td className="py-1">
                                  <div className="d-flex align-items-center gap-1.5 flex-wrap">
                                    <span className="fw-semibold text-dark d-block text-truncate" style={{ maxWidth: "260px" }} title={item.productName}>
                                      {item.productName}
                                    </span>
                                    {item.isRefund && (
                                      <span
                                        className="badge bg-danger-subtle text-danger border border-danger-subtle font-monospace"
                                        style={{ fontSize: "0.68rem", padding: "1px 5px" }}
                                      >
                                        Returned to Supplier
                                      </span>
                                    )}
                                    {item.invoiceNumber && (
                                      <span
                                        className="badge bg-light text-secondary border font-monospace"
                                        style={{ fontSize: "0.65rem", padding: "1px 4px" }}
                                      >
                                        {item.invoiceNumber}
                                      </span>
                                    )}
                                  </div>
                                  {Array.isArray(item.barcodes) && item.barcodes.filter((b) => b && b.toUpperCase() !== "N/A").length > 0 && (
                                    <div className="d-flex flex-wrap align-items-center gap-1 mt-1">
                                      {item.barcodes
                                        .filter((b) => b && b.toUpperCase() !== "N/A")
                                        .slice(0, 2)
                                        .map((b, bIdx) => (
                                          <span
                                            key={bIdx}
                                            className={`badge border font-monospace ${
                                              item.isRefund
                                                ? "bg-danger-subtle text-danger border-danger-subtle"
                                                : "bg-light text-secondary"
                                            }`}
                                            style={{ fontSize: "0.68rem", fontWeight: "normal", padding: "1px 4px" }}
                                            title={`IMEI: ${b}`}
                                          >
                                            {b}
                                          </span>
                                        ))}
                                      {item.barcodes.filter((b) => b && b.toUpperCase() !== "N/A").length > 2 && (
                                        <button
                                          type="button"
                                          className="btn btn-sm btn-outline-secondary py-0 px-1.5 rounded-pill d-inline-flex align-items-center gap-1"
                                          style={{ fontSize: "0.62rem", height: "18px" }}
                                          onClick={() => setBarcodeModalItem(item)}
                                          title="View all serial IMEIs"
                                        >
                                          <FiHash size={9} />
                                          <span>+{item.barcodes.filter((b) => b && b.toUpperCase() !== "N/A").length - 2} more</span>
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </td>

                                <td className="py-1 text-center text-nowrap">
                                  <span
                                    className={`badge border px-2 py-1 ${
                                      item.isRefund
                                        ? "bg-danger-subtle text-danger border-danger-subtle"
                                        : "bg-dark-subtle text-dark"
                                    }`}
                                    style={{ fontSize: "0.72rem" }}
                                  >
                                    {item.isRefund ? `-${item.quantity}` : item.quantity}
                                  </span>
                                </td>

                                <td
                                  className={`py-1 text-end fw-bold text-nowrap pe-3 ${
                                    item.isRefund ? "text-danger" : "text-dark"
                                  }`}
                                >
                                  {item.isRefund ? `- Rs. ${(item.totalCost || 0).toLocaleString()}` : `Rs. ${(item.totalCost || 0).toLocaleString()}`}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* TAB 2: Clean Payment & Refund Ledger (Money Given / Collected) */}
                  {centerTab === "payments" && (
                    <div key="payments" className="table-responsive flex-grow-1 overflow-y-auto pos-tab-fade-transition">
                      <table
                        className="table table-sm table-hover align-middle mb-0 text-nowrap"
                        style={{ fontSize: "0.75rem" }}
                      >
                        <thead className="table-light text-secondary sticky-top">
                          <tr>
                            <th className="ps-3 py-2 text-nowrap" style={{ width: "160px" }}>Date & Time</th>
                            <th className="py-2 text-nowrap" style={{ width: "170px" }}>Bill / Reference Number</th>
                            <th className="py-2 text-nowrap" style={{ width: "190px" }}>Transaction Flow</th>
                            <th className="py-2 text-end text-nowrap" style={{ width: "150px" }}>Given to Supplier</th>
                            <th className="py-2 pe-3 text-end text-nowrap" style={{ width: "160px" }}>Collected from Supplier</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(!isCurrentDetails && isLoadingDetails) ? (
                            <tr>
                              <td colSpan={5} className="text-center py-5 text-secondary">
                                <div className="spinner-border spinner-border-sm text-dark me-2" role="status" />
                                <span className="small">Loading payment records...</span>
                              </td>
                            </tr>
                          ) : !sortedPaymentHistory ||
                            sortedPaymentHistory.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="text-center py-5 text-secondary">
                                <FiFileText size={28} className="opacity-50 mb-2" />
                                <h6 className="small fw-semibold text-dark mb-1">
                                  No Payment Records
                                </h6>
                                <p className="small text-muted mb-0">
                                  No payment disbursements or supplier refunds recorded yet.
                                </p>
                              </td>
                            </tr>
                          ) : (
                            sortedPaymentHistory.map((pay, idx) => {
                              const payDateObj = pay.date ? new Date(pay.date) : null;
                              const isValidDate = payDateObj && !isNaN(payDateObj.getTime());
                              const payAmt = pay.amount != null ? pay.amount : (pay.amountPaid || 0);
                              const invNumber =
                                pay.invoiceNumber ||
                                pay.notes?.match(/\b(INV-[A-Z0-9-]+)\b/i)?.[1] ||
                                pay.notes?.match(/\b(SUP-RET-[A-Z0-9-]+)\b/i)?.[1] ||
                                "";
                              const isRefund =
                                pay.isRefund ||
                                pay.flow === "collected" ||
                                pay.paymentType === "Supplier Refund" ||
                                String(invNumber).startsWith("SUP-RET") ||
                                String(pay.paymentMethod || "").toLowerCase().includes("refund") ||
                                String(pay.notes || "").toLowerCase().includes("supplier return") ||
                                String(pay.notes || "").toLowerCase().includes("supplier refund");

                              return (
                                <tr key={pay.id || idx}>
                                  {/* Date & Time */}
                                  <td className="ps-3 py-2 text-secondary text-nowrap">
                                    <div className="d-flex align-items-center gap-2">
                                      <FiClock size={12} className="text-muted flex-shrink-0" />
                                      <div className="d-flex align-items-baseline gap-2">
                                        <span className="fw-medium text-dark">
                                          {isValidDate ? payDateObj.toLocaleDateString() : "—"}
                                        </span>
                                        {isValidDate && (
                                          <span className="text-muted small" style={{ fontSize: "0.72rem" }}>
                                            {payDateObj.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </td>

                                  {/* Invoice / Reference Number */}
                                  <td className="py-2 text-secondary text-nowrap">
                                    {invNumber ? (
                                      <span
                                        className={`badge border font-monospace px-2 py-1 ${isRefund
                                            ? "bg-warning-subtle text-dark border-warning-subtle"
                                            : "bg-dark-subtle text-dark"
                                          }`}
                                        style={{ fontSize: "0.74rem" }}
                                        title={pay.notes || invNumber}
                                      >
                                        {invNumber}
                                      </span>
                                    ) : (
                                      <span className="text-muted small" style={{ fontSize: "0.74rem" }}>
                                        —
                                      </span>
                                    )}
                                  </td>

                                  {/* Transaction Flow Badge */}
                                  <td className="py-2 text-nowrap">
                                    {isRefund ? (
                                      <span
                                        className="badge bg-success-subtle text-success border border-success-subtle px-2 py-1 d-inline-flex align-items-center gap-1 font-monospace"
                                        style={{ fontSize: "0.74rem" }}
                                      >
                                        <FiArrowDownLeft size={13} className="text-success" />
                                        <span>Collected from Supplier</span>
                                      </span>
                                    ) : (
                                      <span
                                        className="badge bg-primary-subtle text-primary border border-primary-subtle px-2 py-1 d-inline-flex align-items-center gap-1 font-monospace"
                                        style={{ fontSize: "0.74rem" }}
                                      >
                                        <FiArrowUpRight size={13} className="text-primary" />
                                        <span>Given to Supplier</span>
                                      </span>
                                    )}
                                  </td>

                                  {/* Given to Supplier (Payment Sent) */}
                                  <td className="py-2 text-end text-nowrap">
                                    {!isRefund ? (
                                      <div>
                                        <strong className="text-dark" style={{ fontSize: "0.92rem" }}>
                                          Rs. {payAmt.toLocaleString()}
                                        </strong>
                                        <div className="text-muted small" style={{ fontSize: "0.68rem" }}>
                                          Given to Supplier
                                        </div>
                                      </div>
                                    ) : (
                                      <span className="text-muted small">—</span>
                                    )}
                                  </td>

                                  {/* Collected from Supplier (Refund Received) */}
                                  <td className="py-2 pe-3 text-end text-nowrap">
                                    {isRefund ? (
                                      <div>
                                        <strong className="text-success" style={{ fontSize: "0.92rem" }}>
                                          Rs. {payAmt.toLocaleString()}
                                        </strong>
                                        <div className="text-success small fw-semibold" style={{ fontSize: "0.68rem" }}>
                                          Collected from Supplier
                                        </div>
                                      </div>
                                    ) : (
                                      <span className="text-muted small">—</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                        {sortedPaymentHistory && sortedPaymentHistory.length > 0 && (() => {
                          const isItemRefund = (p) =>
                            p.isRefund ||
                            p.flow === "collected" ||
                            p.paymentType === "Supplier Refund" ||
                            String(p.invoiceNumber || "").startsWith("SUP-RET") ||
                            String(p.paymentMethod || "").toLowerCase().includes("refund") ||
                            String(p.notes || "").toLowerCase().includes("supplier return") ||
                            String(p.notes || "").toLowerCase().includes("supplier refund");

                          const totalGiven = sortedPaymentHistory
                            .filter((p) => !isItemRefund(p))
                            .reduce((acc, p) => acc + (p.amount != null ? p.amount : (p.amountPaid || 0)), 0);

                          const totalCollected = sortedPaymentHistory
                            .filter((p) => isItemRefund(p))
                            .reduce((acc, p) => acc + (p.amount != null ? p.amount : (p.amountPaid || 0)), 0);

                          const currentBalance = displayTotalDue;

                          return (
                            <tfoot className="table-light border-top">
                              <tr style={{ fontSize: "0.75rem" }}>
                                <td colSpan={3} className="ps-3 py-2 align-middle">
                                  <div className="d-flex align-items-center gap-2 flex-wrap">
                                    <span className="text-secondary small fw-semibold text-nowrap">
                                      Total Summary ({sortedPaymentHistory.length}):
                                    </span>
                                    {currentBalance > 0 ? (
                                      <span
                                        className="badge bg-danger-subtle text-danger border border-danger-subtle px-2.5 py-1.5 d-inline-flex align-items-center gap-1.5 shadow-sm font-monospace"
                                        style={{ fontSize: "0.76rem" }}
                                      >
                                        <FiArrowUpRight size={13} />
                                        <span>Shop pays to supplier: <strong>Rs. {currentBalance.toLocaleString()}</strong></span>
                                      </span>
                                    ) : currentBalance < 0 ? (
                                      <span
                                        className="badge bg-success-subtle text-success border border-success-subtle px-2.5 py-1.5 d-inline-flex align-items-center gap-1.5 shadow-sm font-monospace"
                                        style={{ fontSize: "0.76rem" }}
                                      >
                                        <FiArrowDownLeft size={13} />
                                        <span>{(selectedSupplierObj?.isCustomer || details?.supplier?.isCustomer) ? "Customer pays to shop" : "Supplier pays to shop"}: <strong>Rs. {Math.abs(currentBalance).toLocaleString()}</strong></span>
                                      </span>
                                    ) : (
                                      <span
                                        className="badge bg-light text-secondary border px-2.5 py-1.5 d-inline-flex align-items-center gap-1 font-monospace"
                                        style={{ fontSize: "0.76rem" }}
                                      >
                                        <FiCheckCircle size={13} />
                                        <span>Settled / Balanced: Rs. 0</span>
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="py-2 text-end text-nowrap align-middle">
                                  <span className="text-muted small me-1">Total Given:</span>
                                  <strong className="text-dark" style={{ fontSize: "0.85rem" }}>
                                    Rs. {totalGiven.toLocaleString()}
                                  </strong>
                                </td>
                                <td className="py-2 pe-3 text-end text-nowrap align-middle">
                                  <span className="text-muted small me-1">Total Collected:</span>
                                  <strong className="text-success" style={{ fontSize: "0.85rem" }}>
                                    Rs. {totalCollected.toLocaleString()}
                                  </strong>
                                </td>
                              </tr>
                            </tfoot>
                          );
                        })()}
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>


      </div>

      {/* ========================================================
          MODAL: Settle / Pay Outstanding Debt
         ======================================================== */}
      {isSettleDebtModalOpen && createPortal(
        <div
          className="pos-modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isSubmittingPayment) {
              setIsSettleDebtModalOpen(false);
            }
          }}
        >
          <div className="pos-modal-dialog" style={{ maxWidth: "480px" }} onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="card-header bg-dark text-white py-2 px-3 d-flex justify-content-between align-items-center border-0">
              <div className="d-flex align-items-center gap-2">
                <div
                  className="rounded-circle bg-white bg-opacity-10 text-white d-flex align-items-center justify-content-center"
                  style={{ width: "28px", height: "28px" }}
                >
                  <FiCreditCard size={14} />
                </div>
                <div>
                  <h6 className="mb-0 fw-bold text-white" style={{ fontSize: "0.92rem" }}>
                    {displayTotalDue < 0
                      ? `Settle Receivable (${(selectedSupplierObj?.isCustomer || details?.supplier?.isCustomer) ? "Customer" : "Supplier"} Pays Shop)`
                      : displayTotalDue > 0
                      ? `Settle Payable (Shop Pays ${(selectedSupplierObj?.isCustomer || details?.supplier?.isCustomer) ? "Customer" : "Supplier"})`
                      : "Settle Balance"}
                  </h6>
                  <span className="text-white-50 small" style={{ fontSize: "0.7rem" }}>
                    {selectedSupplierName
                      ? `${(selectedSupplierObj?.isCustomer || details?.supplier?.isCustomer) ? "Customer" : "Supplier"}: ${selectedSupplierName}`
                      : "Disburse payment"}
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="btn btn-sm btn-outline-light border-0 p-1"
                onClick={() => !isSubmittingPayment && setIsSettleDebtModalOpen(false)}
                disabled={isSubmittingPayment}
                title="Close"
              >
                <FiX size={16} />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSubmitPayment}>
              <div className="card-body p-3 overflow-y-auto" style={{ maxHeight: "calc(85vh - 120px)" }}>
                {paymentError && (
                  <div className="alert alert-danger py-2 px-3 small mb-3 rounded-2 d-flex align-items-center gap-2" role="alert">
                    <FiAlertCircle size={14} className="flex-shrink-0" />
                    <span>{paymentError}</span>
                  </div>
                )}

                {/* Current Debt Banner */}
                {displayTotalDue > 0 ? (
                  <div className="p-3 bg-danger-subtle border border-danger-subtle rounded-3 mb-3 text-center">
                    <span className="text-secondary small d-block mb-1 fw-semibold" style={{ fontSize: "0.74rem" }}>
                      Outstanding Payable Debt (Shop pays to {(selectedSupplierObj?.isCustomer || details?.supplier?.isCustomer) ? "Customer" : "Supplier"})
                    </span>
                    <h3 className="fw-bold text-danger mb-1 font-monospace">
                      Rs. {displayTotalDue.toLocaleString()}
                    </h3>
                    <p className="text-muted small mb-0" style={{ fontSize: "0.7rem" }}>
                      Payments automatically apply to oldest unpaid invoices (FIFO).
                    </p>
                  </div>
                ) : displayTotalDue < 0 ? (
                  <div className="p-3 bg-warning-subtle border border-warning rounded-3 mb-3 text-center">
                    <span className="text-secondary small d-block mb-1 fw-bold" style={{ fontSize: "0.74rem" }}>
                      Outstanding Receivable ({(selectedSupplierObj?.isCustomer || details?.supplier?.isCustomer) ? "Customer" : "Supplier"} Pays to Shop)
                    </span>
                    <h3 className="fw-bold text-dark mb-1 font-monospace">
                      Rs. {Math.abs(displayTotalDue).toLocaleString()}
                    </h3>
                    <p className="text-muted small mb-0" style={{ fontSize: "0.72rem" }}>
                      {selectedSupplierName} owes this balance to the shop (e.g. from returned items/refunds). Record payment collected to settle.
                    </p>
                  </div>
                ) : (
                  <div className="p-3 bg-success-subtle border border-success-subtle rounded-3 mb-3 text-center">
                    <FiCheckCircle size={26} className="text-success mb-1" />
                    <h6 className="fw-bold text-success mb-1">All Accounts Settled!</h6>
                    <p className="text-secondary small mb-0" style={{ fontSize: "0.75rem" }}>
                      {selectedSupplierName} has no outstanding due balance (Rs. 0).
                    </p>
                  </div>
                )}

                {/* Payment Date */}
                <div className="mb-3">
                  <label className="form-label small fw-semibold text-dark mb-1">
                    Payment Date
                  </label>
                  <DatePicker
                    value={paymentDate}
                    onChange={(val) => setPaymentDate(val)}
                  />
                </div>

                {/* Payment Amount */}
                <div className="mb-3">
                  <div className="d-flex justify-content-between align-items-center mb-1">
                    <label className="form-label small fw-semibold text-dark mb-0">
                      {displayTotalDue < 0
                        ? `Settlement Amount Collected (${(selectedSupplierObj?.isCustomer || details?.supplier?.isCustomer) ? "Customer" : "Supplier"} pays to Shop)`
                        : `Payment Amount (Shop pays to ${(selectedSupplierObj?.isCustomer || details?.supplier?.isCustomer) ? "Customer" : "Supplier"})`}{" "}
                      <span className="text-danger">*</span>
                    </label>
                    {displayTotalDue !== 0 && (
                      <button
                        type="button"
                        className="btn btn-link p-0 text-decoration-none small fw-semibold text-primary"
                        style={{ fontSize: "0.72rem" }}
                        onClick={() => setPaymentAmount(String(Math.abs(displayTotalDue)))}
                      >
                        {displayTotalDue < 0 ? "Collect Full Balance" : "Pay Full Balance"}
                      </button>
                    )}
                  </div>
                  <div className="input-group input-group-sm">
                    <span className="input-group-text bg-white fw-bold small text-dark px-2">
                      Rs.
                    </span>
                    <input
                      type="number"
                      min="1"
                      step="0.01"
                      className="form-control fw-bold"
                      placeholder="e.g., 5000"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      disabled={isSubmittingPayment}
                      autoFocus
                      required
                    />
                  </div>
                </div>

              </div>

              {/* Modal Footer */}
              <div className="modal-footer bg-light py-2 px-3 d-flex justify-content-end gap-2 border-top">
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary px-3"
                  onClick={() => setIsSettleDebtModalOpen(false)}
                  disabled={isSubmittingPayment}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-sm btn-dark px-3 fw-semibold shadow-sm d-inline-flex align-items-center gap-2"
                  disabled={
                    isSubmittingPayment ||
                    !selectedSupplierName ||
                    displayTotalDue === 0 ||
                    !paymentAmount ||
                    Number(paymentAmount) <= 0
                  }
                >
                  {isSubmittingPayment ? (
                    <>
                      <span className="spinner-border spinner-border-sm" role="status" />
                      <span>Recording Payment...</span>
                    </>
                  ) : (
                    <>
                      <FiCheck size={14} />
                      <span>{displayTotalDue < 0 ? `Record Payment from ${(selectedSupplierObj?.isCustomer || details?.supplier?.isCustomer) ? "Customer" : "Supplier"}` : "Submit Payment Settlement"}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* ========================================================
          MODAL: Barcodes / Serial Numbers Inspection
         ======================================================== */}
      {barcodeModalItem && createPortal(
        <div className="pos-modal-backdrop">
          <div className="pos-modal-dialog" style={{ maxWidth: "480px" }}>
            <div className="card-header bg-white border-bottom py-2 px-3 d-flex justify-content-between align-items-center">
              <div className="d-flex align-items-center gap-2">
                <div className="d-inline-flex p-1 rounded-2 bg-dark text-white">
                  <FiHash size={14} />
                </div>
                <div>
                  <h6 className="mb-0 fw-bold text-dark small">
                    {barcodeModalItem.productName}
                  </h6>
                  <span className="text-muted" style={{ fontSize: "0.72rem" }}>
                    {barcodeModalItem.quantity} unit(s) • Serial Barcodes
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="btn-close"
                onClick={() => setBarcodeModalItem(null)}
                aria-label="Close"
              />
            </div>

            <div className="p-3" style={{ maxHeight: "360px", overflowY: "auto" }}>
              {Array.isArray(barcodeModalItem.barcodes) &&
                barcodeModalItem.barcodes.length > 0 ? (
                <div className="d-flex flex-column gap-2">
                  {barcodeModalItem.barcodes.map((bc, bIdx) => (
                    <div
                      key={bIdx}
                      className="d-flex justify-content-between align-items-center p-2 rounded border bg-light"
                      style={{ fontSize: "0.78rem" }}
                    >
                      <div className="d-flex align-items-center gap-2 font-monospace">
                        <span className="badge bg-secondary-subtle text-secondary">
                          #{bIdx + 1}
                        </span>
                        <span className="fw-semibold text-dark">
                          {bc || "N/A"}
                        </span>
                      </div>

                      {bc && bc !== "N/A" && (
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-secondary py-0 px-2 d-inline-flex align-items-center gap-1"
                          onClick={() => handleCopyBarcode(bc)}
                          title="Copy IEMI number to clipboard"
                        >
                          {copiedBarcode === bc ? (
                            <>
                              <FiCheck size={12} className="text-success" />
                              <span className="text-success">Copied</span>
                            </>
                          ) : (
                            <>
                              <FiCopy size={12} />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-secondary small text-center mb-0">
                  No individual serial IEMI numbers recorded for this item batch.
                </p>
              )}
            </div>

            <div className="card-footer bg-white border-top py-2 px-3 text-end">
              <button
                type="button"
                className="btn btn-sm btn-outline-dark"
                onClick={() => setBarcodeModalItem(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ========================================================
          CREATE SUPPLIER POPUP MODAL
         ======================================================== */}
      {showCreateSupplierModal && createPortal(
        <div
          className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center p-3"
          style={{
            backgroundColor: "rgba(15, 23, 42, 0.65)",
            backdropFilter: "blur(4px)",
            zIndex: 1060,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !isSubmittingSupplier) {
              setShowCreateSupplierModal(false);
            }
          }}
        >
          <div
            className="card border-0 shadow-lg rounded-3 bg-white overflow-hidden"
            style={{ maxWidth: "480px", width: "100%" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="card-header bg-dark text-white py-2 px-3 d-flex justify-content-between align-items-center border-0">
              <div className="d-flex align-items-center gap-2">
                <div className="p-1 rounded-2 bg-white bg-opacity-10 text-white">
                  {entityFilter === "customers" ? <FiUsers size={15} /> : <FiTruck size={15} />}
                </div>
                <div>
                  <h6 className="mb-0 fw-bold text-white" style={{ fontSize: "0.9rem" }}>
                    Create New {entityFilter === "customers" ? "Customer" : "Supplier"}
                  </h6>
                  <span className="text-white-50" style={{ fontSize: "0.7rem" }}>
                    Register {entityFilter === "customers" ? "customer & set opening balance" : "vendor & set opening bill balance"}
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="btn btn-sm btn-outline-light border-0 p-1"
                onClick={() => !isSubmittingSupplier && setShowCreateSupplierModal(false)}
                disabled={isSubmittingSupplier}
                title="Close"
              >
                <FiX size={16} />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleCreateSupplierSubmit}>
              <div className="card-body p-3">
                {createSupplierError && (
                  <div
                    className="alert alert-danger py-1 px-2 small d-flex align-items-center gap-2 mb-2"
                    role="alert"
                  >
                    <FiAlertCircle size={14} className="flex-shrink-0" />
                    <span>{createSupplierError}</span>
                  </div>
                )}

                {/* 1. Supplier / Customer Name */}
                <div className="mb-2">
                  <label className="form-label small fw-bold text-dark mb-1">
                    {entityFilter === "customers" ? "Customer Name" : "Supplier Name"} <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    className={`form-control form-control-sm ${isDuplicateSupplier ? "border-danger is-invalid" : ""}`}
                    placeholder={entityFilter === "customers" ? "e.g. Hamza, Ahmad Khan" : "e.g. Master Traders, Al-Rehman Fabric"}
                    value={newSupplierForm.name}
                    onChange={(e) => {
                      setNewSupplierForm((prev) => ({ ...prev, name: e.target.value }));
                      if (createSupplierError) setCreateSupplierError("");
                    }}
                    autoFocus
                    required
                    disabled={isSubmittingSupplier}
                  />
                  {isDuplicateSupplier && (
                    <div className="text-danger small mt-1 d-flex align-items-center gap-1" style={{ fontSize: "0.74rem" }}>
                      <FiAlertCircle size={12} className="flex-shrink-0" />
                      <span className="fw-semibold">
                        {entityFilter === "customers" ? "Customer already exists" : "Supplier already exists"}
                      </span>
                    </div>
                  )}
                </div>

                {/* 2. Total Amount & Amount Paid */}
                <div className="row g-2 mb-2">
                  <div className="col-6">
                    <label className="form-label small fw-bold text-dark mb-1">
                      Total Amount (Rs.)
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      className="form-control form-control-sm"
                      placeholder="0.00"
                      value={newSupplierForm.totalAmount}
                      onChange={(e) =>
                        setNewSupplierForm((prev) => ({ ...prev, totalAmount: e.target.value }))
                      }
                      disabled={isSubmittingSupplier}
                    />
                  </div>

                  <div className="col-6">
                    <div className="d-flex justify-content-between align-items-center mb-1">
                      <label className="form-label small fw-bold text-dark mb-0">
                        Amount Paid (Rs.)
                      </label>
                      {Number(newSupplierForm.totalAmount) > 0 && (
                        <button
                          type="button"
                          className="btn btn-link text-primary p-0 text-decoration-none fw-semibold"
                          style={{ fontSize: "0.68rem" }}
                          onClick={() =>
                            setNewSupplierForm((prev) => ({
                              ...prev,
                              amountPaid: prev.totalAmount,
                            }))
                          }
                          tabIndex={-1}
                        >
                          Paid Full
                        </button>
                      )}
                    </div>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      className="form-control form-control-sm"
                      placeholder="0.00"
                      value={newSupplierForm.amountPaid}
                      onChange={(e) =>
                        setNewSupplierForm((prev) => ({ ...prev, amountPaid: e.target.value }))
                      }
                      disabled={isSubmittingSupplier}
                    />
                  </div>
                </div>

                {/* 3. Live Balance Due Preview */}
                <div className="p-2 px-3 rounded-2 bg-light border mb-2">
                  <div className="d-flex justify-content-between align-items-center mb-1" style={{ fontSize: "0.75rem" }}>
                    <span className="text-secondary">
                      Total: <strong className="text-dark font-monospace">Rs. {(Number(newSupplierForm.totalAmount) || 0).toLocaleString()}</strong>
                    </span>
                    <span className="text-secondary">
                      Paid: <strong className="text-success font-monospace">Rs. {(Number(newSupplierForm.amountPaid) || 0).toLocaleString()}</strong>
                    </span>
                  </div>
                  <div className="border-top pt-1 d-flex justify-content-between align-items-center">
                    <span className="small fw-bold text-dark" style={{ fontSize: "0.75rem" }}>Remaining Due:</span>
                    <span
                      className={`fw-bold font-monospace px-2 py-0 rounded small ${Math.max(
                        0,
                        (Number(newSupplierForm.totalAmount) || 0) -
                        (Number(newSupplierForm.amountPaid) || 0)
                      ) > 0
                        ? "bg-danger text-white"
                        : "bg-success text-white"
                        }`}
                      style={{ fontSize: "0.72rem" }}
                    >
                      Rs.{" "}
                      {Math.max(
                        0,
                        (Number(newSupplierForm.totalAmount) || 0) -
                        (Number(newSupplierForm.amountPaid) || 0)
                      ).toLocaleString()}
                    </span>
                  </div>
                </div>

                <div className="text-muted small text-center" style={{ fontSize: "0.7rem" }}>
                  <FiCheckCircle size={11} className="text-primary me-1" />
                  Products and stock items can be added anytime from the Buy Stock station.
                </div>
              </div>

              {/* Modal Footer */}
              <div className="card-footer bg-white border-top py-2 px-3 d-flex justify-content-end gap-2">
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary px-3"
                  onClick={() => setShowCreateSupplierModal(false)}
                  disabled={isSubmittingSupplier}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-sm btn-dark px-3 d-inline-flex align-items-center gap-1 shadow-sm"
                  disabled={isSubmittingSupplier || !newSupplierForm.name.trim() || isDuplicateSupplier}
                >
                  {isSubmittingSupplier ? (
                    <>
                      <span className="spinner-border spinner-border-sm" role="status" />
                      <span>Creating...</span>
                    </>
                  ) : (
                    <>
                      <FiPlus size={13} />
                      <span>Create {entityFilter === "customers" ? "Customer" : "Supplier"}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
