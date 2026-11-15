import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import api from "../api/axios";
import Swal from "sweetalert2";
import {
    FiSave,
    FiX,
    FiCheckCircle,
    FiUser,
    FiPackage,
    FiHash,
    FiShuffle,
    FiPlus,
    FiTrash2,
    FiEdit2,
    FiChevronDown,
    FiChevronUp,
    FiCopy,
    FiCheck,
    FiLayers,
    FiShoppingCart,
    FiAlertTriangle,
    FiAlertCircle,
    FiList,
    FiCalendar,
    FiCreditCard,
    FiSearch,
    FiMinus,
    FiPrinter,
} from "react-icons/fi";
import DatePicker from "../components/DatePicker";
import { formatUnit, formatFullAmount } from "../utils/unitChanger";
import StockReceiptModal, {
    RECEIPT_TERMS,
    formatDateTimeAmPm,
    formatFullDateTimeAmPm,
} from "../components/add-stock/StockReceiptModal";
import SaleReceiptModal from "../components/sales/SaleReceiptModal";
import { MOBILE_MODELS } from "../data/mobileModels";

export const STORAGE_PRESETS = ["16GB", "32GB", "64GB", "128GB", "256GB", "512GB", "1TB"];

export const PHONE_COLOR_PRESETS = [
    // Apple iPhone
    "Natural Titanium",
    "Desert Titanium",
    "Black Titanium",
    "White Titanium",
    "Blue Titanium",
    "Space Black",
    "Deep Purple",
    "Midnight",
    "Starlight",
    "Sierra Blue",
    "Alpine Green",
    "Gold",
    "Silver",
    "Space Gray",
    "Pacific Blue",
    "Graphite",
    "Product(RED)",
    // Google Pixel
    "Obsidian",
    "Porcelain",
    "Hazel",
    "Bay",
    "Rose",
    "Mint",
    "Wintergreen",
    "Peony",
    "Stormy Black",
    "Cloudy White",
    "Sorta Sunny",
    "Clearly White",
    "Just Black",
    "Snow",
    "Lemongrass",
    "Sea",
    "Charcoal",
    "Aloe",
    // Generic
    "Black",
    "White",
    "Blue",
    "Green",
];

const getTodayDate = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
};

const FormError = ({ message }) => {
    const [text, setText] = useState(message || "");
    const [isOpen, setIsOpen] = useState(Boolean(message));

    useEffect(() => {
        if (message) {
            setText(message);
            const raf = requestAnimationFrame(() => setIsOpen(true));
            return () => cancelAnimationFrame(raf);
        } else {
            setIsOpen(false);
            const timer = setTimeout(() => {
                setText("");
            }, 260);
            return () => clearTimeout(timer);
        }
    }, [message]);

    if (!text && !isOpen) return null;

    return (
        <div className={`pos-error-wrapper ${isOpen ? "show" : ""}`}>
            <div className="pos-error-content">
                <div className="pos-error-text">{text}</div>
            </div>
        </div>
    );
};

const getNextUniqueSupplierName = (baseName, existingSuppliers = [], stagedItems = []) => {
    const raw = (baseName || "Supplier").trim();
    if (!raw) return "Supplier #1";

    const hashMatch = raw.match(/^(.*?)\s*#\s*(\d+)$/i);
    const spaceMatch = raw.match(/^(.*?)\s+(\d+)$/i);
    let prefix = raw;
    if (hashMatch) {
        prefix = hashMatch[1].trim();
    } else if (spaceMatch) {
        prefix = spaceMatch[1].trim();
    }
    if (!prefix) prefix = "Supplier";

    const allNames = [
        ...existingSuppliers.map((s) => (typeof s === "string" ? s : s?.name || "")),
        ...stagedItems.map((it) => it.supplier || ""),
    ];

    const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`^${escapedPrefix}(?:\\s*#?\\s*(\\d+))?$`, "i");

    let maxNum = 1;
    let foundAny = false;

    for (const n of allNames) {
        if (!n || typeof n !== "string") continue;
        const pMatch = n.trim().match(pattern);
        if (pMatch) {
            foundAny = true;
            const num = pMatch[1] ? parseInt(pMatch[1], 10) : 1;
            if (!isNaN(num) && num > maxNum) {
                maxNum = num;
            }
        }
    }

    if (!foundAny) {
        return raw;
    }

    const nextNum = maxNum + 1;
    if (/^random\s*supplier$/i.test(prefix)) {
        return `Random Supplier #${nextNum}`;
    }
    return `${prefix} #${nextNum}`;
};

const AddStock = () => {
    const [stagedItems, setStagedItems] = useState([]);

    const initialItemState = {
        category: "Mobile",
        productName: "",
        storage: "",
        color: "",
        supplier: "",
        supplierId: null,
        isExistingSupplier: false,
        customerName: "",
        customerId: null,
        isExistingCustomer: false,
        purchaseDate: getTodayDate(),
        quantity: "1",
        priceMode: "unit",
        purchasePrice: "",
        estimatedPriceMode: "unit",
        estimatedSalePrice: "",
        barcodes: [""],
        isLocalPurchase: false,
    };

    const [currentItem, setCurrentItem] = useState(initialItemState);
    const [editingItemId, setEditingItemId] = useState(null);

    // Batch Payment Settlement State
    const [batchAmountPaid, setBatchAmountPaid] = useState("");
    const [isBatchFullPayment, setIsBatchFullPayment] = useState(false);
    const [batchPaymentError, setBatchPaymentError] = useState("");

    const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);
    const supplierDropdownRef = useRef(null);

    const [expandedBarcodeDrawers, setExpandedBarcodeDrawers] = useState({});
    const [itemErrors, setItemErrors] = useState({});
    const [serverError, setServerError] = useState("");
    const [copiedBarcode, setCopiedBarcode] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isDebtBreakdownOpen, setIsDebtBreakdownOpen] = useState(true);

    const [existingSuppliers, setExistingSuppliers] = useState([]);
    const [isSearchingDb, setIsSearchingDb] = useState(false);
    const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
    const searchAbortControllerRef = useRef(null);

    // Customer State for Local Purchase Autocomplete
    const [existingCustomers, setExistingCustomers] = useState([]);
    const [isSearchingCustomers, setIsSearchingCustomers] = useState(false);
    const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
    const [activeCustomerIndex, setActiveCustomerIndex] = useState(-1);
    const customerSearchAbortControllerRef = useRef(null);

    // Quick Select Mobile Models Filter State
    const [forceShowAllModels, setForceShowAllModels] = useState(false);

    const visibleMobileModels = useMemo(() => {
        if (!Array.isArray(MOBILE_MODELS)) return [];
        if (forceShowAllModels) return MOBILE_MODELS;

        const query = (currentItem.productName || "").trim().toLowerCase();
        if (!query) return MOBILE_MODELS;

        const words = query.split(/\s+/).filter(Boolean);
        return MOBILE_MODELS.filter((modelName) => {
            const lower = modelName.toLowerCase();
            return words.every((word) => lower.includes(word));
        });
    }, [currentItem.productName, forceShowAllModels]);

    // ========================================================
    // SALE MODE & POS CART STATE (Image 2 Match)
    // ========================================================
    const [isSaleMode, setIsSaleMode] = useState(false);
    const [salesCart, setSalesCart] = useState([]);
    const [posSearchQuery, setPosSearchQuery] = useState("");
    const [posSearchResults, setPosSearchResults] = useState([]);
    const [isSearchingPos, setIsSearchingPos] = useState(false);
    const [showPosSearchDropdown, setShowPosSearchDropdown] = useState(false);
    const [isSubmittingSale, setIsSubmittingSale] = useState(false);
    const [completedSaleData, setCompletedSaleData] = useState(null);
    const [completedStockBatchReceipt, setCompletedStockBatchReceipt] = useState(null);
    const [lastStockReceipt, setLastStockReceipt] = useState(null);
    const posSearchDropdownRef = useRef(null);
    const posSearchInputRef = useRef(null);

    const searchInventoryForSale = useCallback(async (query) => {
        try {
            setIsSearchingPos(true);
            const q = (query || "").trim();
            const url = q ? `/stock?search=${encodeURIComponent(q)}&limit=15` : `/stock?limit=15`;
            const res = await api.get(url);
            if (res.data?.success && Array.isArray(res.data.data)) {
                setPosSearchResults(res.data.data);
            }
        } catch (err) {
            console.error("Failed to search inventory for sale:", err);
        } finally {
            setIsSearchingPos(false);
        }
    }, []);

    useEffect(() => {
        if (!isSaleMode) return;
        const timer = setTimeout(() => {
            searchInventoryForSale(posSearchQuery);
        }, 250);
        return () => clearTimeout(timer);
    }, [posSearchQuery, isSaleMode, searchInventoryForSale]);

    useEffect(() => {
        if (isSaleMode && posSearchResults.length === 0) {
            searchInventoryForSale("");
        }
    }, [isSaleMode, posSearchResults.length, searchInventoryForSale]);

    const searchSuppliersInDb = useCallback(async (query) => {
        if (searchAbortControllerRef.current) {
            searchAbortControllerRef.current.abort();
        }
        const controller = new AbortController();
        searchAbortControllerRef.current = controller;

        const cleanQ = (query || "").trim();
        try {
            setIsSearchingDb(true);
            const url = cleanQ
                ? `/suppliers?type=supplier&suppliersOnly=true&search=${encodeURIComponent(cleanQ)}&limit=15`
                : `/suppliers?type=supplier&suppliersOnly=true&limit=15`;
            const res = await api.get(url, { signal: controller.signal });
            if (res.data?.success && Array.isArray(res.data.data)) {
                const pureSuppliers = res.data.data.filter((s) => !s?.isCustomer && s?.type !== "customer");
                setExistingSuppliers((prev) => {
                    const map = new Map();
                    pureSuppliers.forEach((s) => {
                        const id = typeof s === "object" ? s._id : s;
                        map.set(String(id), s);
                    });
                    prev.forEach((s) => {
                        if (!s?.isCustomer && s?.type !== "customer") {
                            const id = typeof s === "object" ? s._id : s;
                            if (!map.has(String(id))) {
                                map.set(String(id), s);
                            }
                        }
                    });
                    return Array.from(map.values());
                });
            }
        } catch (err) {
            if (err?.name !== "CanceledError" && err?.code !== "ERR_CANCELED") {
                console.error("Live DB supplier search failed:", err);
            }
        } finally {
            setIsSearchingDb(false);
        }
    }, []);

    const fetchExistingSuppliers = useCallback(async () => {
        try {
            const res = await api.get("/suppliers?type=supplier&suppliersOnly=true&limit=50");
            if (res.data?.success && Array.isArray(res.data.data)) {
                const pureSuppliers = res.data.data.filter((s) => !s?.isCustomer && s?.type !== "customer");
                setExistingSuppliers(pureSuppliers);
            }
        } catch (err) {
            console.error("Failed to load existing suppliers:", err);
        }
    }, []);

    const searchCustomersInDb = useCallback(async (query) => {
        if (customerSearchAbortControllerRef.current) {
            customerSearchAbortControllerRef.current.abort();
        }
        const controller = new AbortController();
        customerSearchAbortControllerRef.current = controller;

        const cleanQ = (query || "").trim();
        try {
            setIsSearchingCustomers(true);
            const supUrl = cleanQ
                ? `/suppliers?type=customer&search=${encodeURIComponent(cleanQ)}&limit=50`
                : `/suppliers?type=customer&limit=50`;
            const custUrl = cleanQ
                ? `/customers?search=${encodeURIComponent(cleanQ)}&limit=50`
                : `/customers?limit=50`;

            const [supCustRes, custRes] = await Promise.allSettled([
                api.get(supUrl, { signal: controller.signal }),
                api.get(custUrl, { signal: controller.signal }),
            ]);

            const fetched = [];
            if (supCustRes.status === "fulfilled" && supCustRes.value?.data?.success && Array.isArray(supCustRes.value.data.data)) {
                fetched.push(...supCustRes.value.data.data);
            }
            if (custRes.status === "fulfilled" && custRes.value?.data?.success && Array.isArray(custRes.value.data.data)) {
                fetched.push(...custRes.value.data.data);
            }

            if (fetched.length > 0) {
                setExistingCustomers((prev) => {
                    const map = new Map();
                    fetched.forEach((c) => {
                        const id = typeof c === "object" ? c._id : c;
                        map.set(String(id), { ...c, isCustomer: true, type: "customer" });
                    });
                    prev.forEach((c) => {
                        const id = typeof c === "object" ? c._id : c;
                        if (!map.has(String(id))) {
                            map.set(String(id), { ...c, isCustomer: true, type: "customer" });
                        }
                    });
                    return Array.from(map.values());
                });
            }
        } catch (err) {
            if (err?.name !== "CanceledError" && err?.code !== "ERR_CANCELED") {
                console.error("Live DB customer search failed:", err);
            }
        } finally {
            setIsSearchingCustomers(false);
        }
    }, []);

    const fetchExistingCustomers = useCallback(async () => {
        try {
            const [supCustRes, custRes] = await Promise.allSettled([
                api.get("/suppliers?type=customer&limit=100"),
                api.get("/customers?limit=100"),
            ]);

            const map = new Map();
            if (supCustRes.status === "fulfilled" && supCustRes.value?.data?.success && Array.isArray(supCustRes.value.data.data)) {
                supCustRes.value.data.data.forEach((c) => {
                    const id = typeof c === "object" ? c._id : c;
                    map.set(String(id), { ...c, isCustomer: true, type: "customer" });
                });
            }
            if (custRes.status === "fulfilled" && custRes.value?.data?.success && Array.isArray(custRes.value.data.data)) {
                custRes.value.data.data.forEach((c) => {
                    const id = typeof c === "object" ? c._id : c;
                    const existing = map.get(String(id));
                    map.set(String(id), { ...c, ...existing, isCustomer: true, type: "customer" });
                });
            }

            setExistingCustomers(Array.from(map.values()));
        } catch (err) {
            console.error("Failed to load existing customers:", err);
        }
    }, []);

    useEffect(() => {
        fetchExistingSuppliers();
        fetchExistingCustomers();
    }, [fetchExistingSuppliers, fetchExistingCustomers]);

    useEffect(() => {
        const q = (currentItem.supplier || "").trim();
        const timer = setTimeout(() => {
            if (!currentItem.isLocalPurchase) {
                searchSuppliersInDb(q);
            } else {
                searchCustomersInDb(q);
            }
        }, 250);

        return () => clearTimeout(timer);
    }, [currentItem.supplier, currentItem.isLocalPurchase, searchSuppliersInDb, searchCustomersInDb]);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (
                supplierDropdownRef.current &&
                !supplierDropdownRef.current.contains(e.target)
            ) {
                setShowSupplierDropdown(false);
                setShowCustomerDropdown(false);
                setActiveSuggestionIndex(-1);
                setActiveCustomerIndex(-1);
            }
            if (
                posSearchDropdownRef.current &&
                !posSearchDropdownRef.current.contains(e.target)
            ) {
                setShowPosSearchDropdown(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    const supplierQuery = (currentItem.supplier || "").trim();
    const supplierQueryLower = supplierQuery.toLowerCase();

    const matchingSuppliers = useMemo(() => {
        if (!existingSuppliers || existingSuppliers.length === 0) return [];
        const baseSuppliers = existingSuppliers.filter((s) => !s?.isCustomer && s?.type !== "customer");
        if (!supplierQueryLower) {
            return baseSuppliers.slice(0, 10);
        }

        const chars = supplierQueryLower.split("").filter((c) => c.trim().length > 0);
        const subseqRegex =
            chars.length > 1
                ? new RegExp(chars.map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*"), "i")
                : null;

        const getScore = (name) => {
            const nLower = (name || "").toLowerCase();
            if (nLower === supplierQueryLower) return 0;
            if (nLower.startsWith(supplierQueryLower)) return 1;
            const words = nLower.split(/\s+/);
            if (words.some((w) => w.startsWith(supplierQueryLower))) return 2;
            if (nLower.includes(supplierQueryLower)) return 3;
            if (subseqRegex && subseqRegex.test(nLower)) return 4;
            return 999;
        };

        const filtered = baseSuppliers.filter((s) => {
            const name = typeof s === "string" ? s : s?.name || "";
            return getScore(name) < 999;
        });

        filtered.sort((a, b) => {
            const nameA = typeof a === "string" ? a : a?.name || "";
            const nameB = typeof b === "string" ? b : b?.name || "";
            const scoreA = getScore(nameA);
            const scoreB = getScore(nameB);
            if (scoreA !== scoreB) return scoreA - scoreB;
            const dueA = Number(a?.totalDue || 0);
            const dueB = Number(b?.totalDue || 0);
            if (dueB !== dueA) return dueB - dueA;
            return nameA.localeCompare(nameB);
        });

        return filtered.slice(0, 10);
    }, [existingSuppliers, supplierQueryLower]);

    const matchingCustomers = useMemo(() => {
        if (!existingCustomers || existingCustomers.length === 0) return [];

        // Filter out records that are explicitly purely non-customer suppliers
        const baseCustomers = existingCustomers.filter((c) => {
            if (c?.type === "supplier" && !c?.isCustomer) return false;
            return true;
        });

        // Deduplicate customers strictly by unique account ID (_id) so each customer in the database is shown
        const seenIds = new Set();
        const uniqueCustomers = [];
        for (const c of baseCustomers) {
            const id = String(typeof c === "object" ? c._id : c);
            if (!id || seenIds.has(id)) continue;
            seenIds.add(id);
            uniqueCustomers.push(c);
        }

        if (!supplierQueryLower) {
            return uniqueCustomers.slice(0, 20);
        }

        const chars = supplierQueryLower.split("").filter((c) => c.trim().length > 0);
        const subseqRegex =
            chars.length > 1
                ? new RegExp(chars.map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*"), "i")
                : null;

        const getScore = (name) => {
            const nLower = (name || "").toLowerCase();
            if (nLower === supplierQueryLower) return 0;
            if (nLower.startsWith(supplierQueryLower)) return 1;
            const words = nLower.split(/\s+/);
            if (words.some((w) => w.startsWith(supplierQueryLower))) return 2;
            if (nLower.includes(supplierQueryLower)) return 3;
            if (subseqRegex && subseqRegex.test(nLower)) return 4;
            return 999;
        };

        const filtered = uniqueCustomers.filter((c) => {
            const name = typeof c === "string" ? c : c?.name || "";
            const phone = typeof c === "object" ? c?.phone || "" : "";
            if (phone && phone.toLowerCase().includes(supplierQueryLower)) return true;
            return getScore(name) < 999;
        });

        filtered.sort((a, b) => {
            const nameA = typeof a === "string" ? a : a?.name || "";
            const nameB = typeof b === "string" ? b : b?.name || "";
            const scoreA = getScore(nameA);
            const scoreB = getScore(nameB);
            if (scoreA !== scoreB) return scoreA - scoreB;
            const dueA = Number(a?.totalDue != null ? a.totalDue : (a?.balance || 0));
            const dueB = Number(b?.totalDue != null ? b.totalDue : (b?.balance || 0));
            if (dueB !== dueA) return dueB - dueA;
            return nameA.localeCompare(nameB);
        });

        return filtered.slice(0, 15);
    }, [existingCustomers, supplierQueryLower]);



    const selectedSupplierObj = useMemo(() => {
        if (!currentItem.supplierId) return null;
        return existingSuppliers.find(
            (s) => String(typeof s === "object" ? s._id : s) === String(currentItem.supplierId)
        );
    }, [existingSuppliers, currentItem.supplierId]);

    const handleSelectSupplier = (s) => {
        const sName = typeof s === "string" ? s : s?.name || "";
        const sId = typeof s === "object" ? s?._id : null;
        setCurrentItem((prev) => ({
            ...prev,
            supplier: sName,
            supplierId: sId,
            customerName: "",
            customerId: null,
            isExistingSupplier: Boolean(sId),
            isExistingCustomer: false,
        }));
        setShowSupplierDropdown(false);
        setActiveSuggestionIndex(-1);
        if (itemErrors.supplier) {
            setItemErrors((prev) => {
                const u = { ...prev };
                delete u.supplier;
                return u;
            });
        }
        if (serverError) setServerError("");
    };

    const handleSelectCustomer = (c) => {
        const cName = typeof c === "string" ? c : c?.name || "";
        const cId = typeof c === "object" ? c?._id : null;
        setCurrentItem((prev) => ({
            ...prev,
            supplier: cName,
            supplierId: null,
            customerName: cName,
            customerId: cId,
            isExistingCustomer: Boolean(cId),
            isExistingSupplier: false,
        }));
        setShowCustomerDropdown(false);
        setActiveCustomerIndex(-1);
        if (itemErrors.supplier) {
            setItemErrors((prev) => {
                const u = { ...prev };
                delete u.supplier;
                return u;
            });
        }
        if (serverError) setServerError("");
    };

    const handleSupplierInputChange = (e) => {
        const val = e.target.value;
        if (currentItem.isLocalPurchase) {
            setCurrentItem((prev) => ({
                ...prev,
                supplier: val,
                supplierId: null,
                customerName: val,
                customerId: null,
                isExistingCustomer: false,
                isExistingSupplier: false,
            }));
            setShowCustomerDropdown(true);
            setShowSupplierDropdown(false);
            setActiveCustomerIndex(-1);
        } else {
            setCurrentItem((prev) => ({
                ...prev,
                supplier: val,
                supplierId: null,
                customerName: "",
                customerId: null,
                isExistingSupplier: false,
                isExistingCustomer: false,
            }));
            setShowSupplierDropdown(true);
            setShowCustomerDropdown(false);
            setActiveSuggestionIndex(-1);
        }
        if (itemErrors.supplier) {
            setItemErrors((prev) => {
                const u = { ...prev };
                delete u.supplier;
                return u;
            });
        }
    };

    const handleSupplierBlur = () => {
        setTimeout(() => {
            setShowSupplierDropdown(false);
            setShowCustomerDropdown(false);
        }, 250);
    };

    const handleUnlinkEntity = () => {
        setCurrentItem((prev) => ({
            ...prev,
            supplierId: null,
            customerId: null,
            isExistingSupplier: false,
            isExistingCustomer: false,
        }));
    };

    const handleClearSupplier = () => {
        setCurrentItem((prev) => ({
            ...prev,
            supplier: "",
            supplierId: null,
            customerName: "",
            customerId: null,
            isExistingSupplier: false,
            isExistingCustomer: false,
        }));
        if (currentItem.isLocalPurchase) {
            setShowCustomerDropdown(true);
            setActiveCustomerIndex(-1);
        } else {
            setShowSupplierDropdown(true);
            setActiveSuggestionIndex(-1);
        }
    };

    const handleSupplierKeyDown = (e) => {
        if (currentItem.isLocalPurchase) {
            if (!showCustomerDropdown || matchingCustomers.length === 0) {
                if (e.key === "ArrowDown") {
                    setShowCustomerDropdown(true);
                }
                return;
            }
            if (e.key === "ArrowDown") {
                e.preventDefault();
                setActiveCustomerIndex((prev) => (prev < matchingCustomers.length - 1 ? prev + 1 : 0));
            } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActiveCustomerIndex((prev) => (prev > 0 ? prev - 1 : matchingCustomers.length - 1));
            } else if (e.key === "Enter") {
                if (activeCustomerIndex >= 0 && activeCustomerIndex < matchingCustomers.length) {
                    e.preventDefault();
                    handleSelectCustomer(matchingCustomers[activeCustomerIndex]);
                }
            } else if (e.key === "Escape") {
                setShowCustomerDropdown(false);
                setActiveCustomerIndex(-1);
            }
        } else {
            if (!showSupplierDropdown || matchingSuppliers.length === 0) {
                if (e.key === "ArrowDown") {
                    setShowSupplierDropdown(true);
                }
                return;
            }

            if (e.key === "ArrowDown") {
                e.preventDefault();
                setActiveSuggestionIndex((prev) => (prev < matchingSuppliers.length - 1 ? prev + 1 : 0));
            } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActiveSuggestionIndex((prev) => (prev > 0 ? prev - 1 : matchingSuppliers.length - 1));
            } else if (e.key === "Enter") {
                if (activeSuggestionIndex >= 0 && activeSuggestionIndex < matchingSuppliers.length) {
                    e.preventDefault();
                    handleSelectSupplier(matchingSuppliers[activeSuggestionIndex]);
                }
            } else if (e.key === "Escape") {
                setShowSupplierDropdown(false);
                setActiveSuggestionIndex(-1);
            }
        }
    };

    const barcodeInputRefs = useRef([]);

    const currentQty = parseInt(currentItem.quantity, 10) || 0;
    const currentPurchasePrice = parseFloat(currentItem.purchasePrice) || 0;

    const computedUnitPrice = useMemo(() => {
        if (currentItem.priceMode === "unit") {
            return currentPurchasePrice;
        }
        return currentQty > 0 ? Number((currentPurchasePrice / currentQty).toFixed(2)) : 0;
    }, [currentItem.priceMode, currentPurchasePrice, currentQty]);

    const computedSubtotal = useMemo(() => {
        if (currentItem.priceMode === "unit") {
            return currentQty > 0 && currentPurchasePrice > 0
                ? Number((currentQty * currentPurchasePrice).toFixed(2))
                : 0;
        }
        return currentPurchasePrice > 0 ? Number(currentPurchasePrice.toFixed(2)) : 0;
    }, [currentItem.priceMode, currentPurchasePrice, currentQty]);

    const parsedEstPrice = parseFloat(currentItem.estimatedSalePrice);
    const hasValidEstPrice =
        !isNaN(parsedEstPrice) &&
        parsedEstPrice >= 0 &&
        currentItem.estimatedSalePrice !== "";

    const computedEstimatedUnitPrice = useMemo(() => {
        if (!hasValidEstPrice) return null;
        if (currentItem.estimatedPriceMode === "unit") {
            return Number(parsedEstPrice.toFixed(2));
        }
        return currentQty > 0 ? Number((parsedEstPrice / currentQty).toFixed(2)) : 0;
    }, [hasValidEstPrice, currentItem.estimatedPriceMode, parsedEstPrice, currentQty]);

    const computedEstimatedTotalSaleValue = useMemo(() => {
        if (!hasValidEstPrice) return null;
        if (currentItem.estimatedPriceMode === "total") {
            return Number(parsedEstPrice.toFixed(2));
        }
        return currentQty > 0 ? Number((parsedEstPrice * currentQty).toFixed(2)) : 0;
    }, [hasValidEstPrice, currentItem.estimatedPriceMode, parsedEstPrice, currentQty]);

    const handleEstimatedPriceModeChange = (newMode) => {
        if (newMode === currentItem.estimatedPriceMode) return;
        setCurrentItem((prev) => {
            let nextVal = prev.estimatedSalePrice;
            if (hasValidEstPrice) {
                if (newMode === "total" && computedEstimatedTotalSaleValue != null) {
                    nextVal = String(computedEstimatedTotalSaleValue);
                } else if (newMode === "unit" && computedEstimatedUnitPrice != null) {
                    nextVal = String(computedEstimatedUnitPrice);
                }
            }
            return {
                ...prev,
                estimatedPriceMode: newMode,
                estimatedSalePrice: nextVal,
            };
        });
    };

    const handleEstimatedSalePriceChange = (e) => {
        const val = e.target.value;
        setCurrentItem((prev) => ({
            ...prev,
            estimatedSalePrice: val,
        }));
        if (itemErrors.estimatedSalePrice) {
            setItemErrors((prev) => {
                const u = { ...prev };
                delete u.estimatedSalePrice;
                return u;
            });
        }
    };

    // ========================================================
    // SALES CART ACTIONS & HANDLERS (Image 2 Match)
    // ========================================================
    // ========================================================
    // SALES CART ACTIONS & HANDLERS (Image 2 Match)
    // ========================================================

    // Helper: Resolves matching IMEI / barcode for a product based on search query or available units
    const resolveTargetBarcode = useCallback(
        (product, query = null) => {
            if (!product) return null;
            const q = (query !== null ? query : posSearchQuery || "").trim().toLowerCase();
            const serializedUnits = Array.isArray(product.serializedUnits) ? product.serializedUnits : [];
            const barcodes = Array.isArray(product.barcodes) ? product.barcodes : [];

            // Existing barcodes already in salesCart
            const existingInCartBarcodes = new Set();
            salesCart.forEach((it) => {
                if (it.barcode && it.barcode !== "N/A") existingInCartBarcodes.add(it.barcode.toLowerCase());
                if (Array.isArray(it.barcodes)) {
                    it.barcodes.forEach((b) => b && existingInCartBarcodes.add(b.toLowerCase()));
                }
            });

            // 1. If user typed or searched an IMEI, prioritize matching that exact searched IMEI
            if (q) {
                // Exact match in serializedUnits
                const exactUnit =
                    serializedUnits.find((u) => u.barcode && u.barcode.toLowerCase() === q && u.status === "available") ||
                    serializedUnits.find((u) => u.barcode && u.barcode.toLowerCase() === q);
                if (exactUnit) return exactUnit.barcode;

                // Exact match in barcodes array
                const exactBc = barcodes.find((b) => b && b.toLowerCase() === q);
                if (exactBc) return exactBc;

                // Substring match in serializedUnits
                const subUnit =
                    serializedUnits.find(
                        (u) =>
                            u.barcode &&
                            u.barcode.toLowerCase().includes(q) &&
                            u.status === "available" &&
                            !existingInCartBarcodes.has(u.barcode.toLowerCase())
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
                            !existingInCartBarcodes.has(b.toLowerCase())
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

            // 2. If no query or query didn't match an IMEI, pick first available unit not yet in cart
            const availUnitNotCart = serializedUnits.find(
                (u) => u.barcode && u.status === "available" && !existingInCartBarcodes.has(u.barcode.toLowerCase())
            );
            if (availUnitNotCart) return availUnitNotCart.barcode;

            const bcNotCart = barcodes.find((b) => b && !existingInCartBarcodes.has(b.toLowerCase()));
            if (bcNotCart) return bcNotCart;

            // Fallbacks
            if (serializedUnits.length > 0) {
                const avail = serializedUnits.find((u) => u.status === "available");
                if (avail) return avail.barcode;
                if (serializedUnits[0]?.barcode) return serializedUnits[0].barcode;
            }
            if (barcodes.length > 0) return barcodes[0];
            if (product.barcode && product.barcode.toUpperCase() !== "N/A") return product.barcode;

            return null;
        },
        [posSearchQuery, salesCart]
    );

    const addItemToSalesCart = useCallback((product, explicitCode = null) => {
        if (!product) return;
        const availQty = product.quantity != null ? product.quantity : (product.availableQuantity || 1);
        if (availQty <= 0) {
            Swal.fire({
                icon: "warning",
                title: "Out of Stock",
                text: `"${product.productName}" is currently out of stock (0 pcs available).`,
                confirmButtonColor: "#09090b",
            });
            return;
        }

        const targetStockId = product.stockId || product._id;
        const resolvedCode = explicitCode || resolveTargetBarcode(product, posSearchQuery);

        setSalesCart((prevCart) => {
            const existingIdx = prevCart.findIndex(
                (it) => it.stockId === targetStockId
            );

            if (existingIdx >= 0) {
                const existing = prevCart[existingIdx];
                if (existing.quantity >= availQty) {
                    Swal.fire({
                        icon: "info",
                        title: "Max Available Quantity",
                        text: `Maximum available stock (${availQty} pcs) of "${product.productName}" is already in cart.`,
                        confirmButtonColor: "#09090b",
                    });
                    return prevCart;
                }

                // Check if this physical piece is already in cart
                if (resolvedCode && Array.isArray(existing.barcodes) && existing.barcodes.includes(resolvedCode)) {
                    Swal.fire({
                        icon: "info",
                        title: "Already in Cart",
                        text: `Unit with IEMI "${resolvedCode}" is already in this sales cart.`,
                        confirmButtonColor: "#09090b",
                    });
                    return prevCart;
                }

                const updated = [...prevCart];
                const nextQty = existing.quantity + 1;
                const updatedBarcodes = resolvedCode && !existing.barcodes.includes(resolvedCode)
                    ? [...existing.barcodes, resolvedCode]
                    : existing.barcodes;
                updated[existingIdx] = {
                    ...existing,
                    quantity: nextQty,
                    barcodes: updatedBarcodes,
                    barcode: resolvedCode || existing.barcode,
                };
                return updated;
            }

            const unitCost = Number(product.unitPrice ?? product.unitPurchaseCost ?? 0);
            const estSalePrice = product.estimatedSalePricePerUnit != null ? product.estimatedSalePricePerUnit : null;
            const initialSellingPrice = product.sellingPrice != null && product.sellingPrice !== ""
                ? String(product.sellingPrice)
                : estSalePrice != null
                    ? String(estSalePrice)
                    : "";

            // Exactly 1 piece selected for 1 piece quantity!
            const cleanBarcodes = resolvedCode
                ? [resolvedCode]
                : product.barcode && product.barcode !== "N/A"
                    ? [product.barcode]
                    : [];

            const newItem = {
                stockId: targetStockId,
                productName: product.productName,
                barcode: resolvedCode || product.barcode || (cleanBarcodes[0] || "N/A"),
                barcodes: cleanBarcodes,
                availableQuantity: availQty,
                unitPurchaseCost: unitCost,
                estimatedSalePricePerUnit: estSalePrice,
                unitSellingPrice: initialSellingPrice,
                sellingPrice: initialSellingPrice,
                quantity: 1,
                supplier: product.supplier?.name || (typeof product.supplier === "string" ? product.supplier : "Unknown"),
                category: product.category || "General",
                isLocalPurchase: Boolean(product.isLocalPurchase),
            };

            return [...prevCart, newItem];
        });
    }, [resolveTargetBarcode, posSearchQuery]);

    const handleScanOrAddFromSearch = async (codeToSearch) => {
        const code = (codeToSearch || posSearchQuery || "").trim();
        if (!code) return;

        try {
            const barcodeRes = await api.get(`/stock/barcode/${encodeURIComponent(code)}`);
            if (barcodeRes.data?.success && barcodeRes.data?.data) {
                const unit = barcodeRes.data.data;
                if (unit.status === "sold") {
                    Swal.fire({
                        icon: "warning",
                        title: "Already Sold",
                        text: `The unit with IEMI / barcode "${code}" has already been sold.`,
                        confirmButtonColor: "#09090b",
                    });
                    return;
                }
                if (unit.status && unit.status !== "available") {
                    Swal.fire({
                        icon: "warning",
                        title: "Unavailable",
                        text: `This unit is currently marked as ${unit.status}.`,
                        confirmButtonColor: "#09090b",
                    });
                    return;
                }
                addItemToSalesCart(unit, code);
                setPosSearchQuery("");
                setShowPosSearchDropdown(false);
                return;
            }
        } catch (err) {
            // Not a direct barcode hit, fallback to catalog search
        }

        if (posSearchResults.length >= 1) {
            const firstProd = posSearchResults[0];
            const avail = firstProd.quantity != null ? firstProd.quantity : (firstProd.availableQuantity || 0);
            if (avail > 0) {
                const targetBc = resolveTargetBarcode(firstProd, code);
                addItemToSalesCart(firstProd, targetBc);
                setPosSearchQuery("");
                setShowPosSearchDropdown(false);
                return;
            }
        }

        setShowPosSearchDropdown(true);
    };

    const updateSalesCartQty = (idx, newQty) => {
        setSalesCart((prev) => {
            const updated = [...prev];
            const item = updated[idx];
            if (!item) return prev;
            const parsed = parseInt(newQty, 10);
            if (isNaN(parsed) || parsed < 1) {
                updated[idx] = { ...item, quantity: 1 };
            } else {
                const clamped = Math.min(parsed, item.availableQuantity || 99999);
                updated[idx] = { ...item, quantity: clamped };
            }
            return updated;
        });
    };

    const updateSalesCartPrice = (idx, newPrice) => {
        setSalesCart((prev) => {
            const updated = [...prev];
            const item = updated[idx];
            if (!item) return prev;
            updated[idx] = {
                ...item,
                unitSellingPrice: newPrice,
                sellingPrice: newPrice,
            };
            return updated;
        });
    };

    const removeSalesCartItem = (idx) => {
        setSalesCart((prev) => prev.filter((_, i) => i !== idx));
    };

    const clearSalesCart = () => {
        setSalesCart([]);
    };

    // Sales Cart Calculations (matching image 2)
    const salesGrandTotalCost = Number(
        salesCart
            .reduce((sum, it) => sum + (Number(it.unitPurchaseCost) || 0) * (Number(it.quantity) || 1), 0)
            .toFixed(2)
    );

    const salesGrandTotalSale = Number(
        salesCart
            .reduce((sum, it) => {
                const unitVal =
                    it.unitSellingPrice !== undefined && it.unitSellingPrice !== ""
                        ? Number(it.unitSellingPrice)
                        : Number(it.sellingPrice) || 0;
                const qty = Number(it.quantity) || 1;
                return sum + unitVal * qty;
            }, 0)
            .toFixed(2)
    );

    const salesGrandTotalUnits = salesCart.reduce((sum, it) => sum + (Number(it.quantity) || 1), 0);
    const salesNetDiff = Number((salesGrandTotalSale - salesGrandTotalCost).toFixed(2));
    const isSalesProfit = salesNetDiff > 0;
    const isSalesLoss = salesNetDiff < 0;

    const handleCompleteSaleOrder = async (e) => {
        if (e && e.preventDefault) e.preventDefault();
        if (salesCart.length === 0) {
            Swal.fire({
                icon: "warning",
                title: "Sales Cart Empty",
                text: "Please search and add at least one stock item to cart to proceed.",
                confirmButtonColor: "#09090b",
            });
            return;
        }

        for (const it of salesCart) {
            const price = Number(
                it.unitSellingPrice !== undefined && it.unitSellingPrice !== ""
                    ? it.unitSellingPrice
                    : it.sellingPrice
            );
            if (isNaN(price) || price <= 0) {
                Swal.fire({
                    icon: "warning",
                    title: "Invalid Price",
                    text: `Please enter a valid selling price (> 0) for "${it.productName}".`,
                    confirmButtonColor: "#09090b",
                });
                return;
            }
        }

        const hasLeftItem = Boolean((currentItem.productName || "").trim());
        if (hasLeftItem) {
            const custName = (currentItem.supplier || "").trim();
            if (!custName) {
                Swal.fire({
                    icon: "warning",
                    title: "Customer Name Required",
                    text: "Please provide the customer name on the left form for this local purchase intake.",
                    confirmButtonColor: "#09090b",
                });
                return;
            }
            const pPrice = Number(computedUnitPrice);
            if (isNaN(pPrice) || pPrice <= 0) {
                Swal.fire({
                    icon: "warning",
                    title: "Purchase Price Required",
                    text: "Please enter a valid purchase price for the customer's item on the left.",
                    confirmButtonColor: "#09090b",
                });
                return;
            }
        }

        const confirmRes = await Swal.fire({
            title: hasLeftItem ? "Complete Sale & Local Purchase?" : "Complete Sale?",
            text: `Do you want to complete this sale for ${salesCart.length} item(s) totaling Rs. ${salesGrandTotalSale.toLocaleString()}?`,
            icon: "question",
            showCancelButton: true,
            confirmButtonColor: "#09090b",
            cancelButtonColor: "#6c757d",
            confirmButtonText: "Yes, Complete Sale!",
            cancelButtonText: "Cancel",
            reverseButtons: true,
        });

        if (!confirmRes.isConfirmed) return;

        setIsSubmittingSale(true);
        try {
            const custName = (currentItem.customerName || currentItem.supplier || "").trim();

            // If left intake item is specified, save it as local purchase stock
            let savedStockRecord = null;
            if (hasLeftItem) {
                const cleanBarcodes = (currentItem.barcodes || [])
                    .map((b) => (typeof b === "string" ? b.trim() : ""))
                    .filter((b) => b && b.toUpperCase() !== "N/A");
                const barcodeVal = cleanBarcodes[0] || "N/A";
                const intakeTotalCost = Number(currentItem.purchasePrice) || (Number(computedUnitPrice) * (Number(currentItem.quantity) || 1));
                const stockPayload = {
                    productName: currentItem.productName.trim(),
                    barcode: barcodeVal,
                    barcodes: cleanBarcodes.length > 0 ? cleanBarcodes : ["N/A"],
                    storage: currentItem.storage || "",
                    color: currentItem.color || "",
                    quantity: Number(currentItem.quantity) || 1,
                    purchasePrice: Number(currentItem.purchasePrice) || 0,
                    priceMode: currentItem.priceMode,
                    unitPrice: computedUnitPrice,
                    purchaseDate: currentItem.purchaseDate,
                    supplier: "",
                    customerName: custName,
                    customerId: currentItem.customerId || null,
                    isLocalPurchase: true,
                    amountPaid: intakeTotalCost,
                    paymentMethod: "Trade-in Credit",
                    notes: `Trade-in exchange credit applied towards sale (Customer: ${custName})`,
                    estimatedSalePricePerUnit: currentItem.estimatedSalePrice ? Number(currentItem.estimatedSalePrice) : null,
                    estimatedPriceMode: currentItem.estimatedPriceMode,
                    estimatedPrice: currentItem.estimatedSalePrice ? Number(currentItem.estimatedSalePrice) : null,
                };
                const stockRes = await api.post("/stock", stockPayload);
                if (stockRes.data?.data) {
                    savedStockRecord = stockRes.data.data;
                }
            }

            const cleanIntakeBarcodes = (currentItem.barcodes || [])
                .map((b) => (typeof b === "string" ? b.trim() : ""))
                .filter((b) => b && b.toUpperCase() !== "N/A");
            const intakeBarcode = cleanIntakeBarcodes[0] || (savedStockRecord && savedStockRecord.barcode && savedStockRecord.barcode.toUpperCase() !== "N/A" ? savedStockRecord.barcode : "N/A");

            const salesPayload = {
                items: salesCart.map((it) => {
                    const unitPriceVal = Number(
                        it.unitSellingPrice !== undefined && it.unitSellingPrice !== ""
                            ? it.unitSellingPrice
                            : it.sellingPrice
                    ) || 0;
                    const qty = Number(it.quantity) || 1;
                    const lineTotal = Number((unitPriceVal * qty).toFixed(2));
                    const cleanBarcodes = Array.isArray(it.barcodes)
                        ? it.barcodes.filter((b) => b && typeof b === "string" && b.trim() !== "" && b.toUpperCase() !== "N/A")
                        : [];
                    return {
                        stockId: it.stockId,
                        productName: it.productName,
                        barcodes: cleanBarcodes,
                        barcode: cleanBarcodes[0] || (it.barcode && it.barcode.toUpperCase() !== "N/A" ? it.barcode.trim() : "N/A"),
                        quantity: qty,
                        totalAmount: lineTotal,
                        sellingPrice: unitPriceVal,
                        unitPurchaseCost: it.unitPurchaseCost || 0,
                        costPrice: it.unitPurchaseCost || 0,
                        isSmallItem: false,
                        category: it.category || "General",
                        supplier: it.supplier || "Unknown Supplier",
                    };
                }),
                paymentMethod: "Cash",
                isExchange: hasLeftItem,
                customerName: custName,
                customerId: currentItem.customerId || null,
                tradeInItem: hasLeftItem
                    ? {
                        stockId: savedStockRecord?._id || null,
                        productName: currentItem.productName.trim(),
                        barcode: intakeBarcode,
                        barcodes: cleanIntakeBarcodes.length > 0 ? cleanIntakeBarcodes : (intakeBarcode !== "N/A" ? [intakeBarcode] : []),
                        quantity: Number(currentItem.quantity) || 1,
                        unitPrice: Number(computedUnitPrice) || 0,
                        purchasePrice: Number(currentItem.purchasePrice) || 0,
                        totalValue: Number(currentItem.purchasePrice) || (Number(computedUnitPrice) * (Number(currentItem.quantity) || 1)),
                        customerName: custName,
                        customerId: currentItem.customerId || null,
                        purchaseDate: currentItem.purchaseDate || new Date().toISOString(),
                    }
                    : null,
                notes: custName
                    ? `Customer: ${custName}${hasLeftItem ? ` (Trade-in / Local Purchase: ${currentItem.productName.trim()})` : ""}`
                    : "Sale via Add Stock / Local Sale Purchase",
            };

            const res = await api.post("/sales", salesPayload);
            if (res.data?.success) {
                const sale = res.data.data.sale;
                setCompletedSaleData(sale);
                setSalesCart([]);
                if (hasLeftItem) {
                    setCurrentItem(initialItemState);
                }
                if (typeof BroadcastChannel !== "undefined") {
                    const bc = new BroadcastChannel("pos_system_sync");
                    bc.postMessage({ type: "sale_completed" });
                    bc.postMessage({ type: "stock_updated" });
                    bc.postMessage({ type: "local_purchase_updated" });
                    bc.close();
                }
                searchInventoryForSale(posSearchQuery);
            } else {
                Swal.fire({
                    icon: "error",
                    title: "Sale Failed",
                    text: res.data?.message || "Failed to process sale.",
                    confirmButtonColor: "#09090b",
                });
            }
        } catch (err) {
            console.error("Sale processing error:", err);
            Swal.fire({
                icon: "error",
                title: "Sale Error",
                text: err.response?.data?.message || err.message || "Failed to complete transaction.",
                confirmButtonColor: "#09090b",
            });
        } finally {
            setIsSubmittingSale(false);
        }
    };

    // =========================================================================
    // HIGH-PRECISION HARDWARE SCANNER ROUTER (Zero Leakage State Machine)
    // =========================================================================
    const commitScannedBarcode = useCallback((rawBarcode, preferredSlotIndex) => {
        const codeToInsert = (rawBarcode || "").trim().replace(/\D/g, "").slice(0, 15);
        if (!codeToInsert || codeToInsert.length < 3) return;

        if (isSaleMode) {
            handleScanOrAddFromSearch(codeToInsert);
            return;
        }

        setCurrentItem((prev) => {
            const nextBarcodes = [...prev.barcodes];

            // 1. If preferredSlotIndex was an empty barcode slot, prioritize placing it there
            let targetIndex = -1;
            if (
                preferredSlotIndex !== null &&
                preferredSlotIndex >= 0 &&
                preferredSlotIndex < nextBarcodes.length
            ) {
                const val = nextBarcodes[preferredSlotIndex];
                if (!val || val.trim() === "" || val === "N/A") {
                    targetIndex = preferredSlotIndex;
                }
            }

            // 2. Otherwise, find the first available empty slot
            if (targetIndex === -1) {
                const firstEmpty = nextBarcodes.findIndex(
                    (b) => !b || b.trim() === "" || b === "N/A"
                );
                if (firstEmpty !== -1) {
                    targetIndex = firstEmpty;
                }
            }

            // 3. If all slots are full, create a new unit slot and increment quantity
            if (targetIndex === -1) {
                targetIndex = nextBarcodes.length;
                nextBarcodes.push(codeToInsert);
            } else {
                nextBarcodes[targetIndex] = codeToInsert;
            }

            // Automatically move focus: to next slot if available, else focus the current slot
            const nextFocusIndex =
                targetIndex + 1 < nextBarcodes.length ? targetIndex + 1 : targetIndex;
            setTimeout(() => {
                if (barcodeInputRefs.current[nextFocusIndex]) {
                    barcodeInputRefs.current[nextFocusIndex]?.focus();
                }
            }, 40);

            return {
                ...prev,
                quantity: String(nextBarcodes.length),
                barcodes: nextBarcodes,
            };
        });

        setItemErrors((prev) => {
            const u = { ...prev };
            delete u.barcodes;
            return u;
        });
    }, []);

    useEffect(() => {
        // Hardware Barcode Scanners transmit whole sequences at extreme speeds (< 25ms per char)
        // Fast human typists hit 35-50ms on digraphs, but cannot sustain 6+ chars at < 25ms.
        const HARDWARE_SCAN_BURST_MAX_INTERVAL_MS = 28;
        const SCAN_TIMEOUT_MS = 65;
        const MIN_BARCODE_LENGTH = 4;

        let nonInputBuffer = "";
        let nonInputLastTime = 0;
        let nonInputTimeout = null;

        // Tracks rapid bursts in active text inputs to catch hardware scanner guns without breaking fast typing
        const inputBurst = {
            chars: [],
            timestamps: [],
            initialValue: "",
            target: null,
            targetName: null,
        };

        const resetInputBurst = () => {
            inputBurst.chars = [];
            inputBurst.timestamps = [];
            inputBurst.initialValue = "";
            inputBurst.target = null;
            inputBurst.targetName = null;
        };

        const handleKeyDown = (e) => {
            // Ignore standalone modifier keys
            if (
                e.key === "Shift" ||
                e.key === "Control" ||
                e.key === "Alt" ||
                e.key === "Meta" ||
                e.key === "CapsLock"
            ) {
                return;
            }

            const activeEl = document.activeElement;
            const isInput =
                activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA");
            const isBarcodeSlot =
                isInput && activeEl.dataset?.barcodeIndex != null;

            // -------------------------------------------------------------
            // CASE 1: USER IS FOCUSED DIRECTLY IN A BARCODE INPUT SLOT
            // -------------------------------------------------------------
            if (isBarcodeSlot) {
                resetInputBurst();
                nonInputBuffer = "";
                return;
            }

            // -------------------------------------------------------------
            // CASE 2: USER IS FOCUSED IN A REGULAR FORM INPUT (Product Name, Price, etc.)
            // -------------------------------------------------------------
            // CRITICAL: NEVER blur, NEVER preventDefault on normal typing!
            // Human typing must flow with 100% fidelity without cursor jumping!
            if (isInput) {
                const now = Date.now();

                // If Enter/Tab arrives, check if a hardware barcode scanner burst just completed
                if (e.key === "Enter" || e.key === "Tab") {
                    const count = inputBurst.chars.length;
                    if (count >= MIN_BARCODE_LENGTH && inputBurst.target === activeEl) {
                        // Calculate average and maximum interval across all captured burst characters
                        let totalInterval = 0;
                        let maxInterval = 0;
                        for (let i = 1; i < count; i++) {
                            const interval = inputBurst.timestamps[i] - inputBurst.timestamps[i - 1];
                            totalInterval += interval;
                            if (interval > maxInterval) maxInterval = interval;
                        }
                        const avgInterval = count > 1 ? totalInterval / (count - 1) : 999;

                        // Hardware scanners have average interval <= 28ms and max <= 40ms
                        const isAuthenticHardwareScanner =
                            avgInterval <= HARDWARE_SCAN_BURST_MAX_INTERVAL_MS && maxInterval <= 42;

                        if (isAuthenticHardwareScanner) {
                            // Authentic scanner gun scanned into this input!
                            e.preventDefault();
                            e.stopPropagation();

                            const scannedCode = inputBurst.chars.join("");
                            const fieldName = inputBurst.targetName;
                            const valBefore = inputBurst.initialValue;

                            // Revert the scanned barcode text from the regular text input
                            if (activeEl) {
                                activeEl.value = valBefore;
                            }
                            if (fieldName) {
                                setCurrentItem((prev) => ({
                                    ...prev,
                                    [fieldName]: valBefore,
                                }));
                            }

                            resetInputBurst();
                            commitScannedBarcode(scannedCode, null);
                            return;
                        }
                    }

                    // Not a hardware scanner; allow normal Enter key behavior
                    resetInputBurst();
                    return;
                }

                // Printable character typed inside active input: Let it pass naturally!
                if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
                    const lastTime = inputBurst.timestamps.length > 0
                        ? inputBurst.timestamps[inputBurst.timestamps.length - 1]
                        : 0;
                    const delta = now - lastTime;

                    if (inputBurst.target === activeEl && delta <= 40) {
                        inputBurst.chars.push(e.key);
                        inputBurst.timestamps.push(now);
                    } else {
                        inputBurst.chars = [e.key];
                        inputBurst.timestamps = [now];
                        inputBurst.initialValue = activeEl.value || "";
                        inputBurst.target = activeEl;
                        inputBurst.targetName = activeEl.name || null;
                    }
                } else {
                    resetInputBurst();
                }

                // Normal human typing continues without ANY interference or cursor jumping
                return;
            }

            // -------------------------------------------------------------
            // CASE 3: NO INPUT IS FOCUSED (BODY / CONTAINER / BUTTON)
            // -------------------------------------------------------------
            // A hardware barcode scanner was triggered while user has no input focused.
            const now = Date.now();

            if (e.key === "Enter" || e.key === "Tab") {
                if (nonInputBuffer.length >= MIN_BARCODE_LENGTH) {
                    e.preventDefault();
                    e.stopPropagation();

                    const code = nonInputBuffer.trim();
                    nonInputBuffer = "";
                    if (nonInputTimeout) clearTimeout(nonInputTimeout);

                    commitScannedBarcode(code, null);
                }
                return;
            }

            if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
                const delta = nonInputLastTime ? now - nonInputLastTime : 999999;
                nonInputLastTime = now;

                if (delta <= 75 || nonInputBuffer.length === 0) {
                    nonInputBuffer += e.key;

                    if (nonInputTimeout) clearTimeout(nonInputTimeout);
                    nonInputTimeout = setTimeout(() => {
                        if (nonInputBuffer.length >= MIN_BARCODE_LENGTH) {
                            const code = nonInputBuffer.trim();
                            nonInputBuffer = "";
                            commitScannedBarcode(code, null);
                        } else {
                            nonInputBuffer = "";
                        }
                    }, SCAN_TIMEOUT_MS);
                } else {
                    nonInputBuffer = e.key;
                }
            }
        };

        window.addEventListener("keydown", handleKeyDown, true);
        return () => {
            window.removeEventListener("keydown", handleKeyDown, true);
            if (nonInputTimeout) clearTimeout(nonInputTimeout);
        };
    }, [commitScannedBarcode]);


    const handleQuantityChange = (e) => {
        const val = e.target.value;
        const num = parseInt(val, 10);

        setCurrentItem((prev) => {
            let nextBarcodes = [...prev.barcodes];
            if (!isNaN(num) && num > 0) {
                if (num > nextBarcodes.length) {
                    const needed = num - nextBarcodes.length;
                    nextBarcodes = nextBarcodes.concat(Array(needed).fill(""));
                } else if (num < nextBarcodes.length) {
                    nextBarcodes = nextBarcodes.slice(0, num);
                }
            } else {
                nextBarcodes = [""];
            }

            return {
                ...prev,
                quantity: val,
                barcodes: nextBarcodes,
            };
        });

        if (itemErrors.quantity) {
            setItemErrors((prev) => {
                const u = { ...prev };
                delete u.quantity;
                return u;
            });
        }
    };

    const handleBarcodeChange = (index, value) => {
        // Only numbers (0-9) allowed. Strip any alphabets or special characters immediately.
        const cleanVal = (typeof value === "string" ? value : "").replace(/\D/g, "").slice(0, 15);
        setCurrentItem((prev) => {
            const nextBarcodes = [...prev.barcodes];
            nextBarcodes[index] = cleanVal;
            return { ...prev, barcodes: nextBarcodes };
        });

        if (itemErrors[`barcode_${index}`] || itemErrors.barcodes) {
            setItemErrors((prev) => {
                const u = { ...prev };
                delete u[`barcode_${index}`];
                delete u.barcodes;
                return u;
            });
        }
        if (serverError) setServerError("");
    };

    const handleBarcodeKeyDown = (e, index) => {
        if (e.key === "Enter") {
            e.preventDefault();
            const nextIdx = index + 1;
            if (nextIdx < currentItem.barcodes.length && barcodeInputRefs.current[nextIdx]) {
                barcodeInputRefs.current[nextIdx]?.focus();
                barcodeInputRefs.current[nextIdx]?.select();
            }
            return;
        }

        if (e.key === "ArrowDown") {
            e.preventDefault();
            const nextIdx = Math.min(index + 1, currentItem.barcodes.length - 1);
            if (barcodeInputRefs.current[nextIdx]) {
                barcodeInputRefs.current[nextIdx]?.focus();
                barcodeInputRefs.current[nextIdx]?.select();
            }
            return;
        }

        if (e.key === "ArrowUp") {
            e.preventDefault();
            const prevIdx = Math.max(index - 1, 0);
            if (barcodeInputRefs.current[prevIdx]) {
                barcodeInputRefs.current[prevIdx]?.focus();
                barcodeInputRefs.current[prevIdx]?.select();
            }
            return;
        }

        // Allow navigation/editing keys: Backspace, Delete, Tab, Arrows, Home, End
        if (
            e.key === "Backspace" ||
            e.key === "Delete" ||
            e.key === "Tab" ||
            e.key === "ArrowLeft" ||
            e.key === "ArrowRight" ||
            e.key === "Home" ||
            e.key === "End"
        ) {
            return;
        }

        // Allow copy/paste shortcuts (Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X, Ctrl+Z)
        if (e.ctrlKey || e.metaKey) {
            return;
        }

        // Only allow numeric digits 0-9. Reject alphabets and special characters immediately.
        if (e.key.length === 1 && !/^\d$/.test(e.key)) {
            e.preventDefault();
        }
    };

    const handleGenerateSingleBarcode = () => {
        // Random barcode generation disabled
    };

    const handlePriceModeChange = (newMode) => {
        if (newMode === currentItem.priceMode) return;
        setCurrentItem((prev) => ({
            ...prev,
            priceMode: newMode,
        }));
    };

    const handleCurrentItemChange = (e) => {
        const { name, value } = e.target;
        if (name === "productName") {
            setForceShowAllModels(false);
        }
        setCurrentItem((prev) => ({ ...prev, [name]: value }));
        if (itemErrors[name]) {
            setItemErrors((prev) => {
                const u = { ...prev };
                delete u[name];
                return u;
            });
        }
        if (serverError) setServerError("");
    };

    const handleDateChange = (newDate) => {
        setCurrentItem((prev) => ({ ...prev, purchaseDate: newDate }));
        if (itemErrors.purchaseDate) {
            setItemErrors((prev) => {
                const u = { ...prev };
                delete u.purchaseDate;
                return u;
            });
        }
    };






    const iemiRequired = currentItem.category === "Mobile";

    const validateItemBeforeStaging = () => {
        const errs = {};
        const name = currentItem.productName.trim();
        if (!name) {
            errs.productName = "Product name is required.";
        } else if (name.length < 2) {
            errs.productName = "Product name must be at least 2 characters.";
        }

        const supplier = currentItem.supplier.trim();
        if (!supplier) {
            errs.supplier = currentItem.isLocalPurchase
                ? "Customer name is required."
                : "Supplier or wholesaler name is required.";
        } else if (supplier.length < 2) {
            errs.supplier = currentItem.isLocalPurchase
                ? "Customer name must be at least 2 characters."
                : "Supplier name must be at least 2 characters.";
        }

        if (!currentItem.purchaseDate) {
            errs.purchaseDate = "Purchase date is required.";
        }

        const qty = parseInt(currentItem.quantity, 10);
        if (isNaN(qty) || qty <= 0) {
            errs.quantity = "Quantity must be a positive integer (min 1).";
        } else {
            const rawBarcodes = Array.isArray(currentItem.barcodes) ? currentItem.barcodes : [];
            for (let i = 0; i < qty; i++) {
                const bc = typeof rawBarcodes[i] === "string" ? rawBarcodes[i].trim() : "";
                if (iemiRequired) {
                    // Mobile category: IEMI is compulsory (15 digits)
                    if (!bc || bc.toUpperCase() === "N/A") {
                        errs[`barcode_${i}`] = `IEMI #${i + 1} is compulsory for Mobile category.`;
                    } else if (!/^\d{15}$/.test(bc)) {
                        errs[`barcode_${i}`] = `IEMI #${i + 1} must be exactly 15 digits with numbers only (currently ${bc.length}).`;
                    }
                } else {
                    // Mobile Accessories: IEMI is optional, but if entered must be valid
                    if (bc && bc.toUpperCase() !== "N/A" && !/^\d{15}$/.test(bc)) {
                        errs[`barcode_${i}`] = `IEMI #${i + 1} must be exactly 15 digits if provided (currently ${bc.length}).`;
                    }
                }
            }
        }

        const price = parseFloat(currentItem.purchasePrice);
        if (isNaN(price) || price <= 0) {
            errs.purchasePrice = "Purchase price must be greater than 0 PKR.";
        }

        if (currentItem.estimatedSalePrice !== "" && currentItem.estimatedSalePrice != null) {
            const ep = parseFloat(currentItem.estimatedSalePrice);
            if (isNaN(ep) || ep < 0) {
                errs.estimatedSalePrice = "Estimated sale price cannot be negative.";
            }
        }

        setItemErrors(errs);
        return Object.keys(errs).length === 0;
    };

    const handleStageCurrentItem = () => {
        if (!validateItemBeforeStaging()) return;

        let finalSupplierName = "";
        let finalSupplierId = null;
        let finalCustomerName = "";
        let finalCustomerId = null;

        if (currentItem.isLocalPurchase) {
            finalCustomerName = (currentItem.customerName || currentItem.supplier || "").trim();
            finalCustomerId = currentItem.customerId || null;
        } else {
            finalSupplierName = (currentItem.supplier || "").trim();
            finalSupplierId = currentItem.supplierId || null;
        }

        const qty = parseInt(currentItem.quantity, 10);
        const normalizedBarcodes = Array.from({ length: qty }, (_, i) => {
            const raw = currentItem.barcodes[i];
            const trimmed = typeof raw === "string" ? raw.trim() : "";
            return trimmed && trimmed.toUpperCase() !== "N/A" ? trimmed : "N/A";
        });

        if (editingItemId) {
            setStagedItems((prev) =>
                prev.map((item) =>
                    item.id === editingItemId
                        ? {
                            ...item,
                            category: currentItem.category || "Mobile",
                            productName: currentItem.productName.trim(),
                            storage: currentItem.category === "Mobile Accessories" ? "" : (currentItem.storage || "").trim(),
                            color: currentItem.category === "Mobile Accessories" ? "" : (currentItem.color || "").trim(),
                            supplier: finalSupplierName,
                            supplierId: finalSupplierId,
                            isExistingSupplier: Boolean(finalSupplierId),
                            isLocalPurchase: Boolean(currentItem.isLocalPurchase),
                            customerName: finalCustomerName,
                            customerId: finalCustomerId,
                            isExistingCustomer: Boolean(finalCustomerId),
                            purchaseDate: currentItem.purchaseDate,
                            quantity: qty,
                            priceMode: currentItem.priceMode,
                            purchasePrice: currentPurchasePrice,
                            unitPrice: computedUnitPrice,
                            estimatedPriceMode: currentItem.estimatedPriceMode || "unit",
                            estimatedSalePrice: currentItem.estimatedSalePrice,
                            estimatedSalePricePerUnit: computedEstimatedUnitPrice,
                            estimatedTotalSaleValue: computedEstimatedTotalSaleValue,
                            subtotal: computedSubtotal,
                            amountPaid: 0,
                            fullPayment: false,
                            amountDue: computedSubtotal,
                            paymentStatus: "unpaid",
                            barcodes: normalizedBarcodes,
                        }
                        : item
                )
            );
            setEditingItemId(null);
        } else {
            const newItem = {
                id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                category: currentItem.category || "Mobile",
                productName: currentItem.productName.trim(),
                storage: currentItem.category === "Mobile Accessories" ? "" : (currentItem.storage || "").trim(),
                color: currentItem.category === "Mobile Accessories" ? "" : (currentItem.color || "").trim(),
                supplier: finalSupplierName,
                supplierId: finalSupplierId,
                isExistingSupplier: Boolean(finalSupplierId),
                isLocalPurchase: Boolean(currentItem.isLocalPurchase),
                customerName: finalCustomerName,
                customerId: finalCustomerId,
                isExistingCustomer: Boolean(finalCustomerId),
                purchaseDate: currentItem.purchaseDate,
                quantity: qty,
                priceMode: currentItem.priceMode,
                purchasePrice: currentPurchasePrice,
                unitPrice: computedUnitPrice,
                estimatedPriceMode: currentItem.estimatedPriceMode || "unit",
                estimatedSalePrice: currentItem.estimatedSalePrice,
                estimatedSalePricePerUnit: computedEstimatedUnitPrice,
                estimatedTotalSaleValue: computedEstimatedTotalSaleValue,
                subtotal: computedSubtotal,
                amountPaid: 0,
                fullPayment: false,
                amountDue: computedSubtotal,
                paymentStatus: "unpaid",
                barcodes: normalizedBarcodes,
            };
            setStagedItems((prev) => [...prev, newItem]);
        }

        setCurrentItem({
            ...initialItemState,
            purchaseDate: currentItem.purchaseDate || getTodayDate(),
            supplier: currentItem.isLocalPurchase ? "" : (currentItem.supplier || ""),
            supplierId: currentItem.isLocalPurchase ? null : (currentItem.supplierId || null),
            isExistingSupplier: currentItem.isLocalPurchase ? false : Boolean(currentItem.supplierId),
            customerName: currentItem.isLocalPurchase ? (currentItem.customerName || "") : "",
            customerId: currentItem.isLocalPurchase ? (currentItem.customerId || null) : null,
            isExistingCustomer: currentItem.isLocalPurchase ? Boolean(currentItem.customerId) : false,
            isLocalPurchase: Boolean(currentItem.isLocalPurchase),
        });
        setShowSupplierDropdown(false);
        setShowCustomerDropdown(false);
        setActiveSuggestionIndex(-1);
        setActiveCustomerIndex(-1);
        setItemErrors({});
        if (serverError) setServerError("");
    };

    const handleEditStagedItem = (item) => {
        if (editingItemId === item.id) {
            handleCancelEdit();
            return;
        }
        setEditingItemId(item.id);
        setCurrentItem({
            category: item.category || "Mobile",
            productName: item.productName,
            storage: item.storage || "",
            color: item.color || "",
            supplier: item.isLocalPurchase ? (item.customerName || "") : (item.supplier || ""),
            supplierId: item.isLocalPurchase ? null : (item.supplierId || null),
            isExistingSupplier: item.isLocalPurchase ? false : Boolean(item.supplierId),
            customerName: item.isLocalPurchase ? (item.customerName || "") : "",
            customerId: item.isLocalPurchase ? (item.customerId || null) : null,
            isExistingCustomer: item.isLocalPurchase ? Boolean(item.customerId) : false,
            isLocalPurchase: Boolean(item.isLocalPurchase),
            purchaseDate: item.purchaseDate,
            quantity: String(item.quantity),
            priceMode: item.priceMode || "unit",
            purchasePrice: String(item.purchasePrice),
            estimatedPriceMode: item.estimatedPriceMode || "unit",
            estimatedSalePrice:
                item.estimatedSalePrice !== undefined && item.estimatedSalePrice !== null && item.estimatedSalePrice !== ""
                    ? String(item.estimatedSalePrice)
                    : item.estimatedSalePricePerUnit != null
                        ? String(item.estimatedSalePricePerUnit)
                        : "",
            barcodes: item.barcodes.map((b) => (b === "N/A" ? "" : b)),
        });
        setShowSupplierDropdown(false);
        setShowCustomerDropdown(false);
        setActiveSuggestionIndex(-1);
        setActiveCustomerIndex(-1);
        setItemErrors({});
        const formEl = document.getElementById("stock-entry-form-card");
        if (formEl && window.scrollY > 220) {
            formEl.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    };

    const handleCancelEdit = () => {
        setEditingItemId(null);
        setCurrentItem(initialItemState);
        setShowSupplierDropdown(false);
        setShowCustomerDropdown(false);
        setActiveSuggestionIndex(-1);
        setActiveCustomerIndex(-1);
        setItemErrors({});
    };

    const handleDeleteStagedItem = (id) => {
        if (editingItemId === id) {
            handleCancelEdit();
        }
        setStagedItems((prev) => prev.filter((it) => it.id !== id));
    };

    const toggleBarcodeDrawer = (itemId) => {
        setExpandedBarcodeDrawers((prev) => ({
            ...prev,
            [itemId]: !prev[itemId],
        }));
    };

    const handleCopyBarcode = (code) => {
        if (code === "N/A") return;
        navigator.clipboard.writeText(code);
        setCopiedBarcode(code);
        setTimeout(() => {
            setCopiedBarcode(null);
        }, 1800);
    };

    const totalCumulativeQuantity = useMemo(() => {
        return stagedItems.reduce((acc, it) => acc + it.quantity, 0);
    }, [stagedItems]);

    const totalBatchValue = useMemo(() => {
        return Number(
            stagedItems.reduce((acc, it) => acc + it.subtotal, 0).toFixed(2)
        );
    }, [stagedItems]);

    // Keep batch payment synchronized with staged batch totals
    useEffect(() => {
        if (stagedItems.length === 0) {
            setBatchAmountPaid("");
            setIsBatchFullPayment(false);
            setBatchPaymentError("");
            return;
        }

        if (isBatchFullPayment) {
            setBatchAmountPaid(totalBatchValue > 0 ? String(totalBatchValue) : "");
            setBatchPaymentError("");
        } else if (batchAmountPaid !== "") {
            const num = parseFloat(batchAmountPaid);
            if (!isNaN(num) && num > totalBatchValue) {
                // If item removal/edit reduced batch total below entered amount, clamp to new total
                setBatchAmountPaid(String(totalBatchValue));
                setIsBatchFullPayment(true);
                setBatchPaymentError("");
            }
        }
    }, [totalBatchValue, stagedItems.length, isBatchFullPayment]);

    const handleBatchAmountPaidChange = (e) => {
        const val = e.target.value;
        setBatchAmountPaid(val);

        if (val === "") {
            setIsBatchFullPayment(false);
            setBatchPaymentError("");
            return;
        }

        const num = parseFloat(val);
        if (isNaN(num)) {
            setIsBatchFullPayment(false);
            setBatchPaymentError("Please enter a valid numeric payment amount.");
            return;
        }

        if (num < 0) {
            setIsBatchFullPayment(false);
            setBatchPaymentError("Payment amount cannot be negative.");
            return;
        }

        if (num > totalBatchValue + 0.001) {
            setIsBatchFullPayment(false);
            setBatchPaymentError(
                `Payment amount (Rs. ${num.toLocaleString()}) cannot exceed total batch value (Rs. ${totalBatchValue.toLocaleString()}).`
            );
            return;
        }

        setBatchPaymentError("");
        if (totalBatchValue > 0 && Math.abs(num - totalBatchValue) < 0.01) {
            setIsBatchFullPayment(true);
        } else {
            setIsBatchFullPayment(false);
        }
    };

    const handleBatchFullPaymentToggle = (e) => {
        const checked = e.target.checked;
        setIsBatchFullPayment(checked);
        setBatchPaymentError("");
        if (checked) {
            setBatchAmountPaid(totalBatchValue > 0 ? String(totalBatchValue) : "");
        } else {
            setBatchAmountPaid("");
        }
    };

    const effectiveBatchPaid = useMemo(() => {
        if (stagedItems.length === 0 || totalBatchValue <= 0) return 0;
        if (isBatchFullPayment) return totalBatchValue;
        const parsed = parseFloat(batchAmountPaid);
        if (isNaN(parsed) || parsed <= 0) return 0;
        return Math.min(totalBatchValue, parsed);
    }, [stagedItems.length, totalBatchValue, isBatchFullPayment, batchAmountPaid]);

    const batchRemainingPayment = useMemo(() => {
        if (stagedItems.length === 0 || totalBatchValue <= 0) return 0;
        return Math.max(0, Number((totalBatchValue - effectiveBatchPaid).toFixed(2)));
    }, [stagedItems.length, totalBatchValue, effectiveBatchPaid]);

    // Batch-level payment proportional allocation across items & suppliers
    const allocatedStagedItems = useMemo(() => {
        if (stagedItems.length === 0) return [];

        const total = totalBatchValue;
        const paid = effectiveBatchPaid;

        if (total <= 0 || paid <= 0) {
            return stagedItems.map((item) => ({
                ...item,
                amountPaid: 0,
                amountDue: item.subtotal,
                paymentStatus: "unpaid",
                fullPayment: false,
            }));
        }

        if (paid >= total) {
            return stagedItems.map((item) => ({
                ...item,
                amountPaid: item.subtotal,
                amountDue: 0,
                paymentStatus: item.subtotal > 0 ? "paid" : "unpaid",
                fullPayment: true,
            }));
        }

        let remainingToAllocate = paid;

        return stagedItems.map((item) => {
            const itemPaid = Math.min(item.subtotal, remainingToAllocate);
            remainingToAllocate = Math.max(0, Number((remainingToAllocate - itemPaid).toFixed(2)));

            const itemDue = Math.max(0, Number((item.subtotal - itemPaid).toFixed(2)));
            let itemStatus = "unpaid";
            if (itemDue <= 0 && item.subtotal > 0) {
                itemStatus = "paid";
            } else if (itemPaid > 0) {
                itemStatus = "partial";
            }

            return {
                ...item,
                amountPaid: itemPaid,
                amountDue: itemDue,
                paymentStatus: itemStatus,
                fullPayment: itemDue <= 0 && item.subtotal > 0,
            };
        });
    }, [stagedItems, totalBatchValue, effectiveBatchPaid]);

    const totalCashDisbursed = useMemo(() => {
        return Number(
            allocatedStagedItems.reduce((acc, it) => acc + (it.amountPaid || 0), 0).toFixed(2)
        );
    }, [allocatedStagedItems]);

    const totalOutstandingDue = useMemo(() => {
        return Number(
            allocatedStagedItems.reduce((acc, it) => acc + (it.amountDue || 0), 0).toFixed(2)
        );
    }, [allocatedStagedItems]);

    const supplierBreakdown = useMemo(() => {
        const map = new Map();

        allocatedStagedItems.forEach((it) => {
            const sName = it.supplier?.trim() || "Unspecified Supplier";
            const key = sName.toLowerCase();

            if (!map.has(key)) {
                map.set(key, {
                    name: sName,
                    itemCount: 0,
                    unitsCount: 0,
                    totalValue: 0,
                    paid: 0,
                    due: 0,
                });
            }

            const current = map.get(key);
            current.itemCount += 1;
            current.unitsCount += it.quantity;
            current.totalValue = Number((current.totalValue + it.subtotal).toFixed(2));
            current.paid = Number((current.paid + it.amountPaid).toFixed(2));
            current.due = Number((current.due + it.amountDue).toFixed(2));
        });

        return Array.from(map.values());
    }, [allocatedStagedItems]);

    const resolveBatchSupplierLedger = (items = allocatedStagedItems) => {
        if (!items || items.length === 0) {
            return { previousBalance: 0, isExistingSupplier: false, supplierName: "General Supplier" };
        }

        const isLocal = items.some((it) => it.isLocalPurchase);
        const firstItem = items[0];

        if (isLocal) {
            const cName = (firstItem?.customerName || firstItem?.supplier || "").trim();
            const cId = firstItem?.customerId || null;
            const matchedCust = cId
                ? existingCustomers.find((c) => String(c._id) === String(cId))
                : null;
            const prevDue = Number(matchedCust?.totalDue || 0);
            return {
                previousBalance: prevDue,
                isExistingSupplier: Boolean(cId && matchedCust),
                supplierName: cName || "Local Customer",
            };
        }

        // For Wholesalers / Suppliers
        const explicitSupplierIds = Array.from(
            new Set(
                items
                    .map((it) => it.supplierId || null)
                    .filter(Boolean)
            )
        );

        let totalPrevBalance = 0;
        let anyExisting = false;

        explicitSupplierIds.forEach((sId) => {
            const matchedSup = existingSuppliers.find((s) => String(s._id) === String(sId));
            if (matchedSup) {
                anyExisting = true;
                totalPrevBalance += Number(matchedSup.totalDue || 0);
            }
        });

        const uniqueSuppliers = Array.from(
            new Set(items.map((it) => (it.supplier || "").trim()).filter(Boolean))
        );

        const primarySupplierName =
            uniqueSuppliers.length === 1
                ? uniqueSuppliers[0]
                : (firstItem?.supplier || "General Supplier");

        return {
            previousBalance: Number(totalPrevBalance.toFixed(2)),
            isExistingSupplier: anyExisting,
            supplierName: primarySupplierName,
        };
    };

    const handlePreviewStagedReceipt = () => {
        if (stagedItems.length === 0) return;

        const itemsList = allocatedStagedItems.map((it) => ({
            productName: it.productName,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            subtotal: it.subtotal,
            barcodes: it.barcodes,
            category: it.category || "General",
            supplier: it.supplier,
            isLocalPurchase: it.isLocalPurchase,
        }));

        const totalBatchPaid = totalCashDisbursed;
        const totalBatchDue = totalOutstandingDue;
        const { previousBalance, isExistingSupplier, supplierName } = resolveBatchSupplierLedger(allocatedStagedItems);

        const previewReceipt = {
            receiptNumber: `DRAFT-${Date.now().toString().slice(-6)}`,
            allInvoiceNumbers: [],
            date: new Date().toISOString(),
            supplier: supplierName,
            customerName: allocatedStagedItems[0]?.customerName || "",
            isLocalPurchase: allocatedStagedItems.some((it) => it.isLocalPurchase),
            items: itemsList,
            totalUnits: allocatedStagedItems.reduce((acc, it) => acc + (Number(it.quantity) || 1), 0),
            grandTotal: totalBatchValue,
            amountPaid: totalBatchPaid,
            amountDue: totalBatchDue,
            previousBalance: previousBalance,
            isExistingSupplier: isExistingSupplier,
            totalPayable: previousBalance + totalBatchValue,
            totalRemainingAmount: previousBalance + totalBatchDue,
            paymentStatus: (previousBalance + totalBatchDue) <= 0 ? "Paid" : totalBatchPaid > 0 ? "Partial" : "Unpaid",
            isDraft: true,
        };

        setCompletedStockBatchReceipt(previewReceipt);
    };

    const handleFinalBatchSubmit = async (forceOpenReceipt = false) => {
        setServerError("");

        if (stagedItems.length === 0) {
            setServerError("Please add at least one line item to the batch before submitting.");
            return;
        }

        // Verify IEMI: compulsory for Mobile category, optional for Mobile Accessories
        for (const item of stagedItems) {
            const itemCategory = item.category || "Mobile";
            const rawBarcodes = Array.isArray(item.barcodes) ? item.barcodes : [];
            const itemQty = parseInt(item.quantity, 10) || 1;
            for (let i = 0; i < itemQty; i++) {
                const bc = typeof rawBarcodes[i] === "string" ? rawBarcodes[i].trim() : "";
                if (itemCategory === "Mobile") {
                    if (!bc || bc.toUpperCase() === "N/A" || !/^\d{15}$/.test(bc)) {
                        setServerError(`Item "${item.productName}" has invalid IEMI #${i + 1} ("${bc}"). Every IEMI must be exactly 15 digits for Mobile category.`);
                        return;
                    }
                } else {
                    // Mobile Accessories: if entered, must be valid 15 digits
                    if (bc && bc.toUpperCase() !== "N/A" && !/^\d{15}$/.test(bc)) {
                        setServerError(`Item "${item.productName}" has invalid IEMI #${i + 1} ("${bc}"). IEMI must be exactly 15 digits if provided.`);
                        return;
                    }
                }
            }
        }

        if (batchPaymentError) {
            setServerError(batchPaymentError);
            return;
        }

        if (batchAmountPaid !== "") {
            const num = parseFloat(batchAmountPaid);
            if (isNaN(num) || num < 0) {
                setServerError("Payment amount cannot be negative.");
                return;
            }
            if (num > totalBatchValue + 0.001) {
                setServerError(`Payment amount cannot exceed total batch value of Rs. ${totalBatchValue.toLocaleString()}`);
                return;
            }
        }

        const confirmResult = await Swal.fire({
            title: "Confirm Stock Addition",
            text: forceOpenReceipt
                ? `Save this stock batch and generate receipt?`
                : `Are you sure you want to save this batch?`,
            showCancelButton: true,
            confirmButtonColor: "#09090b",
            cancelButtonColor: "#71717a",
            confirmButtonText: forceOpenReceipt ? "Yes, Save & Make Receipt" : "Yes, Confirm & Save",
            cancelButtonText: "Cancel",
            reverseButtons: true,
        });

        if (!confirmResult.isConfirmed) {
            return;
        }

        setIsSubmitting(true);

        try {
            const payload = {
                entryOrigin: "general_intake",
                supplierId: null,
                items: allocatedStagedItems.map((item) => {
                    const sId = item.isLocalPurchase
                        ? null
                        : (item.supplierId || null);
                    const cId = item.isLocalPurchase
                        ? (item.customerId || null)
                        : null;

                    return {
                        productName: item.productName,
                        supplier: item.isLocalPurchase ? "" : item.supplier,
                        supplierName: item.isLocalPurchase ? "" : item.supplier,
                        supplierId: item.isLocalPurchase ? null : sId,
                        isLocalPurchase: Boolean(item.isLocalPurchase),
                        customerName: item.isLocalPurchase ? (item.customerName || item.supplier || "") : "",
                        customerId: item.isLocalPurchase ? cId : null,
                        entryOrigin: item.isLocalPurchase ? "local_purchase" : "general_intake",
                        purchaseDate: item.purchaseDate,
                        category: item.category || "Mobile",
                        storage: item.storage || "",
                        color: item.color || "",
                        quantity: item.quantity,
                        priceMode: item.priceMode,
                        purchasePrice: item.purchasePrice,
                        unitPrice: item.unitPrice,
                        sellingPrice: 0,
                        estimatedSalePricePerUnit: item.estimatedSalePricePerUnit != null ? item.estimatedSalePricePerUnit : null,
                        estimatedTotalSaleValue: item.estimatedTotalSaleValue != null ? item.estimatedTotalSaleValue : null,
                        estimatedPriceMode: item.estimatedPriceMode || "unit",
                        subtotal: item.subtotal,
                        amountPaid: item.amountPaid,
                        amountDue: item.amountDue,
                        paymentStatus: item.paymentStatus,
                        barcodes: item.barcodes.map((b) => (b && b.trim() ? b.trim() : "N/A")),
                    };
                }),
            };

            const response = await api.post("/stock/batch", payload);

            if (response.data && response.data.success) {
                const respData = response.data?.data;
                const invoices = respData?.invoices || [];
                const primaryInv = invoices[0]?.invoiceNumber || `INV-${Date.now().toString().slice(-6)}`;
                const allInvNumbers = invoices.map((inv) => inv.invoiceNumber).filter(Boolean);

                const itemsList =
                    invoices.length > 0 && invoices.some((inv) => inv.itemsSummary?.length > 0)
                        ? invoices.flatMap((inv) =>
                            (inv.itemsSummary || []).map((it) => ({
                                ...it,
                                storage: it.storage || "",
                                color: it.color || "",
                                supplier: inv.supplier || it.supplier,
                                isLocalPurchase: inv.isLocalPurchase,
                            }))
                        )
                        : allocatedStagedItems.map((it) => ({
                            productName: it.productName,
                            storage: it.storage || "",
                            color: it.color || "",
                            quantity: it.quantity,
                            unitPrice: it.unitPrice,
                            subtotal: it.subtotal,
                            barcodes: it.barcodes,
                            category: it.category || "General",
                            supplier: it.supplier,
                            isLocalPurchase: it.isLocalPurchase,
                        }));

                const totalBatchPaid = totalCashDisbursed;
                const totalBatchDue = totalOutstandingDue;
                const totalUnitsCount =
                    respData?.totalUnits ||
                    allocatedStagedItems.reduce((acc, it) => acc + (Number(it.quantity) || 1), 0);
                const grandTotalVal = respData?.grandTotalBill ?? totalBatchValue;
                const paidVal = respData?.totalPaid ?? totalBatchPaid;
                const dueVal = respData?.totalDue ?? totalBatchDue;

                const { previousBalance, isExistingSupplier, supplierName } = resolveBatchSupplierLedger(allocatedStagedItems);

                const finalSupplierDisplayName =
                    invoices.length === 1
                        ? invoices[0].supplier
                        : supplierName;

                const receiptObj = {
                    receiptNumber: primaryInv,
                    allInvoiceNumbers: allInvNumbers,
                    date: invoices[0]?.purchaseDate || new Date().toISOString(),
                    supplier: finalSupplierDisplayName,
                    customerName: invoices[0]?.customerName || allocatedStagedItems[0]?.customerName || "",
                    isLocalPurchase: allocatedStagedItems.some((it) => it.isLocalPurchase),
                    items: itemsList,
                    totalUnits: totalUnitsCount,
                    grandTotal: grandTotalVal,
                    amountPaid: paidVal,
                    amountDue: dueVal,
                    previousBalance: previousBalance,
                    isExistingSupplier: isExistingSupplier,
                    totalPayable: previousBalance + grandTotalVal,
                    totalRemainingAmount: previousBalance + dueVal,
                    paymentStatus: (previousBalance + dueVal) <= 0 ? "Paid" : paidVal > 0 ? "Partial" : "Unpaid",
                    isDraft: false,
                };

                setLastStockReceipt(receiptObj);
                setStagedItems([]);
                setCurrentItem(initialItemState);
                setEditingItemId(null);
                setBatchAmountPaid("");
                setIsBatchFullPayment(false);
                setBatchPaymentError("");
                setItemErrors({});
                setServerError("");

                fetchExistingSuppliers();
                fetchExistingCustomers();

                if (forceOpenReceipt) {
                    setCompletedStockBatchReceipt(receiptObj);
                } else {
                    Swal.fire({
                        icon: "success",
                        title: "Stock Added Successfully!",
                        text: response.data.message || "Stock batch added successfully.",
                        showCancelButton: true,
                        confirmButtonText: "View / Print Receipt",
                        cancelButtonText: "Close",
                        confirmButtonColor: "#09090b",
                        cancelButtonColor: "#71717a",
                        reverseButtons: true,
                    }).then((result) => {
                        if (result.isConfirmed) {
                            setCompletedStockBatchReceipt(receiptObj);
                        }
                    });
                }
            } else {
                const failMsg = response.data?.message || "Failed to process multi-supplier stock batch.";
                setServerError(failMsg);
                Swal.fire({
                    icon: "error",
                    title: "Failed to Save",
                    text: failMsg,
                    confirmButtonColor: "#09090b",
                });
            }
        } catch (err) {
            const msg =
                err.response?.data?.message ||
                err.message ||
                "An unexpected error occurred while communicating with the server.";
            console.warn(`[Stock Batch Error] ${msg}`);
            setServerError(msg);
            Swal.fire({
                icon: "error",
                title: "Failed to Save",
                text: msg,
                confirmButtonColor: "#09090b",
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="container-fluid p-0 d-flex flex-column flex-grow-1">
            <div className="d-flex flex-wrap justify-content-between align-items-center mb-3 gap-2 flex-shrink-0">
                <div>
                    <div className="d-flex align-items-center gap-2">
                        <h1 className="h4 fw-bold text-dark mb-0">Add Stock / Local Sale Purchase</h1>
                    </div>
                    <p className="text-secondary small mb-0 mt-1">
                        Log mixed inventory from multiple suppliers in a single session with isolated accounts payable and serialized IEMI numbers.
                    </p>
                </div>

                <div className="d-flex align-items-center gap-2">
                    {lastStockReceipt && (
                        <button
                            type="button"
                            className="btn btn-dark btn-sm d-inline-flex align-items-center gap-1.5 shadow-sm"
                            onClick={() => setCompletedStockBatchReceipt(lastStockReceipt)}
                            title="View and print the last generated stock intake receipt"
                        >
                            <FiPrinter size={13} />
                            <span>Last Stock Receipt</span>
                        </button>
                    )}
                    <Link
                        to="/view-stock"
                        className="btn btn-outline-secondary btn-sm d-inline-flex align-items-center gap-1 shadow-sm"
                    >
                        <FiList size={14} />
                        <span>View All Stock</span>
                    </Link>
                </div>
            </div>

            {serverError && (
                <div className="alert alert-danger d-flex align-items-start gap-2 rounded-3 shadow-sm mb-3">
                    <FiAlertTriangle className="text-danger flex-shrink-0 mt-1" size={18} />
                    <div className="flex-grow-1">
                        <strong className="d-block small fw-bold">Submission Blocked:</strong>
                        <div className="small">{serverError}</div>
                    </div>
                    <button
                        type="button"
                        className="btn-close btn-close-sm"
                        onClick={() => setServerError("")}
                        aria-label="Close"
                    />
                </div>
            )}

            <div className="row g-3 g-xl-4 flex-grow-1 align-items-start">
                <div className="col-12 col-lg-5 col-xl-5">
                    <div
                        id="stock-entry-form-card"
                        className={`card border shadow-sm rounded-3 ${editingItemId ? "pos-form-editing" : ""
                            }`}
                    >
                        <div className="card-header bg-white border-bottom py-2 px-3 d-flex justify-content-between align-items-center flex-wrap gap-2">
                            <div className="d-flex align-items-center gap-2">
                                <div className="d-inline-flex p-1 rounded-2 bg-dark text-white">
                                    {editingItemId ? <FiEdit2 size={15} /> : <FiPlus size={15} />}
                                </div>
                                <span className="fw-semibold text-dark small">
                                    {editingItemId ? "Editing Line Item" : "1. Add Item & Supplier Entry"}
                                </span>
                                {editingItemId && (
                                    <span
                                        className="badge bg-dark-subtle text-dark border border-dark-subtle"
                                        style={{ fontSize: "0.68rem" }}
                                    >
                                        Active
                                    </span>
                                )}
                            </div>

                            <div className="d-flex align-items-center gap-2">
                                {/* Local Purchase Tick Button */}
                                <label
                                    htmlFor="localPurchaseToggle"
                                    className={`btn btn-sm py-1 px-2 d-inline-flex align-items-center gap-1 rounded-2 transition-all ${currentItem.isLocalPurchase
                                            ? "btn-danger text-white border-danger shadow-sm"
                                            : "btn-outline-secondary"
                                        }`}
                                    style={{ fontSize: "0.74rem", cursor: "pointer", userSelect: "none" }}
                                    title="Enable when purchasing directly from a customer (Local Purchase)"
                                >
                                    <input
                                        type="checkbox"
                                        id="localPurchaseToggle"
                                        className="form-check-input m-0 pos-toggle-checkbox"
                                        checked={Boolean(currentItem.isLocalPurchase)}
                                        onChange={(e) => {
                                            const checked = e.target.checked;
                                            setCurrentItem((prev) => ({
                                                ...prev,
                                                isLocalPurchase: checked,
                                                supplier: "",
                                                supplierId: null,
                                                customerName: "",
                                                customerId: null,
                                                isExistingSupplier: false,
                                                isExistingCustomer: false,
                                            }));
                                            setShowSupplierDropdown(false);
                                            setShowCustomerDropdown(false);
                                            // If Local Purchase is unchecked, Sale cannot be active
                                            if (!checked) {
                                                setIsSaleMode(false);
                                            }
                                            setItemErrors((prev) => {
                                                const u = { ...prev };
                                                delete u.supplier;
                                                return u;
                                            });
                                        }}
                                    />
                                    <span className="fw-semibold">Local Purchase</span>
                                </label>

                                {/* Sale Tick Button (Only selectable when Local Purchase is ticked) */}
                                <label
                                    htmlFor="saleModeToggle"
                                    className={`btn btn-sm py-1 px-2 d-inline-flex align-items-center gap-1 rounded-2 transition-all ${!currentItem.isLocalPurchase
                                            ? "btn-outline-secondary opacity-50"
                                            : isSaleMode
                                                ? "btn-danger text-white border-danger shadow-sm"
                                                : "btn-outline-secondary"
                                        }`}
                                    style={{
                                        fontSize: "0.74rem",
                                        cursor: !currentItem.isLocalPurchase ? "not-allowed" : "pointer",
                                        userSelect: "none",
                                    }}
                                    title={
                                        !currentItem.isLocalPurchase
                                            ? "Select 'Local Purchase' first to enable Sale"
                                            : "Enable Sale mode to sell items from your stock to this customer"
                                    }
                                >
                                    <input
                                        type="checkbox"
                                        id="saleModeToggle"
                                        className="form-check-input m-0 pos-toggle-checkbox"
                                        disabled={!currentItem.isLocalPurchase}
                                        checked={Boolean(currentItem.isLocalPurchase && isSaleMode)}
                                        onChange={(e) => {
                                            if (!currentItem.isLocalPurchase) return;
                                            setIsSaleMode(e.target.checked);
                                        }}
                                    />
                                    <span className="fw-semibold">Sale</span>
                                </label>

                                {editingItemId && (
                                    <button
                                        type="button"
                                        className="btn btn-outline-secondary btn-sm py-0 px-2"
                                        style={{ fontSize: "0.75rem" }}
                                        onClick={handleCancelEdit}
                                    >
                                        Cancel Edit
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="card-body p-3 pos-form-body-smooth">
                            <div className="row g-3">
                                {/* Category Selection */}
                                <div className="col-12">
                                    <label className="form-label small fw-semibold text-dark mb-1">
                                        Category <span className="text-danger">*</span>
                                    </label>
                                    <div className="d-flex gap-2">
                                        {["Mobile", "Mobile Accessories"].map((cat) => {
                                            const isActive = currentItem.category === cat;
                                            return (
                                                <button
                                                    key={cat}
                                                    type="button"
                                                    className={`btn btn-sm flex-fill d-inline-flex align-items-center justify-content-center gap-1.5 rounded-2 fw-semibold transition-all ${
                                                        isActive
                                                            ? "btn-dark text-white shadow-sm"
                                                            : "btn-outline-secondary"
                                                    }`}
                                                    style={{ fontSize: "0.78rem", padding: "6px 12px" }}
                                                    onClick={() => {
                                                        setCurrentItem((prev) => ({
                                                            ...prev,
                                                            category: cat,
                                                            ...(cat === "Mobile Accessories" ? { storage: "", color: "" } : {}),
                                                        }));
                                                        if (serverError) setServerError("");
                                                    }}
                                                >
                                                    {cat === "Mobile" ? <FiPackage size={13} /> : <FiLayers size={13} />}
                                                    {cat}
                                                </button>
                                            );
                                        })}
                                    </div>
                                    {currentItem.category === "Mobile Accessories" && (
                                        <div className="text-muted mt-1" style={{ fontSize: "0.71rem" }}>
                                            IEMI numbers are optional for accessories.
                                        </div>
                                    )}
                                </div>

                                <div className="col-12">
                                    <label className="form-label small fw-semibold text-dark mb-1">
                                        Product Name <span className="text-danger">*</span>
                                    </label>
                                    <div className="input-group input-group-sm">
                                        <span className="input-group-text bg-white text-secondary">
                                            <FiPackage size={14} />
                                        </span>
                                        <input
                                            type="text"
                                            name="productName"
                                            value={currentItem.productName}
                                            onChange={handleCurrentItemChange}
                                            className={`form-control ${itemErrors.productName ? "is-invalid" : ""}`}
                                            placeholder={currentItem.category === "Mobile" ? "e.g. Pixel 6, Samsung S24" : "e.g. Fast Charger, Screen Protector"}
                                            autoComplete="off"
                                        />
                                    </div>
                                    <FormError message={itemErrors.productName} />

                                    {/* Quick Select Mobile Models (Filtered as you type) */}
                                    {currentItem.category !== "Mobile Accessories" && Array.isArray(MOBILE_MODELS) && MOBILE_MODELS.length > 0 && (
                                        <div className="mt-2">
                                            <div className="d-flex align-items-center justify-content-between mb-1">
                                                <span className="text-secondary small fw-medium" style={{ fontSize: "0.71rem" }}>
                                                    Quick Select Model
                                                    {visibleMobileModels.length !== MOBILE_MODELS.length && (
                                                        <span className="text-dark fw-semibold ms-1">
                                                            ({visibleMobileModels.length} of {MOBILE_MODELS.length})
                                                        </span>
                                                    )}
                                                    :
                                                </span>
                                                <div className="d-flex align-items-center gap-2">
                                                    {visibleMobileModels.length !== MOBILE_MODELS.length && (
                                                        <button
                                                            type="button"
                                                            className="btn btn-link p-0 text-decoration-none text-primary"
                                                            style={{ fontSize: "0.70rem" }}
                                                            onClick={() => setForceShowAllModels(true)}
                                                        >
                                                            Show all
                                                        </button>
                                                    )}
                                                    {currentItem.productName && (
                                                        <button
                                                            type="button"
                                                            className="btn btn-link p-0 text-decoration-none text-muted"
                                                            style={{ fontSize: "0.70rem" }}
                                                            onClick={() => {
                                                                setCurrentItem((prev) => ({ ...prev, productName: "" }));
                                                                setForceShowAllModels(false);
                                                            }}
                                                        >
                                                            Clear
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                            <div
                                                className="d-flex flex-wrap gap-1.5 p-2 bg-light rounded-2 border"
                                                style={{ maxHeight: "220px", overflowY: "auto" }}
                                            >
                                                {visibleMobileModels.length === 0 ? (
                                                    <div className="text-center py-3 text-muted small w-100" style={{ fontSize: "0.75rem" }}>
                                                        <span>No model found matching "<strong>{currentItem.productName}</strong>".</span>
                                                        <button
                                                            type="button"
                                                            className="btn btn-sm btn-link text-decoration-none d-block mx-auto mt-1 p-0"
                                                            style={{ fontSize: "0.72rem" }}
                                                            onClick={() => setForceShowAllModels(true)}
                                                        >
                                                            Show all {MOBILE_MODELS.length} models
                                                        </button>
                                                    </div>
                                                ) : (
                                                    visibleMobileModels.map((modelName) => {
                                                        const isSelected =
                                                            (currentItem.productName || "").trim().toLowerCase() ===
                                                            modelName.trim().toLowerCase();

                                                        return (
                                                            <button
                                                                key={modelName}
                                                                type="button"
                                                                onClick={() => {
                                                                    if (isSelected) {
                                                                        // Unselect if clicked again
                                                                        setCurrentItem((prev) => ({ ...prev, productName: "" }));
                                                                        setForceShowAllModels(false);
                                                                    } else {
                                                                        // Apply this model name to current batch item
                                                                        setCurrentItem((prev) => ({ ...prev, productName: modelName }));
                                                                        if (itemErrors.productName) {
                                                                            setItemErrors((prev) => {
                                                                                const copy = { ...prev };
                                                                                delete copy.productName;
                                                                                return copy;
                                                                            });
                                                                        }
                                                                        if (serverError) setServerError("");
                                                                    }
                                                                }}
                                                                className="btn btn-sm py-1 px-2.5 rounded-pill fw-medium user-select-none"
                                                                style={{
                                                                    fontSize: "0.73rem",
                                                                    lineHeight: "1.3",
                                                                    borderWidth: "1.5px",
                                                                    borderStyle: "solid",
                                                                    backgroundColor: isSelected ? "#09090b" : "#ffffff",
                                                                    color: isSelected ? "#ffffff" : "#1f2937",
                                                                    borderColor: isSelected ? "#09090b" : "#e5e7eb",
                                                                    boxShadow: isSelected ? "0 1px 3px rgba(0,0,0,0.2)" : "none",
                                                                    cursor: "pointer",
                                                                    whiteSpace: "nowrap",
                                                                }}
                                                                title={`Select "${modelName}" for this batch item`}
                                                            >
                                                                {modelName}
                                                            </button>
                                                        );
                                                    })
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Phone Storage & Color Fields (Optional, Clean Layout - hidden for Mobile Accessories) */}
                                {currentItem.category !== "Mobile Accessories" && (
                                    <>
                                        <div className="col-12 col-sm-6">
                                    <label className="form-label small fw-semibold text-dark mb-1 d-flex align-items-center justify-content-between">
                                        <span>Storage</span>
                                        {currentItem.storage && (
                                            <button
                                                type="button"
                                                className="btn btn-link p-0 text-decoration-none text-muted"
                                                style={{ fontSize: "0.68rem" }}
                                                onClick={() => setCurrentItem((prev) => ({ ...prev, storage: "" }))}
                                            >
                                                Clear
                                            </button>
                                        )}
                                    </label>
                                    <input
                                        type="text"
                                        name="storage"
                                        value={currentItem.storage || ""}
                                        onChange={handleCurrentItemChange}
                                        className="form-control form-control-sm"
                                        placeholder="e.g. 128GB, 256GB"
                                        autoComplete="off"
                                    />
                                    {/* Quick Storage Preset Chips */}
                                    <div className="d-flex flex-wrap gap-1 mt-1">
                                        {STORAGE_PRESETS.map((cap) => {
                                            const isSelected = (currentItem.storage || "").trim().toLowerCase() === cap.toLowerCase();
                                            return (
                                                <button
                                                    key={cap}
                                                    type="button"
                                                    onClick={() =>
                                                        setCurrentItem((prev) => ({
                                                            ...prev,
                                                            storage: isSelected ? "" : cap,
                                                        }))
                                                    }
                                                    className={`btn btn-sm py-0 px-1.5 rounded-pill user-select-none ${
                                                        isSelected
                                                            ? "btn-dark text-white shadow-sm"
                                                            : "btn-outline-secondary border text-secondary bg-white"
                                                    }`}
                                                    style={{ fontSize: "0.66rem", lineHeight: "1.4" }}
                                                >
                                                    {cap}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div className="col-12 col-sm-6">
                                    <label className="form-label small fw-semibold text-dark mb-1 d-flex align-items-center justify-content-between">
                                        <span>Color</span>
                                        {currentItem.color && (
                                            <button
                                                type="button"
                                                className="btn btn-link p-0 text-decoration-none text-muted"
                                                style={{ fontSize: "0.68rem" }}
                                                onClick={() => setCurrentItem((prev) => ({ ...prev, color: "" }))}
                                            >
                                                Clear
                                            </button>
                                        )}
                                    </label>
                                    <input
                                        type="text"
                                        name="color"
                                        list="phone-color-presets"
                                        value={currentItem.color || ""}
                                        onChange={handleCurrentItemChange}
                                        className="form-control form-control-sm"
                                        placeholder="e.g. Obsidian, Natural Titanium"
                                        autoComplete="off"
                                    />
                                    <datalist id="phone-color-presets">
                                        {PHONE_COLOR_PRESETS.map((col) => (
                                            <option key={col} value={col} />
                                        ))}
                                    </datalist>
                                    {/* Quick Popular Color Chips */}
                                    <div className="d-flex flex-wrap gap-1 mt-1">
                                        {["Black", "White", "Obsidian", "Natural Titanium", "Desert Titanium", "Hazel", "Bay"].map((col) => {
                                            const isSelected = (currentItem.color || "").trim().toLowerCase() === col.toLowerCase();
                                            return (
                                                <button
                                                    key={col}
                                                    type="button"
                                                    onClick={() =>
                                                        setCurrentItem((prev) => ({
                                                            ...prev,
                                                            color: isSelected ? "" : col,
                                                        }))
                                                    }
                                                    className={`btn btn-sm py-0 px-1.5 rounded-pill user-select-none ${
                                                        isSelected
                                                            ? "btn-dark text-white shadow-sm"
                                                            : "btn-outline-secondary border text-secondary bg-white"
                                                    }`}
                                                    style={{ fontSize: "0.66rem", lineHeight: "1.4" }}
                                                >
                                                    {col}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                                    </>
                                )}

                                <div className="col-12">
                                    <label className="form-label small fw-semibold text-dark mb-1 d-flex align-items-center justify-content-between">
                                        <span>
                                            {currentItem.isLocalPurchase ? "Customer Name" : "Supplier / Wholesaler"}{" "}
                                            <span className="text-danger">*</span>
                                        </span>
                                        {currentItem.isLocalPurchase && (
                                            <span
                                                className="badge bg-danger-subtle text-danger border border-danger-subtle"
                                                style={{ fontSize: "0.65rem", fontWeight: "600" }}
                                            >
                                                {isSaleMode ? "Local Sale Purchase" : "Local Purchase"}
                                            </span>
                                        )}
                                    </label>

                                    <div className="position-relative" ref={supplierDropdownRef}>
                                        <div className="input-group input-group-sm">
                                            <span className="input-group-text bg-white text-secondary">
                                                {currentItem.isLocalPurchase ? <FiUser size={14} className="text-danger" /> : <FiSearch size={14} />}
                                            </span>
                                            <input
                                                type="text"
                                                name="supplier"
                                                value={currentItem.supplier || ""}
                                                onChange={handleSupplierInputChange}
                                                onBlur={handleSupplierBlur}
                                                onFocus={() => {
                                                    if (!currentItem.isLocalPurchase) {
                                                        setShowSupplierDropdown(true);
                                                        setShowCustomerDropdown(false);
                                                        if (existingSuppliers.length === 0) {
                                                            fetchExistingSuppliers();
                                                        }
                                                    } else {
                                                        setShowCustomerDropdown(true);
                                                        setShowSupplierDropdown(false);
                                                        fetchExistingCustomers();
                                                    }
                                                }}
                                                onKeyDown={handleSupplierKeyDown}
                                                className={`form-control ${itemErrors.supplier ? "is-invalid" : ""}`}
                                                placeholder={
                                                    currentItem.isLocalPurchase
                                                        ? "Enter customer name..."
                                                        : "Enter supplier or wholesaler name..."
                                                }
                                                autoComplete="off"
                                            />
                                            {isSearchingDb && !currentItem.isLocalPurchase && (
                                                <span className="input-group-text bg-white text-muted px-2" title="Searching database...">
                                                    <span
                                                        className="spinner-border spinner-border-sm text-secondary"
                                                        style={{ width: "12px", height: "12px", borderWidth: "1.5px" }}
                                                        role="status"
                                                    />
                                                </span>
                                            )}
                                            {isSearchingCustomers && currentItem.isLocalPurchase && (
                                                <span className="input-group-text bg-white text-muted px-2" title="Searching customers...">
                                                    <span
                                                        className="spinner-border spinner-border-sm text-secondary"
                                                        style={{ width: "12px", height: "12px", borderWidth: "1.5px" }}
                                                        role="status"
                                                    />
                                                </span>
                                            )}
                                            {currentItem.supplier && (
                                                <button
                                                    type="button"
                                                    className="btn btn-outline-secondary px-2"
                                                    onClick={handleClearSupplier}
                                                    title={currentItem.isLocalPurchase ? "Clear customer name" : "Clear supplier"}
                                                >
                                                    <FiX size={13} />
                                                </button>
                                            )}
                                        </div>

                                        {/* Autocomplete Dropdown List from DB */}
                                        {!currentItem.isLocalPurchase && showSupplierDropdown && (
                                            <div
                                                className="position-absolute start-0 end-0 bg-white border rounded-2 shadow-lg mt-1 overflow-hidden"
                                                style={{
                                                    zIndex: 1060,
                                                    maxHeight: "280px",
                                                    overflowY: "auto",
                                                }}
                                            >
                                                <div
                                                    className="d-flex align-items-center justify-content-between px-2 py-1 bg-light border-bottom text-muted"
                                                    style={{ fontSize: "0.68rem" }}
                                                >
                                                    <span className="fw-semibold">
                                                        {supplierQuery
                                                            ? `Database matching "${supplierQuery}"`
                                                            : `Suppliers in Database (${matchingSuppliers.length})`}
                                                    </span>
                                                    {isSearchingDb ? (
                                                        <span className="text-secondary d-flex align-items-center gap-1">
                                                            <span
                                                                className="spinner-border spinner-border-sm"
                                                                style={{ width: "10px", height: "10px", borderWidth: "1.5px" }}
                                                            />
                                                            Searching...
                                                        </span>
                                                    ) : (
                                                        <span className="badge bg-secondary-subtle text-secondary border" style={{ fontSize: "0.64rem" }}>
                                                            {matchingSuppliers.length} found
                                                        </span>
                                                    )}
                                                </div>

                                                {matchingSuppliers.length === 0 ? (
                                                    <div className="p-3 text-center text-muted small">
                                                        <FiAlertCircle size={18} className="text-secondary mb-1 d-block mx-auto" />
                                                        <div>
                                                            {supplierQuery ? (
                                                                <>
                                                                    No existing supplier matching <strong>"{currentItem.supplier}"</strong>
                                                                </>
                                                            ) : (
                                                                "No suppliers found in database."
                                                            )}
                                                        </div>

                                                    </div>
                                                ) : (
                                                    <div className="list-group list-group-flush">
                                                        {matchingSuppliers.map((s, idx) => {
                                                            const sName = typeof s === "string" ? s : s?.name || "";
                                                            const sId = typeof s === "object" ? s?._id : sName;
                                                            const isSelected = currentItem.supplierId === sId;
                                                            const isHighlighted = activeSuggestionIndex === idx;
                                                            const due = Number(s?.totalDue || 0);
                                                            const paid = Number(s?.totalPaid || 0);
                                                            const purchases = Number(s?.totalPurchases || 0);
                                                            const orders = s?.totalOrders || 0;

                                                            return (
                                                                <button
                                                                    key={sId}
                                                                    type="button"
                                                                    className={`list-group-item list-group-item-action d-flex align-items-center justify-content-between py-2 px-2 border-bottom ${isSelected
                                                                            ? "text-primary"
                                                                            : isHighlighted
                                                                                ? "bg-light"
                                                                                : ""
                                                                        }`}
                                                                    onMouseDown={(e) => {
                                                                        e.preventDefault();
                                                                        handleSelectSupplier(s);
                                                                    }}
                                                                    style={{ cursor: "pointer" }}
                                                                >
                                                                    <div className="d-flex flex-column text-truncate text-start me-2">
                                                                        <div className="d-flex align-items-center gap-1">
                                                                            <span className="fw-semibold text-dark small text-truncate">
                                                                                {sName}
                                                                            </span>
                                                                            {isSelected && (
                                                                                <FiCheck size={12} className="text-primary flex-shrink-0" />
                                                                            )}
                                                                        </div>
                                                                        <div className="d-flex flex-wrap align-items-center gap-2 mt-1" style={{ fontSize: "0.68rem" }}>
                                                                            <span className={due > 0 ? "text-danger fw-semibold" : "text-success fw-semibold"}>
                                                                                Outstanding: Rs. {due.toLocaleString()}
                                                                            </span>
                                                                            {paid > 0 && (
                                                                                <>
                                                                                    <span className="text-muted">&bull;</span>
                                                                                    <span className="text-muted">
                                                                                        Paid: Rs. {paid.toLocaleString()}
                                                                                    </span>
                                                                                </>
                                                                            )}
                                                                            {purchases > 0 && (
                                                                                <>
                                                                                    <span className="text-muted">&bull;</span>
                                                                                    <span className="text-muted">
                                                                                        Total: Rs. {purchases.toLocaleString()}
                                                                                    </span>
                                                                                </>
                                                                            )}
                                                                            {orders > 0 && (
                                                                                <>
                                                                                    <span className="text-muted">&bull;</span>
                                                                                    <span className="text-muted">
                                                                                        {orders} {orders === 1 ? "order" : "orders"}
                                                                                    </span>
                                                                                </>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                    <span
                                                                        className={`badge ${isSelected ? "bg-primary text-white" : "bg-light text-secondary border"
                                                                            } flex-shrink-0`}
                                                                        style={{ fontSize: "0.68rem" }}
                                                                    >
                                                                        {isSelected ? "Selected" : "Select"}
                                                                    </span>
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* Autocomplete Dropdown List for Customers (Local Purchase) */}
                                        {currentItem.isLocalPurchase && showCustomerDropdown && (
                                            <div
                                                className="position-absolute start-0 end-0 bg-white border rounded-2 shadow-lg mt-1 overflow-hidden"
                                                style={{
                                                    zIndex: 1060,
                                                    maxHeight: "280px",
                                                    overflowY: "auto",
                                                }}
                                            >
                                                <div
                                                    className="d-flex align-items-center justify-content-between px-2 py-1 bg-light border-bottom text-muted"
                                                    style={{ fontSize: "0.68rem" }}
                                                >
                                                    <span className="fw-semibold">
                                                        {supplierQuery
                                                            ? `Database matching "${supplierQuery}"`
                                                            : `Customers in Database (${matchingCustomers.length})`}
                                                    </span>
                                                    {isSearchingCustomers ? (
                                                        <span className="text-secondary d-flex align-items-center gap-1">
                                                            <span
                                                                className="spinner-border spinner-border-sm"
                                                                style={{ width: "10px", height: "10px", borderWidth: "1.5px" }}
                                                            />
                                                            Searching...
                                                        </span>
                                                    ) : (
                                                        <span className="badge bg-secondary-subtle text-secondary border" style={{ fontSize: "0.64rem" }}>
                                                            {matchingCustomers.length} found
                                                        </span>
                                                    )}
                                                </div>

                                                {matchingCustomers.length === 0 ? (
                                                    <div className="p-3 text-center text-muted small">
                                                        <FiAlertCircle size={18} className="text-secondary mb-1 d-block mx-auto" />
                                                        <div>
                                                            {supplierQuery ? (
                                                                <>
                                                                    No existing customer matching <strong>"{currentItem.supplier}"</strong>
                                                                </>
                                                            ) : (
                                                                "No customers found in database."
                                                            )}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="list-group list-group-flush">
                                                        {matchingCustomers.map((c, idx) => {
                                                            const cName = typeof c === "string" ? c : c?.name || "";
                                                            const cId = typeof c === "object" ? c?._id : cName;
                                                            const isSelected = currentItem.customerId === cId;
                                                            const isHighlighted = activeCustomerIndex === idx;
                                                            const due = Number(c?.totalDue != null ? c.totalDue : (c?.balance || 0));
                                                            const paid = Number(c?.totalPaid || 0);
                                                            const purchases = Number(c?.totalPurchases || 0);
                                                            const orders = c?.totalOrders || 0;

                                                            return (
                                                                <button
                                                                    key={cId}
                                                                    type="button"
                                                                    className={`list-group-item list-group-item-action d-flex align-items-center justify-content-between py-2 px-2 border-bottom ${isSelected
                                                                            ? "text-primary"
                                                                            : isHighlighted
                                                                                ? "bg-light"
                                                                                : ""
                                                                        }`}
                                                                    onMouseDown={(e) => {
                                                                        e.preventDefault();
                                                                        handleSelectCustomer(c);
                                                                    }}
                                                                    style={{ cursor: "pointer" }}
                                                                >
                                                                    <div className="d-flex flex-column text-truncate text-start me-2">
                                                                        <div className="d-flex align-items-center gap-1">
                                                                            <span className="fw-semibold text-dark small text-truncate">
                                                                                {cName}
                                                                            </span>
                                                                            {isSelected && (
                                                                                <FiCheck size={12} className="text-primary flex-shrink-0" />
                                                                            )}
                                                                        </div>
                                                                        <div className="d-flex flex-wrap align-items-center gap-2 mt-1" style={{ fontSize: "0.68rem" }}>
                                                                            <span className={due > 0 ? "text-danger fw-semibold" : "text-success fw-semibold"}>
                                                                                Outstanding: Rs. {due.toLocaleString()}
                                                                            </span>
                                                                            {paid > 0 && (
                                                                                <>
                                                                                    <span className="text-muted">&bull;</span>
                                                                                    <span className="text-muted">
                                                                                        Paid: Rs. {paid.toLocaleString()}
                                                                                    </span>
                                                                                </>
                                                                            )}
                                                                            {purchases > 0 && (
                                                                                <>
                                                                                    <span className="text-muted">&bull;</span>
                                                                                    <span className="text-muted">
                                                                                        Total: Rs. {purchases.toLocaleString()}
                                                                                    </span>
                                                                                </>
                                                                            )}
                                                                            {orders > 0 && (
                                                                                <>
                                                                                    <span className="text-muted">&bull;</span>
                                                                                    <span className="text-muted">
                                                                                        {orders} {orders === 1 ? "order" : "orders"}
                                                                                    </span>
                                                                                </>
                                                                            )}
                                                                            {c?.phone && (
                                                                                <>
                                                                                    <span className="text-muted">&bull;</span>
                                                                                    <span className="text-muted">
                                                                                        Phone: {c.phone}
                                                                                    </span>
                                                                                </>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                    <span
                                                                        className={`badge ${isSelected ? "bg-primary text-white" : "bg-light text-secondary border"
                                                                            } flex-shrink-0`}
                                                                        style={{ fontSize: "0.68rem" }}
                                                                    >
                                                                        {isSelected ? "Selected" : "Select"}
                                                                    </span>
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {/* Small, simple Linked indicator */}
                                    {((!currentItem.isLocalPurchase && currentItem.supplierId) ||
                                        (currentItem.isLocalPurchase && currentItem.customerId)) && (
                                            <div className="d-flex align-items-center justify-content-between mt-1 px-1">
                                                <span
                                                    className="badge d-inline-flex align-items-center gap-1 text-success border border-success-subtle bg-success-subtle py-1 px-2"
                                                    style={{ fontSize: "0.72rem", fontWeight: "600" }}
                                                >
                                                    <FiCheck size={12} className="text-success" />
                                                    <span>
                                                        Linked: {currentItem.isLocalPurchase ? (currentItem.customerName || currentItem.supplier) : currentItem.supplier}
                                                    </span>
                                                </span>
                                                <button
                                                    type="button"
                                                    className="btn btn-link btn-sm p-0 text-decoration-none text-muted"
                                                    style={{ fontSize: "0.7rem", lineHeight: "1" }}
                                                    onClick={handleUnlinkEntity}
                                                    title="Unlink from existing record (treat as new entry)"
                                                >
                                                    ✕ Unlink
                                                </button>
                                            </div>
                                        )}

                                    <FormError message={itemErrors.supplier} />
                                </div>

                                <div className="col-12">
                                    <label className="form-label small fw-semibold text-dark mb-1">
                                        Purchase Date <span className="text-danger">*</span>
                                    </label>
                                    <DatePicker
                                        value={currentItem.purchaseDate}
                                        onChange={handleDateChange}
                                        error={itemErrors.purchaseDate}
                                    />
                                    <FormError message={itemErrors.purchaseDate} />
                                </div>

                                <div className="col-5">
                                    <div className="d-flex align-items-center mb-1" style={{ height: "24px" }}>
                                        <label className="form-label small fw-semibold text-dark mb-0 text-nowrap">
                                            Quantity <span className="text-danger">*</span>
                                        </label>
                                    </div>
                                    <div className="input-group input-group-sm">
                                        <button
                                            type="button"
                                            className="btn btn-outline-secondary"
                                            onClick={() => {
                                                const q = Math.max(
                                                    1,
                                                    (parseInt(currentItem.quantity, 10) || 1) - 1
                                                );
                                                handleQuantityChange({ target: { value: String(q) } });
                                            }}
                                        >
                                            -
                                        </button>
                                        <input
                                            type="number"
                                            name="quantity"
                                            min="1"
                                            step="1"
                                            value={currentItem.quantity}
                                            onChange={handleQuantityChange}
                                            className={`form-control text-center fw-semibold ${itemErrors.quantity ? "is-invalid" : ""}`}
                                            placeholder="1"
                                        />
                                        <button
                                            type="button"
                                            className="btn btn-outline-secondary"
                                            onClick={() => {
                                                const q = (parseInt(currentItem.quantity, 10) || 0) + 1;
                                                handleQuantityChange({ target: { value: String(q) } });
                                            }}
                                        >
                                            +
                                        </button>
                                    </div>
                                    <FormError message={itemErrors.quantity} />
                                </div>

                                <div className="col-7">
                                    <div
                                        className="d-flex justify-content-between align-items-center mb-1 gap-1"
                                        style={{ height: "24px" }}
                                    >
                                        <label className="form-label small fw-semibold text-dark mb-0 text-nowrap flex-shrink-0">
                                            Price&nbsp;<span className="text-danger">*</span>
                                        </label>

                                        <div
                                            className={`pos-toggle-track ${currentItem.priceMode === "total" ? "mode-total" : "mode-unit"}`}
                                            onClick={() =>
                                                handlePriceModeChange(
                                                    currentItem.priceMode === "unit" ? "total" : "unit"
                                                )
                                            }
                                            role="radiogroup"
                                            aria-label="Price Mode"
                                        >
                                            <div className="pos-toggle-indicator" />
                                            <button
                                                type="button"
                                                className={`pos-toggle-btn ${currentItem.priceMode === "unit" ? "active" : "inactive"}`}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handlePriceModeChange("unit");
                                                }}
                                            >
                                                Unit
                                            </button>
                                            <button
                                                type="button"
                                                className={`pos-toggle-btn ${currentItem.priceMode === "total" ? "active" : "inactive"}`}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handlePriceModeChange("total");
                                                }}
                                            >
                                                Total
                                            </button>
                                        </div>
                                    </div>

                                    <div className="input-group input-group-sm">
                                        <span className="input-group-text bg-white fw-semibold small text-dark px-2">
                                            PKR
                                        </span>
                                        <input
                                            type="number"
                                            name="purchasePrice"
                                            min="0"
                                            step="0.01"
                                            value={currentItem.purchasePrice}
                                            onChange={handleCurrentItemChange}
                                            className={`form-control ${itemErrors.purchasePrice ? "is-invalid" : ""}`}
                                            placeholder={currentItem.priceMode === "unit" ? "e.g. 850" : "e.g. 8500"}
                                            autoComplete="off"
                                        />
                                    </div>
                                    <FormError message={itemErrors.purchasePrice} />

                                    {currentQty > 0 && currentPurchasePrice > 0 && (
                                        <div className="text-secondary mt-1" style={{ fontSize: "0.72rem" }}>
                                            {currentItem.priceMode === "unit" ? (
                                                <span>
                                                    Total Cost: <strong>Rs. {computedSubtotal.toLocaleString()}</strong>
                                                </span>
                                            ) : (
                                                <span>
                                                    Unit Cost: <strong>Rs. {computedUnitPrice.toLocaleString()}</strong>
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <div className="col-12">
                                    <div
                                        className="d-flex justify-content-between align-items-center mb-1 gap-1"
                                        style={{ height: "24px" }}
                                    >
                                        <label className="form-label small fw-semibold text-dark mb-0 text-nowrap flex-shrink-0">
                                            Estimated Sale Price
                                        </label>

                                        <div
                                            className={`pos-toggle-track ${currentItem.estimatedPriceMode === "total" ? "mode-total" : "mode-unit"}`}
                                            onClick={() =>
                                                handleEstimatedPriceModeChange(
                                                    currentItem.estimatedPriceMode === "unit" ? "total" : "unit"
                                                )
                                            }
                                            role="radiogroup"
                                            aria-label="Estimated Sale Price Mode"
                                        >
                                            <div className="pos-toggle-indicator" />
                                            <button
                                                type="button"
                                                className={`pos-toggle-btn ${currentItem.estimatedPriceMode === "unit" ? "active" : "inactive"}`}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleEstimatedPriceModeChange("unit");
                                                }}
                                            >
                                                Unit
                                            </button>
                                            <button
                                                type="button"
                                                className={`pos-toggle-btn ${currentItem.estimatedPriceMode === "total" ? "active" : "inactive"}`}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleEstimatedPriceModeChange("total");
                                                }}
                                            >
                                                Total
                                            </button>
                                        </div>
                                    </div>

                                    <div className="input-group input-group-sm">
                                        <span className="input-group-text bg-white fw-semibold small text-dark px-2">
                                            PKR
                                        </span>
                                        <input
                                            type="number"
                                            name="estimatedSalePrice"
                                            min="0"
                                            step="0.01"
                                            value={currentItem.estimatedSalePrice}
                                            onChange={handleEstimatedSalePriceChange}
                                            className={`form-control ${itemErrors.estimatedSalePrice ? "is-invalid" : ""}`}
                                            placeholder={
                                                currentItem.estimatedPriceMode === "unit"
                                                    ? "Estimated sale price per unit (PKR)"
                                                    : "Estimated total sale value (PKR)"
                                            }
                                            autoComplete="off"
                                        />
                                    </div>
                                    <FormError message={itemErrors.estimatedSalePrice} />

                                    {hasValidEstPrice ? (
                                        <div className="text-secondary mt-1" style={{ fontSize: "0.72rem" }}>
                                            {currentItem.estimatedPriceMode === "unit" ? (
                                                <span>
                                                    Estimated Total Sale Value:{" "}
                                                    <strong>
                                                        PKR {computedEstimatedTotalSaleValue != null ? computedEstimatedTotalSaleValue.toLocaleString() : "0"}
                                                    </strong>{" "}
                                                    <span className="text-muted">({currentQty} {currentQty === 1 ? "unit" : "units"})</span>
                                                </span>
                                            ) : (
                                                <span>
                                                    Estimated Sale Price Per Unit:{" "}
                                                    <strong>
                                                        PKR {computedEstimatedUnitPrice != null ? computedEstimatedUnitPrice.toLocaleString() : "0"}
                                                    </strong>{" "}
                                                    <span className="text-muted">/ unit ({currentQty} {currentQty === 1 ? "unit" : "units"})</span>
                                                </span>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="text-muted mt-1" style={{ fontSize: "0.72rem" }}>
                                            <span>Expected selling price for sales preview • Currency: PKR</span>
                                        </div>
                                    )}
                                </div>



                                <div className="col-12">
                                    <div className="p-3 bg-light rounded-3 border">
                                        <div className="d-flex flex-wrap justify-content-between align-items-center mb-2 gap-1">
                                            <div className="d-flex align-items-center gap-1.5 flex-wrap">
                                                <span className="small fw-bold text-dark text-nowrap">
                                                    IEMI Numbers ({currentItem.barcodes.length})
                                                </span>
                                                {iemiRequired ? (
                                                    <span className="badge bg-danger-subtle text-danger border border-danger-subtle" style={{ fontSize: "0.68rem" }}>
                                                        15 Digits Compulsory
                                                    </span>
                                                ) : (
                                                    <span className="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle" style={{ fontSize: "0.68rem" }}>
                                                        Optional
                                                    </span>
                                                )}
                                                <span className="badge bg-white text-dark border">
                                                    {
                                                        currentItem.barcodes.filter(
                                                            (b) => String(b).trim().length === 15
                                                        ).length
                                                    }{" "}
                                                    / {currentItem.barcodes.length} Completed
                                                </span>
                                            </div>
                                        </div>

                                        <p className="text-secondary small mb-2" style={{ fontSize: "0.74rem" }}>
                                            {iemiRequired
                                                ? "Scanner mode: Scan directly into any unit box or anywhere on page. Every unit must have a 15-digit IEMI."
                                                : "IEMI is optional for accessories. Enter if available, or leave blank."
                                            }
                                        </p>

                                        <FormError message={itemErrors.barcodes} />

                                        <div className="pos-barcode-scroll">
                                            <div className="row g-2">
                                                {currentItem.barcodes.map((bcVal, idx) => {
                                                    const cleanBc = String(bcVal || "").trim();
                                                    const isComplete = cleanBc.length === 15;
                                                    return (
                                                        <div key={idx} className="col-12">
                                                            <div className="input-group input-group-sm">
                                                                <span
                                                                    className={`input-group-text font-monospace px-2 ${
                                                                        isComplete ? "bg-success-subtle text-success fw-bold" : "bg-white text-secondary"
                                                                    }`}
                                                                    style={{ fontSize: "0.72rem", minWidth: "38px" }}
                                                                >
                                                                    #{idx + 1}
                                                                </span>
                                                                <input
                                                                    ref={(el) => (barcodeInputRefs.current[idx] = el)}
                                                                    type="text"
                                                                    inputMode="numeric"
                                                                    pattern="[0-9]*"
                                                                    maxLength={15}
                                                                    value={bcVal}
                                                                    onChange={(e) => handleBarcodeChange(idx, e.target.value)}
                                                                    onKeyDown={(e) => handleBarcodeKeyDown(e, idx)}
                                                                    onPaste={(e) => {
                                                                        e.preventDefault();
                                                                        const text = e.clipboardData?.getData("text") || "";
                                                                        const digitsOnly = text.replace(/\D/g, "").slice(0, 15);
                                                                        handleBarcodeChange(idx, digitsOnly);
                                                                    }}
                                                                    className={`form-control font-monospace pos-barcode-input ${
                                                                        itemErrors[`barcode_${idx}`] ? "is-invalid" : isComplete ? "is-valid" : ""
                                                                    }`}
                                                                    placeholder="Enter 15 digits only"
                                                                    autoComplete="off"
                                                                    data-barcode-index={idx}
                                                                />
                                                                <span
                                                                    className={`input-group-text px-2 small ${
                                                                        isComplete ? "bg-success-subtle text-success fw-bold" : cleanBc.length > 0 ? "bg-warning-subtle text-warning-emphasis" : "bg-light text-muted"
                                                                    }`}
                                                                    style={{ fontSize: "0.7rem", minWidth: "52px", justifyContent: "center" }}
                                                                >
                                                                    {cleanBc.length}/15
                                                                </span>
                                                            </div>
                                                            <FormError message={itemErrors[`barcode_${idx}`]} />
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="col-12 d-flex justify-content-end gap-2 pt-2">
                                    {editingItemId && (
                                        <button
                                            type="button"
                                            className="btn btn-outline-secondary btn-sm px-3"
                                            onClick={handleCancelEdit}
                                        >
                                            <FiX size={14} className="me-1" />
                                            Cancel
                                        </button>
                                    )}
                                    {!isSaleMode && (
                                        <button
                                            type="button"
                                            className="btn btn-dark btn-sm px-4 d-inline-flex align-items-center gap-2 shadow-sm"
                                            onClick={handleStageCurrentItem}
                                        >
                                            {editingItemId ? (
                                                <>
                                                    <FiCheck size={15} />
                                                    <span>Update Item</span>
                                                </>
                                            ) : (
                                                <>
                                                    <FiPlus size={15} />
                                                    <span>Add Item</span>
                                                </>
                                            )}
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="col-12 col-lg-7 col-xl-7 d-flex flex-column gap-3">
                    {isSaleMode ? (
                        <>
                            {/* 1. Search Stock Inventory Card */}
                            <div className="card border shadow-sm rounded-3">
                                <div className="card-header bg-white border-bottom py-2 px-3 d-flex justify-content-between align-items-center">
                                    <div className="d-flex align-items-center gap-2">
                                        <div className="d-inline-flex p-1 rounded-2 bg-dark text-white">
                                            <FiSearch size={14} />
                                        </div>
                                        <span className="fw-semibold text-dark small">
                                            Search Stock Inventory (IEMI / Barcode / Name)
                                        </span>
                                    </div>
                                    <span className="badge bg-light text-dark border py-0 px-2" style={{ fontSize: "0.68rem" }}>
                                        {posSearchResults.length} Available
                                    </span>
                                </div>
                                <div className="card-body p-2 px-3">
                                    <div className="position-relative" ref={posSearchDropdownRef}>
                                        <div className="input-group input-group-sm">
                                            <span className="input-group-text bg-white text-secondary">
                                                <FiSearch size={14} />
                                            </span>
                                            <input
                                                ref={posSearchInputRef}
                                                type="text"
                                                className="form-control"
                                                placeholder="Scan IEMI / barcode or type product name & press Enter..."
                                                value={posSearchQuery}
                                                onChange={(e) => {
                                                    setPosSearchQuery(e.target.value);
                                                    setShowPosSearchDropdown(true);
                                                }}
                                                onFocus={() => setShowPosSearchDropdown(true)}
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter") {
                                                        e.preventDefault();
                                                        handleScanOrAddFromSearch();
                                                    }
                                                }}
                                                autoComplete="off"
                                            />
                                            {posSearchQuery && (
                                                <button
                                                    type="button"
                                                    className="btn btn-outline-secondary"
                                                    onClick={() => {
                                                        setPosSearchQuery("");
                                                        searchInventoryForSale("");
                                                    }}
                                                >
                                                    <FiX size={13} />
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                className="btn btn-dark px-3 fw-semibold d-inline-flex align-items-center gap-1"
                                                onClick={() => handleScanOrAddFromSearch()}
                                                disabled={isSearchingPos}
                                            >
                                                {isSearchingPos ? (
                                                    <span className="spinner-border spinner-border-sm" role="status" />
                                                ) : (
                                                    <>
                                                        <FiPlus size={14} />
                                                        <span>Add</span>
                                                    </>
                                                )}
                                            </button>
                                        </div>

                                        {/* Live Search Suggestions Dropdown */}
                                        {showPosSearchDropdown && posSearchResults.length > 0 && (
                                            <div
                                                className="position-absolute start-0 end-0 bg-white border rounded-2 shadow-lg mt-1 overflow-hidden"
                                                style={{ zIndex: 1060, maxHeight: "240px", overflowY: "auto" }}
                                            >
                                                <div className="d-flex align-items-center justify-content-between px-3 py-1 bg-light border-bottom text-muted small">
                                                    <span style={{ fontSize: "0.68rem", fontWeight: "600" }}>
                                                        {posSearchQuery ? `Matching "${posSearchQuery}"` : "Available Stock Products"}
                                                    </span>
                                                    <span className="badge bg-secondary-subtle text-secondary border" style={{ fontSize: "0.62rem" }}>
                                                        {posSearchResults.length} found
                                                    </span>
                                                </div>
                                                <div className="list-group list-group-flush">
                                                    {posSearchResults.map((prod) => {
                                                        const avail = prod.quantity != null ? prod.quantity : (prod.availableQuantity || 0);
                                                        const price = Number(prod.unitPrice ?? prod.unitPurchaseCost ?? 0);
                                                        const estSale = prod.estimatedSalePricePerUnit ?? null;
                                                        const targetBc = resolveTargetBarcode(prod, posSearchQuery);
                                                        const isBcMatched = Boolean(
                                                            posSearchQuery &&
                                                            posSearchQuery.trim() &&
                                                            targetBc &&
                                                            targetBc.toLowerCase().includes(posSearchQuery.trim().toLowerCase())
                                                        );

                                                        return (
                                                            <div
                                                                key={prod._id}
                                                                className="list-group-item list-group-item-action d-flex align-items-center justify-content-between py-2 px-3 border-bottom"
                                                                style={{ cursor: "pointer" }}
                                                                onClick={() => {
                                                                    addItemToSalesCart(prod, targetBc);
                                                                    setShowPosSearchDropdown(false);
                                                                    setPosSearchQuery("");
                                                                }}
                                                            >
                                                                <div className="d-flex flex-column text-truncate me-2">
                                                                    <div className="d-flex align-items-center gap-1.5 flex-wrap">
                                                                        <span className="fw-semibold text-dark small text-truncate">
                                                                            {prod.productName}
                                                                        </span>
                                                                        {isBcMatched && targetBc && (
                                                                            <span
                                                                                className="badge bg-dark text-white font-monospace py-0 px-1.5"
                                                                                style={{ fontSize: "0.62rem" }}
                                                                                title={`Matched IMEI: ${targetBc}`}
                                                                            >
                                                                                ✓ IEMI: {targetBc}
                                                                            </span>
                                                                        )}
                                                                        {prod.isLocalPurchase && (
                                                                            <span className="badge bg-danger-subtle text-danger border border-danger-subtle py-0 px-1" style={{ fontSize: "0.6rem" }}>
                                                                                Local Purchase
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <div className="text-muted d-flex align-items-center gap-2 mt-1" style={{ fontSize: "0.68rem" }}>
                                                                        <span>Cost: Rs. {price.toLocaleString()}</span>
                                                                        <span>•</span>
                                                                        <span className={avail > 0 ? "text-success fw-bold" : "text-danger"}>
                                                                            {avail} pcs available
                                                                        </span>
                                                                        {estSale && (
                                                                            <>
                                                                                <span>•</span>
                                                                                <span className="text-secondary">Est: Rs. {Number(estSale).toLocaleString()}</span>
                                                                            </>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                                <button
                                                                    type="button"
                                                                    className="btn btn-outline-dark btn-sm py-1 px-2 d-inline-flex align-items-center gap-1 flex-shrink-0"
                                                                    style={{ fontSize: "0.7rem" }}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        addItemToSalesCart(prod, targetBc);
                                                                        setShowPosSearchDropdown(false);
                                                                        setPosSearchQuery("");
                                                                    }}
                                                                    disabled={avail <= 0}
                                                                >
                                                                    <FiPlus size={11} />
                                                                    <span>Add</span>
                                                                </button>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* 2. Sales Cart Card matching Image 2 with Compact Height */}
                            <div className="card border shadow-sm rounded-3 overflow-hidden">
                                <div className="card-header bg-dark text-white py-2 px-3 d-flex justify-content-between align-items-center">
                                    <div className="d-flex align-items-center gap-2">
                                        <FiShoppingCart size={15} />
                                        <span className="fw-bold" style={{ fontSize: "0.9rem" }}>
                                            Sales Cart ({salesCart.length} {salesCart.length === 1 ? "item" : "items"})
                                        </span>
                                    </div>
                                    <button
                                        type="button"
                                        className="btn btn-outline-light btn-sm py-1 px-2"
                                        style={{ fontSize: "0.72rem" }}
                                        onClick={clearSalesCart}
                                        disabled={salesCart.length === 0}
                                    >
                                        Clear All
                                    </button>
                                </div>

                                <div className="card-body p-2">
                                    {salesCart.length === 0 ? (
                                        <div className="text-center py-3 px-2 text-secondary">
                                            <FiShoppingCart size={28} className="text-secondary opacity-50 mb-1" />
                                            <p className="small mb-0" style={{ fontSize: "0.75rem" }}>
                                                Your sales cart is empty. Search by IEMI, barcode or product name above to add items to sell.
                                            </p>
                                        </div>
                                    ) : (
                                        <div
                                            className="pos-cart-scroll d-flex flex-column gap-2 mb-2"
                                            style={{ maxHeight: "280px", overflowY: "auto", paddingRight: "2px" }}
                                        >
                                            {salesCart.map((item, idx) => {
                                                const itemCost = Number(item.unitPurchaseCost) || 0;
                                                const numUnitPrice =
                                                    item.unitSellingPrice !== undefined && item.unitSellingPrice !== ""
                                                        ? Number(item.unitSellingPrice)
                                                        : Number(item.sellingPrice) || 0;
                                                const qty = Number(item.quantity) || 1;
                                                const lineTotal = Number((numUnitPrice * qty).toFixed(2));
                                                const lineCostTotal = Number((itemCost * qty).toFixed(2));
                                                const lineDiff = Number((lineTotal - lineCostTotal).toFixed(2));
                                                const lineProfit = lineDiff > 0;
                                                const lineLoss = lineDiff < 0;
                                                const hasEstUnit = item.estimatedSalePricePerUnit != null;
                                                const estUnitVal = Number(item.estimatedSalePricePerUnit) || 0;

                                                return (
                                                    <div
                                                        key={`${item.stockId}_${idx}`}
                                                        className="card border rounded-2 p-2 bg-white shadow-sm"
                                                    >
                                                        {/* Item Title & Trash Button */}
                                                        <div className="d-flex justify-content-between align-items-center mb-1">
                                                            <div className="d-flex align-items-center gap-1 flex-wrap">
                                                                <h6 className="fw-bold text-dark mb-0" style={{ fontSize: "0.82rem" }}>
                                                                    {item.productName}
                                                                </h6>
                                                                {item.isLocalPurchase && (
                                                                    <span
                                                                        className="badge bg-danger-subtle text-danger border border-danger-subtle py-0 px-1"
                                                                        style={{ fontSize: "0.58rem", fontWeight: "600" }}
                                                                    >
                                                                        Local Purchase
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <button
                                                                type="button"
                                                                className="btn btn-outline-danger btn-sm p-0 rounded-2 d-flex align-items-center justify-content-center"
                                                                style={{ width: "22px", height: "22px" }}
                                                                onClick={() => removeSalesCartItem(idx)}
                                                                title="Remove item"
                                                            >
                                                                <FiTrash2 size={12} />
                                                            </button>
                                                        </div>

                                                        {/* Purchase Price and Available Pcs */}
                                                        <div
                                                            className="d-flex align-items-center gap-2 text-secondary mb-1"
                                                            style={{ fontSize: "0.68rem" }}
                                                        >
                                                            <span>
                                                                Purchase Price:{" "}
                                                                <strong className="text-dark">
                                                                    PKR {itemCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                                </strong>
                                                            </span>
                                                            <span>•</span>
                                                            <span>
                                                                Available:{" "}
                                                                <strong className="text-success fw-bold">
                                                                    {item.availableQuantity} pcs
                                                                </strong>
                                                            </span>
                                                        </div>

                                                        {/* Compact SAVED STOCK ESTIMATES Box */}
                                                        <div
                                                            className="px-2 py-1 mb-2 rounded-2 border bg-light"
                                                            style={{ fontSize: "0.65rem", lineHeight: "1.2" }}
                                                        >
                                                            <div className="d-flex align-items-center justify-content-between pb-1 border-bottom" style={{ borderColor: "#e4e4e7" }}>
                                                                <span
                                                                    className="fw-bold text-secondary text-uppercase"
                                                                    style={{ fontSize: "0.58rem", letterSpacing: "0.3px" }}
                                                                >
                                                                    SAVED STOCK ESTIMATES
                                                                </span>
                                                                <span
                                                                    className="badge bg-secondary-subtle text-secondary border py-0 px-1"
                                                                    style={{ fontSize: "0.55rem" }}
                                                                >
                                                                    Reference
                                                                </span>
                                                            </div>
                                                            <div className="d-flex justify-content-between align-items-center pt-1">
                                                                <span className="text-muted" style={{ fontSize: "0.64rem" }}>Est. Sale Price / Unit:</span>
                                                                {hasEstUnit ? (
                                                                    <strong className="text-dark font-monospace" style={{ fontSize: "0.66rem" }}>
                                                                        PKR {estUnitVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                                    </strong>
                                                                ) : (
                                                                    <span className="text-muted fst-italic" style={{ fontSize: "0.64rem" }}>Not set</span>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {/* Scanned Serialized Barcodes (if any) */}
                                                        {item.barcodes && item.barcodes.length > 0 && (
                                                            <div className="d-flex flex-wrap align-items-center gap-1 mb-1">
                                                                <span className="text-secondary fw-semibold" style={{ fontSize: "0.62rem" }}>
                                                                    Barcodes ({item.barcodes.length}):
                                                                </span>
                                                                {item.barcodes.map((bc, bIdx) => (
                                                                    <span
                                                                        key={bIdx}
                                                                        className="badge bg-light text-dark border font-monospace px-1 py-0"
                                                                        style={{ fontSize: "0.62rem" }}
                                                                    >
                                                                        {bc}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}

                                                        {/* Actual Qty & Actual Unit Price Inputs */}
                                                        <div className="row g-2 align-items-end mb-0">
                                                            {/* Quantity Stepper */}
                                                            <div className="col-5">
                                                                <label
                                                                    className="text-secondary fw-semibold mb-0 d-block"
                                                                    style={{ fontSize: "0.64rem", lineHeight: "1.2" }}
                                                                >
                                                                    Actual Qty
                                                                </label>
                                                                <div className="input-group input-group-sm pos-cart-input-group">
                                                                    <button
                                                                        type="button"
                                                                        className="btn btn-outline-secondary px-2"
                                                                        onClick={() => updateSalesCartQty(idx, item.quantity - 1)}
                                                                        disabled={item.quantity <= 1}
                                                                        title="Decrease quantity"
                                                                    >
                                                                        <FiMinus size={9} />
                                                                    </button>
                                                                    <input
                                                                        type="number"
                                                                        className="form-control form-control-sm text-center fw-bold px-1"
                                                                        style={{ fontSize: "0.76rem" }}
                                                                        min="1"
                                                                        max={item.availableQuantity}
                                                                        value={item.quantity}
                                                                        onChange={(e) => updateSalesCartQty(idx, e.target.value)}
                                                                    />
                                                                    <button
                                                                        type="button"
                                                                        className="btn btn-outline-secondary px-2"
                                                                        onClick={() => updateSalesCartQty(idx, item.quantity + 1)}
                                                                        disabled={item.quantity >= item.availableQuantity}
                                                                        title="Increase quantity"
                                                                    >
                                                                        <FiPlus size={9} />
                                                                    </button>
                                                                </div>
                                                            </div>

                                                            {/* Actual Selling Price Input */}
                                                            <div className="col-7">
                                                                <label
                                                                    className="text-secondary fw-semibold mb-0 d-block"
                                                                    style={{ fontSize: "0.64rem", lineHeight: "1.2" }}
                                                                >
                                                                    Actual Unit Price (PKR)
                                                                </label>
                                                                <div className="input-group input-group-sm pos-cart-input-group">
                                                                    <span
                                                                        className="input-group-text bg-white text-secondary fw-semibold px-2"
                                                                        style={{ fontSize: "0.65rem" }}
                                                                    >
                                                                        PKR
                                                                    </span>
                                                                    <input
                                                                        type="number"
                                                                        step="any"
                                                                        min="0"
                                                                        className="form-control form-control-sm fw-bold text-dark text-start"
                                                                        style={{ fontSize: "0.76rem" }}
                                                                        value={item.unitSellingPrice}
                                                                        onChange={(e) => updateSalesCartPrice(idx, e.target.value)}
                                                                        placeholder="0.00"
                                                                        required
                                                                    />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}

                                    {/* Grand Total Order Card */}
                                    <div className="p-2 border rounded-2 bg-light mb-2">
                                        <div className="d-flex justify-content-between align-items-center mb-0">
                                            <span className="fw-bold text-dark small">Grand Total Bill:</span>
                                            <strong className="text-dark fs-6">
                                                Rs. {salesGrandTotalSale.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                                            </strong>
                                        </div>

                                        {/* Trade-in / Local Purchase Intake Offset (if item is entered on the left) */}
                                        {currentItem.productName && computedSubtotal > 0 && (
                                            <div className="p-2 mt-2 rounded-2 border bg-white small">
                                                <div className="d-flex justify-content-between text-secondary mb-1">
                                                    <span>Customer Trade-In ({currentItem.productName}):</span>
                                                    <strong className="text-danger">-Rs. {computedSubtotal.toLocaleString()}</strong>
                                                </div>
                                                <div className="d-flex justify-content-between fw-bold pt-1 border-top">
                                                    <span>Net Balance to Settle:</span>
                                                    <span className={salesGrandTotalSale >= computedSubtotal ? "text-success" : "text-primary"}>
                                                        Rs. {Math.abs(salesGrandTotalSale - computedSubtotal).toLocaleString()}
                                                        {salesGrandTotalSale < computedSubtotal ? " (Pay to Customer)" : " (Collect from Customer)"}
                                                    </span>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Complete Sale Action Button */}
                                    <div>
                                        <button
                                            type="button"
                                            className="btn btn-dark w-100 py-2 fw-bold d-flex align-items-center justify-content-center gap-2 shadow-sm"
                                            disabled={isSubmittingSale || salesCart.length === 0 || salesGrandTotalSale <= 0}
                                            onClick={handleCompleteSaleOrder}
                                        >
                                            {isSubmittingSale ? (
                                                <>
                                                    <div className="spinner-border spinner-border-sm" role="status" />
                                                    <span>Processing Sale Transaction...</span>
                                                </>
                                            ) : (
                                                <>
                                                    <FiCheckCircle size={16} />
                                                    <span>
                                                        Complete Sale ({salesCart.length} items • Rs. {salesGrandTotalSale.toLocaleString()})
                                                    </span>
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="card border shadow-sm rounded-3">
                                <div className="card-header bg-white border-bottom py-2 px-3 d-flex justify-content-between align-items-center">
                                    <div className="d-flex align-items-center gap-2">
                                        <div className="d-inline-flex p-1 rounded-2 bg-dark text-white">
                                            <FiShoppingCart size={15} />
                                        </div>
                                        <span className="fw-semibold text-dark small">
                                            2. Staged Line Items ({stagedItems.length})
                                        </span>
                                    </div>
                                    <span className="badge bg-light text-dark border">
                                        {totalCumulativeQuantity} Units Total
                                    </span>
                                </div>

                                <div className="card-body p-3">
                                    {stagedItems.length === 0 ? (
                                        <div className="text-center py-5 px-3 text-secondary">
                                            <FiLayers size={40} className="text-secondary opacity-50 mb-2" />
                                            <p className="small mb-0">
                                                Fill in product & supplier details on the left, and click{" "}
                                                <strong>+ Add Item to Staged Batch</strong>.
                                            </p>
                                        </div>
                                    ) : (
                                        <div
                                            className="pos-cart-scroll d-flex flex-column gap-2"
                                            style={{ maxHeight: "380px" }}
                                        >
                                            {allocatedStagedItems.map((item, index) => {
                                                const isEditing = editingItemId === item.id;
                                                const isExpanded = Boolean(expandedBarcodeDrawers[item.id]);
                                                const realBarcodesCount = item.barcodes.filter(
                                                    (b) => b !== "N/A"
                                                ).length;

                                                return (
                                                    <div
                                                        key={item.id}
                                                        className={`card pos-cart-card rounded-3 p-3 ${isEditing ? "is-editing" : ""}`}
                                                    >
                                                        <div className="d-flex justify-content-between align-items-start gap-2">
                                                            <div>
                                                                <div className="d-flex align-items-center flex-wrap gap-2">
                                                                    <span
                                                                        className={`badge rounded-pill px-2 ${isEditing
                                                                                ? "bg-dark text-white border border-dark"
                                                                                : "bg-light text-secondary border"
                                                                            }`}
                                                                        style={{ fontSize: "0.68rem" }}
                                                                    >
                                                                        #{index + 1}
                                                                    </span>
                                                                    <h6 className="fw-bold text-dark mb-0 small">
                                                                        {item.productName}
                                                                    </h6>
                                                                    {item.category !== "Mobile Accessories" && (item.storage || item.color) && (
                                                                        <span
                                                                            className="badge bg-secondary-subtle text-dark border"
                                                                            style={{ fontSize: "0.65rem", fontWeight: "600" }}
                                                                        >
                                                                            {[item.storage, item.color].filter(Boolean).join(" • ")}
                                                                        </span>
                                                                    )}
                                                                    {item.isLocalPurchase && (
                                                                        <span
                                                                            className="badge bg-danger-subtle text-danger border border-danger-subtle"
                                                                            style={{ fontSize: "0.65rem", fontWeight: "600" }}
                                                                        >
                                                                            Local Purchase
                                                                        </span>
                                                                    )}
                                                                    <span className="badge bg-light text-dark border small d-inline-flex align-items-center gap-1">
                                                                        <FiUser size={11} className={item.isLocalPurchase ? "text-danger" : ""} />
                                                                        <span>{item.isLocalPurchase ? `Customer: ${item.supplier}` : `Supplier: ${item.supplier}`}</span>
                                                                    </span>
                                                                    {/* {item.supplierId ? (
                                                                <span
                                                                    className="badge bg-primary-subtle text-primary border border-primary-subtle"
                                                                    style={{ fontSize: "0.65rem" }}
                                                                >
                                                                    Linked
                                                                </span>
                                                            ) : (
                                                                <span
                                                                    className="badge bg-success-subtle text-success border border-success-subtle"
                                                                    style={{ fontSize: "0.65rem" }}
                                                                >
                                                                    New Supplier
                                                                </span>
                                                            )} */}
                                                                    {isEditing && (
                                                                        <span
                                                                            className="badge bg-dark"
                                                                            style={{ fontSize: "0.65rem" }}
                                                                        >
                                                                            Editing Now
                                                                        </span>
                                                                    )}
                                                                </div>

                                                                <div
                                                                    className="text-secondary small mt-1 d-flex flex-wrap align-items-center gap-2"
                                                                    style={{ fontSize: "0.75rem" }}
                                                                >
                                                                    <span>
                                                                        <strong>{item.quantity} Units</strong> × Rs.{" "}
                                                                        {item.unitPrice.toLocaleString()}
                                                                    </span>
                                                                    {/* <span className="text-muted">•</span> */}
                                                                    {/* <span>
                                                                Est. Sale:{" "}
                                                                <strong className="text-dark">
                                                                    {item.estimatedSalePricePerUnit != null
                                                                        ? `PKR ${item.estimatedSalePricePerUnit.toLocaleString()} / unit (Total: PKR ${(item.estimatedTotalSaleValue != null ? item.estimatedTotalSaleValue : item.estimatedSalePricePerUnit * item.quantity).toLocaleString()})`
                                                                        : "Not set"}
                                                                </strong>
                                                            </span> */}
                                                                    <span className="text-muted">•</span>
                                                                    <span className="d-inline-flex align-items-center gap-1">
                                                                        <FiCalendar size={12} />
                                                                        <span>{item.purchaseDate}</span>
                                                                    </span>
                                                                </div>
                                                            </div>

                                                            <div className="text-end flex-shrink-0">
                                                                <span className="d-block fw-bold text-dark">
                                                                    Rs. {item.subtotal.toLocaleString()}
                                                                </span>
                                                                <div className="d-flex align-items-center gap-1 mt-1 justify-content-end">
                                                                    <button
                                                                        type="button"
                                                                        className={`btn btn-sm p-1 ${isEditing
                                                                                ? "btn-dark text-white shadow-sm border border-dark"
                                                                                : "btn-outline-secondary"
                                                                            }`}
                                                                        onClick={() => handleEditStagedItem(item)}
                                                                        title={isEditing ? "Currently editing this item" : "Edit this line item"}
                                                                    >
                                                                        <FiEdit2 size={13} />
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        className="btn btn-outline-danger btn-sm p-1"
                                                                        onClick={() => handleDeleteStagedItem(item.id)}
                                                                        title="Remove from batch"
                                                                    >
                                                                        <FiTrash2 size={13} />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </div>


                                                        {/* <div className="mt-2 pt-1 border-top">
                                                    <button
                                                        type="button"
                                                        className="btn btn-sm btn-light border w-100 d-flex justify-content-between align-items-center py-1 px-2"
                                                        style={{ fontSize: "0.72rem" }}
                                                        onClick={() => toggleBarcodeDrawer(item.id)}
                                                    >
                                                        <span className="d-flex align-items-center gap-1 text-secondary">
                                                            <FiHash size={12} />
                                                            <span>
                                                                {realBarcodesCount > 0
                                                                    ? `${realBarcodesCount} Serial IEMI Numbers / ${item.barcodes.length - realBarcodesCount} N/A`
                                                                    : `${item.barcodes.length} Units (N/A IEMI Numbers)`}
                                                            </span>
                                                        </span>
                                                        {isExpanded ? (
                                                            <FiChevronUp size={14} />
                                                        ) : (
                                                            <FiChevronDown size={14} />
                                                        )}
                                                    </button>

                                                    {isExpanded && (
                                                        <div className="mt-2 d-flex flex-wrap gap-1">
                                                            {item.barcodes.map((bc, bIdx) => (
                                                                <span
                                                                    key={bIdx}
                                                                    className={`pos-barcode-chip ${
                                                                        bc === "N/A" ? "text-secondary opacity-75" : ""
                                                                    }`}
                                                                    onClick={() => handleCopyBarcode(bc)}
                                                                    title={bc === "N/A" ? "No IEMI number (N/A)" : "Click to copy IEMI number"}
                                                                    style={{ cursor: bc === "N/A" ? "default" : "pointer" }}
                                                                >
                                                                    <span>{bc}</span>
                                                                    {bc !== "N/A" &&
                                                                        (copiedBarcode === bc ? (
                                                                            <FiCheck size={11} className="text-success" />
                                                                        ) : (
                                                                            <FiCopy size={11} className="text-muted" />
                                                                        ))}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div> */}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* BATCH PAYMENT SETTLEMENT CARD */}
                            <div className="card border shadow-sm rounded-3">
                                <div className="card-header bg-white border-bottom py-2 px-3 d-flex justify-content-between align-items-center">
                                    <div className="d-flex align-items-center gap-2">
                                        <div className="d-inline-flex p-1 rounded-2 bg-dark text-white">
                                            <FiCreditCard size={15} />
                                        </div>
                                        <span className="fw-semibold text-dark small">
                                            Batch Payment Settlement
                                        </span>
                                    </div>

                                    <div className="d-flex align-items-center gap-2">
                                        <div className="form-check form-check-inline m-0 d-flex align-items-center gap-1">
                                            <input
                                                type="checkbox"
                                                className="form-check-input mt-0"
                                                id="batchFullPaymentTick"
                                                checked={isBatchFullPayment}
                                                onChange={handleBatchFullPaymentToggle}
                                                disabled={stagedItems.length === 0}
                                                style={{ cursor: stagedItems.length === 0 ? "not-allowed" : "pointer" }}
                                            />
                                            <label
                                                className="form-check-label small fw-semibold text-dark user-select-none"
                                                htmlFor="batchFullPaymentTick"
                                                style={{
                                                    cursor: stagedItems.length === 0 ? "not-allowed" : "pointer",
                                                    fontSize: "0.74rem",
                                                }}
                                            >
                                                Full Payment
                                            </label>
                                        </div>
                                    </div>
                                </div>

                                <div className="card-body p-3">
                                    {stagedItems.length === 0 ? (
                                        <div className="text-center py-3 text-secondary">
                                            <FiCreditCard size={24} className="mb-2 text-muted opacity-50 d-block mx-auto" />
                                            <span className="small">Add line items to Staged Line Items above to settle batch payment.</span>
                                        </div>
                                    ) : (
                                        <div className="row g-2 align-items-start">
                                            {/* 1. Total Purchase Value */}
                                            <div className="col-12 col-md-4">
                                                <label className="form-label small fw-semibold text-secondary mb-1 d-block text-nowrap">
                                                    Total Purchase Value
                                                </label>
                                                <div className="input-group input-group-sm">
                                                    <span className="input-group-text bg-white fw-semibold small text-secondary px-2">
                                                        PKR
                                                    </span>
                                                    <div
                                                        className="form-control fw-bold bg-light text-dark d-flex align-items-center"
                                                        style={{ userSelect: "none" }}
                                                        title={`PKR ${totalBatchValue.toLocaleString()}`}
                                                    >
                                                        {totalBatchValue.toLocaleString()}
                                                    </div>
                                                </div>
                                                <div className="text-muted mt-1" style={{ fontSize: "0.72rem" }}>
                                                    <span>
                                                        {totalCumulativeQuantity} {totalCumulativeQuantity === 1 ? "unit" : "units"} • {stagedItems.length} {stagedItems.length === 1 ? "line item" : "line items"}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* 2. Amount Paid */}
                                            <div className="col-12 col-md-4">
                                                <label className="form-label small fw-semibold text-dark mb-1 d-block text-nowrap">
                                                    Amount Paid
                                                </label>
                                                <div className="input-group input-group-sm">
                                                    <span className="input-group-text bg-white fw-semibold small text-dark px-2">
                                                        PKR
                                                    </span>
                                                    <input
                                                        type="number"
                                                        id="batchAmountPaidInput"
                                                        name="batchAmountPaid"
                                                        min="0"
                                                        max={totalBatchValue}
                                                        step="0.01"
                                                        value={batchAmountPaid}
                                                        onChange={handleBatchAmountPaidChange}
                                                        className={`form-control ${batchPaymentError ? "is-invalid" : ""}`}
                                                        placeholder="0.00"
                                                        autoComplete="off"
                                                    />
                                                </div>
                                                {batchPaymentError ? (
                                                    <FormError message={batchPaymentError} />
                                                ) : (
                                                    <div className="text-muted mt-1" style={{ fontSize: "0.72rem" }}>
                                                        <span>Combined batch payment</span>
                                                    </div>
                                                )}
                                            </div>

                                            {/* 3. Remaining Payment */}
                                            <div className="col-12 col-md-4">
                                                <label className="form-label small fw-semibold text-secondary mb-1 d-block text-nowrap">
                                                    Remaining Payment
                                                </label>
                                                <div className="input-group input-group-sm">
                                                    <span className="input-group-text bg-white fw-semibold small text-secondary px-2">
                                                        PKR
                                                    </span>
                                                    <div
                                                        className={`form-control fw-bold d-flex align-items-center justify-content-between ${batchRemainingPayment > 0
                                                                ? "bg-danger-subtle text-danger border-danger-subtle"
                                                                : "bg-success-subtle text-success border-success-subtle"
                                                            }`}
                                                        style={{ userSelect: "none" }}
                                                    >
                                                        <span>{batchRemainingPayment.toLocaleString()}</span>
                                                        <span
                                                            className={`badge text-uppercase px-1 py-0 ${batchRemainingPayment <= 0 ? "badge-status-paid" : "badge-status-due"
                                                                }`}
                                                            style={{ fontSize: "0.62rem" }}
                                                        >
                                                            {batchRemainingPayment <= 0 ? "Settled" : "Due"}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="text-muted mt-1" style={{ fontSize: "0.72rem" }}>
                                                    <span>
                                                        {batchRemainingPayment > 0
                                                            ? "Outstanding accounts payable"
                                                            : "All suppliers fully settled"}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="card border shadow-sm rounded-3">
                                <div className="card-header bg-white border-bottom py-2 px-3 d-flex justify-content-between align-items-center">
                                    <div className="d-flex align-items-center gap-2">
                                        <div className="d-inline-flex p-1 rounded-2 bg-dark text-white">
                                            <FiLayers size={15} />
                                        </div>
                                        <span className="fw-semibold text-dark small">
                                            3. Stock Record
                                        </span>
                                    </div>

                                </div>

                                <div className="card-body p-3">
                                    <div className="row g-2 mb-3 align-items-stretch">
                                        <div className="col-6 col-md-3 d-flex">
                                            <div className="pos-metric-card pos-metric-units w-100 h-100 d-flex flex-column justify-content-between">
                                                <span
                                                    className="d-flex align-items-start text-secondary small mb-1"
                                                    style={{ fontSize: "0.72rem", minHeight: "32px", lineHeight: "1.25" }}
                                                >
                                                    Total Units
                                                </span>
                                                <strong className="h6 fw-bold text-dark mb-0 mt-auto">
                                                    {totalCumulativeQuantity}
                                                </strong>
                                            </div>
                                        </div>
                                        <div className="col-6 col-md-3 d-flex">
                                            <div className="pos-metric-card pos-metric-units w-100 h-100 d-flex flex-column justify-content-between">
                                                <span
                                                    className="d-flex align-items-start text-secondary small mb-1"
                                                    style={{ fontSize: "0.72rem", minHeight: "32px", lineHeight: "1.25" }}
                                                >
                                                    Total Batch Value
                                                </span>
                                                <strong
                                                    className="h6 fw-bold text-dark mb-0 mt-auto"
                                                    title={formatFullAmount(totalBatchValue)}
                                                >
                                                    {formatUnit(totalBatchValue)}
                                                </strong>
                                            </div>
                                        </div>
                                        <div className="col-6 col-md-3 d-flex">
                                            <div className="pos-metric-card pos-metric-units w-100 h-100 d-flex flex-column justify-content-between">
                                                <span
                                                    className="d-flex align-items-start text-secondary small mb-1"
                                                    style={{ fontSize: "0.72rem", minHeight: "32px", lineHeight: "1.25" }}
                                                >
                                                    Cash Paid
                                                </span>
                                                <strong
                                                    className="h6 fw-bold text-dark mb-0 mt-auto"
                                                    title={formatFullAmount(totalCashDisbursed)}
                                                >
                                                    {formatUnit(totalCashDisbursed)}
                                                </strong>
                                            </div>
                                        </div>
                                        <div className="col-6 col-md-3 d-flex">
                                            <div className="pos-metric-card pos-metric-units w-100 h-100 d-flex flex-column justify-content-between">
                                                <span
                                                    className="d-flex align-items-start text-secondary small mb-1"
                                                    style={{ fontSize: "0.72rem", minHeight: "32px", lineHeight: "1.25" }}
                                                >
                                                    {totalOutstandingDue > 0 ? "Remaining Amount (Due)" : "Remaining Amount (Settled)"}
                                                </span>
                                                <strong
                                                    className="h6 fw-bold text-dark mb-0 mt-auto"
                                                    title={formatFullAmount(totalOutstandingDue)}
                                                >
                                                    {formatUnit(totalOutstandingDue)}
                                                </strong>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="border rounded-2 mb-3 overflow-hidden">
                                        <button
                                            type="button"
                                            className="btn btn-light w-100 py-2 px-3 text-start d-flex justify-content-between align-items-center border-0 rounded-0"
                                            style={{ fontSize: "0.78rem" }}
                                            onClick={() => setIsDebtBreakdownOpen((prev) => !prev)}
                                        >
                                            <span className="fw-bold text-dark d-flex align-items-center gap-1">
                                                <span>Supplier-wise Unpaid Balance Summary ({supplierBreakdown.length})</span>
                                            </span>
                                            {isDebtBreakdownOpen ? <FiChevronUp size={14} /> : <FiChevronDown size={14} />}
                                        </button>

                                        {isDebtBreakdownOpen && (
                                            <div className="table-responsive">
                                                <table className="table table-sm table-hover mb-0" style={{ fontSize: "0.75rem" }}>
                                                    <thead className="table-light">
                                                        <tr>
                                                            <th>Supplier Name</th>
                                                            <th className="text-center">Items</th>
                                                            <th className="text-end">Total Bill</th>
                                                            <th className="text-end">Amount Paid</th>
                                                            <th className="text-end">Balance Due</th>
                                                            {/* <th className="text-center">Status</th> */}
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {supplierBreakdown.length === 0 ? (
                                                            <tr>
                                                                <td colSpan={6} className="text-center text-secondary py-3">
                                                                    No suppliers added to this session yet.
                                                                </td>
                                                            </tr>
                                                        ) : (
                                                            supplierBreakdown.map((s, idx) => (
                                                                <tr key={idx}>
                                                                    <td className="fw-semibold text-dark">
                                                                        <FiUser size={11} className="me-1 text-secondary" />
                                                                        {s.name}
                                                                    </td>
                                                                    <td className="text-center text-secondary">
                                                                        {s.itemCount} ({s.unitsCount} pcs)
                                                                    </td>
                                                                    <td className="text-end fw-semibold">
                                                                        Rs. {s.totalValue.toLocaleString()}
                                                                    </td>
                                                                    <td className="text-end text-success fw-semibold">
                                                                        Rs. {s.paid.toLocaleString()}
                                                                    </td>
                                                                    <td className="text-end fw-bold">
                                                                        {s.due > 0 ? (
                                                                            <span className="text-danger">
                                                                                Rs. {s.due.toLocaleString()}
                                                                            </span>
                                                                        ) : (
                                                                            <span className="text-muted">Rs. 0</span>
                                                                        )}
                                                                    </td>
                                                                    {/* <td className="text-center">
                                                                <span
                                                                    className={`badge px-2 py-0 ${
                                                                        s.due <= 0
                                                                            ? "badge-status-paid"
                                                                            : s.paid > 0
                                                                            ? "badge-status-partial"
                                                                            : "badge-status-due"
                                                                    }`}
                                                                    style={{ fontSize: "0.62rem" }}
                                                                >
                                                                    {s.due <= 0
                                                                        ? "SETTLED"
                                                                        : s.paid > 0
                                                                        ? "PARTIAL"
                                                                        : "DUE"}
                                                                </span>
                                                            </td> */}
                                                                </tr>
                                                            ))
                                                        )}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>

                                    <div className="d-flex flex-column flex-sm-row gap-2">
                                        <button
                                            type="button"
                                            className="btn btn-outline-dark flex-grow-1 py-2 d-inline-flex justify-content-center align-items-center gap-2 shadow-sm fw-semibold"
                                            disabled={stagedItems.length === 0 || isSubmitting}
                                            onClick={() => handleFinalBatchSubmit(false)}
                                            title="Save stock batch to database"
                                        >
                                            <FiSave size={16} />
                                            <span>Save All</span>
                                        </button>

                                        <button
                                            type="button"
                                            className="btn btn-dark flex-grow-1 py-2 d-inline-flex justify-content-center align-items-center gap-2 shadow fw-semibold pos-submit-btn"
                                            disabled={stagedItems.length === 0 || isSubmitting}
                                            onClick={() => handleFinalBatchSubmit(true)}
                                            title="Save stock batch and immediately generate receipt"
                                        >
                                            {isSubmitting ? (
                                                <>
                                                    <span className="spinner-border spinner-border-sm" role="status" />
                                                    <span>Saving Batch...</span>
                                                </>
                                            ) : (
                                                <>
                                                    <FiPrinter size={16} />
                                                    <span>Save & Make Receipt</span>
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Multi-Item Sale Receipt Modal */}
            {completedSaleData && (
                <SaleReceiptModal
                    receipt={completedSaleData}
                    onClose={() => setCompletedSaleData(null)}
                />
            )}

            {/* Stock Intake Receipt Modal */}
            {completedStockBatchReceipt && (
                <StockReceiptModal
                    receiptData={completedStockBatchReceipt}
                    onClose={() => setCompletedStockBatchReceipt(null)}
                />
            )}
        </div>
    );
};

export default AddStock;