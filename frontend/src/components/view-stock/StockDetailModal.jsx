import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  FiX,
  FiBox,
  FiCopy,
  FiCheck,
  FiSearch,
} from "react-icons/fi";
import api from "../../api/axios";

export default function StockDetailModal({ stock, onClose }) {
  if (!stock) return null;

  const isBatch = Boolean(stock.isBatch || (stock.items && stock.items.length > 0));

  const [searchFilter, setSearchFilter] = useState("");
  const [copiedBarcode, setCopiedBarcode] = useState(null);
  const [liveUnits, setLiveUnits] = useState(null);
  const [isLoadingLiveUnits, setIsLoadingLiveUnits] = useState(false);

  // Fetch live barcodes from API for single-product records
  useEffect(() => {
    if (!stock?._id || isBatch) return;
    let isMounted = true;
    setIsLoadingLiveUnits(true);

    api
      .get(`/stock/${stock._id}/barcodes`)
      .then((res) => {
        if (isMounted && res.data?.success && res.data.data?.units) {
          setLiveUnits(res.data.data.units);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (isMounted) setIsLoadingLiveUnits(false);
      });

    return () => {
      isMounted = false;
    };
  }, [stock?._id, isBatch]);

  // Build authoritative 1 row per physical item list (phone in table, iemi, available/sold)
  const allRows = useMemo(() => {
    const rows = [];

    // 1. Prefer liveUnits or stock.serializedUnits
    const rawUnits =
      Array.isArray(liveUnits) && liveUnits.length > 0
        ? liveUnits
        : Array.isArray(stock.serializedUnits) && stock.serializedUnits.length > 0
        ? stock.serializedUnits
        : [];
    const units = rawUnits;

    if (units.length > 0) {
      units.forEach((u, idx) => {
        rows.push({
          id: u._id || `${u.barcode || idx}-${idx}`,
          productName: u.productName || stock.productName || "Product",
          storage: u.storage || stock.storage || "",
          color: u.color || stock.color || "",
          barcode: u.barcode && u.barcode.toUpperCase() !== "N/A" ? u.barcode : "-",
          status: u.status || (stock.quantity > 0 ? "available" : "sold"),
          shopkeeperName: u.shopkeeperName || null,
          isLocalPurchase: Boolean(u.isLocalPurchase ?? stock.isLocalPurchase),
        });
      });
      return rows;
    }

    // 2. Barcodes array
    if (Array.isArray(stock.barcodes) && stock.barcodes.length > 0) {
      stock.barcodes.forEach((bc, idx) => {
        if (!bc || bc.toUpperCase() === "N/A") return;
        rows.push({
          id: `${bc}-${idx}`,
          productName: stock.productName || "Product",
          storage: stock.storage || "",
          color: stock.color || "",
          barcode: bc,
          status: "available",
          isLocalPurchase: Boolean(stock.isLocalPurchase),
        });
      });
      if (rows.length > 0) return rows;
    }

    // 3. Batch itemsSummary
    if (isBatch && Array.isArray(stock.items) && stock.items.length > 0) {
      stock.items.forEach((item, itemIdx) => {
        const itemBarcodes = Array.isArray(item.barcodes)
          ? item.barcodes.filter((b) => b && b.toUpperCase() !== "N/A")
          : [];
        if (itemBarcodes.length > 0) {
          itemBarcodes.forEach((bc, bIdx) => {
            rows.push({
              id: `${item.productName}-${bc}-${bIdx}`,
              productName: item.productName || stock.productName || "Product",
              storage: item.storage || stock.storage || "",
              color: item.color || stock.color || "",
              barcode: bc,
              status: "available",
              isLocalPurchase: Boolean(stock.isLocalPurchase),
            });
          });
        } else {
          const qty = item.quantity || 1;
          for (let q = 0; q < qty; q++) {
            rows.push({
              id: `${item.productName || itemIdx}-${q}`,
              productName: item.productName || stock.productName || "Product",
              storage: item.storage || stock.storage || "",
              color: item.color || stock.color || "",
              barcode: "-",
              status: "available",
              isLocalPurchase: Boolean(stock.isLocalPurchase),
            });
          }
        }
      });
      if (rows.length > 0) return rows;
    }

    // 4. Single product fallback
    const bc = stock.barcode && stock.barcode.toUpperCase() !== "N/A" ? stock.barcode : "-";
    const qty = stock.quantity || 1;
    if (bc !== "-") {
      rows.push({
        id: stock._id || "single",
        productName: stock.productName || "Product",
        storage: stock.storage || "",
        color: stock.color || "",
        barcode: bc,
        status: stock.quantity > 0 ? "available" : "sold",
        isLocalPurchase: Boolean(stock.isLocalPurchase),
      });
    } else {
      for (let q = 0; q < qty; q++) {
        rows.push({
          id: `${stock._id || "single"}-${q}`,
          productName: stock.productName || "Product",
          storage: stock.storage || "",
          color: stock.color || "",
          barcode: "-",
          status: stock.quantity > 0 ? "available" : "sold",
          isLocalPurchase: Boolean(stock.isLocalPurchase),
        });
      }
    }

    return rows;
  }, [stock, liveUnits, isBatch]);

  // Filter rows by search
  const filteredRows = useMemo(() => {
    if (!searchFilter.trim()) return allRows;
    const q = searchFilter.trim().toLowerCase();
    return allRows.filter(
      (r) =>
        r.productName.toLowerCase().includes(q) ||
        (r.barcode && r.barcode.toLowerCase().includes(q)) ||
        (r.status && r.status.toLowerCase().includes(q))
    );
  }, [allRows, searchFilter]);

  const handleCopyBarcode = (bc) => {
    if (!bc || bc === "-") return;
    navigator.clipboard?.writeText(bc);
    setCopiedBarcode(bc);
    setTimeout(() => {
      setCopiedBarcode((prev) => (prev === bc ? null : prev));
    }, 1500);
  };

  return createPortal(
    <div className="pos-modal-backdrop" onClick={onClose}>
      <div
        className="pos-modal-dialog"
        style={{ maxWidth: "620px", width: "95%" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header border-bottom py-2.5 px-3 bg-light d-flex justify-content-between align-items-center">
          <div className="d-flex align-items-center gap-2">
            <FiBox size={16} className="text-dark" />
            <h6 className="modal-title fw-bold text-dark mb-0">
              {isBatch
                ? stock.invoiceNumber
                  ? `Batch Intake (${stock.invoiceNumber})`
                  : "Batch Intake Details"
                : `Stock Details - ${stock.productName || "Product"}`}
            </h6>
          </div>
          <button type="button" className="btn-close" onClick={onClose} aria-label="Close" />
        </div>

        {/* Body: Clean Table with 1 row per physical item (Product Name, IEMI, Status) */}
        <div className="modal-body p-3 pos-modal-body-scroll">
          {/* Search bar if > 4 items */}
          {allRows.length > 4 && (
            <div className="input-group input-group-sm mb-2.5">
              <span className="input-group-text bg-white text-secondary py-1 border-end-0">
                <FiSearch size={12} />
              </span>
              <input
                type="text"
                className="form-control form-control-sm py-1 border-start-0"
                placeholder="Search phone or IEMI..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                style={{ fontSize: "0.78rem" }}
              />
              {searchFilter && (
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm py-1"
                  onClick={() => setSearchFilter("")}
                >
                  <FiX size={12} />
                </button>
              )}
            </div>
          )}

          {/* Products in this Batch Table */}
          <div className="card border rounded-2 overflow-hidden shadow-sm">
            <div className="card-header bg-light py-2 px-3 d-flex justify-content-between align-items-center border-bottom flex-wrap gap-2">
              <span className="small fw-bold text-dark d-flex align-items-center gap-1.5">
                <FiBox size={14} className="text-secondary" />
                {isBatch
                  ? `Products in this Batch (${allRows.length})`
                  : `Serialized Units (${allRows.length})`}
              </span>
              <div className="d-flex align-items-center gap-1.5 flex-wrap">
                <span className="badge bg-success-subtle text-success border border-success-subtle" style={{ fontSize: "0.68rem" }}>
                  {allRows.filter((r) => String(r.status || "").toLowerCase() === "available").length} Available
                </span>
                {allRows.some((r) => String(r.status || "").toLowerCase() === "transferred") && (
                  <span className="badge bg-primary-subtle text-primary border border-primary-subtle" style={{ fontSize: "0.68rem" }}>
                    {allRows.filter((r) => String(r.status || "").toLowerCase() === "transferred").length} Transferred
                  </span>
                )}
                {allRows.some((r) => String(r.status || "").toLowerCase() === "sold") && (
                  <span className="badge bg-secondary-subtle text-secondary border" style={{ fontSize: "0.68rem" }}>
                    {allRows.filter((r) => String(r.status || "").toLowerCase() === "sold").length} Sold
                  </span>
                )}
                {isLoadingLiveUnits && (
                  <span className="badge bg-secondary-subtle text-secondary py-0.5 px-1.5" style={{ fontSize: "0.68rem" }}>
                    Refreshing...
                  </span>
                )}
              </div>
            </div>

            <div className="table-responsive" style={{ maxHeight: "400px" }}>
              <table className="table table-sm table-bordered align-middle mb-0" style={{ fontSize: "0.8rem" }}>
                <thead className="table-light">
                  <tr>
                    <th style={{ width: "42%" }} className="ps-3 py-2">
                      Product Name
                    </th>
                    <th style={{ width: "38%" }} className="py-2">
                      IEMI
                    </th>
                    <th className="text-center py-2" style={{ width: "20%" }}>
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="text-center py-4 text-muted small">
                        {searchFilter ? "No matching phone or IEMI found." : "No items found in this record."}
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map((row) => {
                      const isAvail = String(row.status || "").toLowerCase() === "available";
                      const isCopied = copiedBarcode === row.barcode;

                      return (
                        <tr key={row.id}>
                          {/* Product Name */}
                          <td className="ps-3 py-2 fw-semibold text-dark">
                            <div className="d-flex align-items-center gap-1.5 flex-wrap">
                              <span>{row.productName}</span>
                              {(row.storage || row.color) && (
                                <span
                                  className="badge bg-secondary-subtle text-dark border"
                                  style={{ fontSize: "0.62rem", padding: "1px 4px", fontWeight: "600" }}
                                >
                                  {[row.storage, row.color].filter(Boolean).join(" • ")}
                                </span>
                              )}
                              {row.isLocalPurchase && (
                                <span
                                  className="badge bg-danger-subtle text-danger border border-danger-subtle"
                                  style={{ fontSize: "0.62rem", padding: "1px 4px", fontWeight: "600" }}
                                >
                                  Local
                                </span>
                              )}
                            </div>
                          </td>

                          {/* IEMI Number */}
                          <td className="py-2">
                            {row.barcode && row.barcode !== "-" ? (
                              <div className="d-flex align-items-center justify-content-between gap-1 pe-2">
                                <span
                                  className="font-monospace fw-semibold text-dark user-select-all"
                                  style={{ fontSize: "0.82rem" }}
                                >
                                  {row.barcode}
                                </span>
                                <button
                                  type="button"
                                  className="btn btn-sm btn-link p-0 text-secondary d-inline-flex align-items-center justify-content-center"
                                  onClick={() => handleCopyBarcode(row.barcode)}
                                  title="Copy IEMI number"
                                  style={{ width: "22px", height: "22px" }}
                                >
                                  {isCopied ? (
                                    <FiCheck size={13} className="text-success" />
                                  ) : (
                                    <FiCopy size={12} />
                                  )}
                                </button>
                              </div>
                            ) : (
                              <span className="text-muted font-monospace">-</span>
                            )}
                          </td>

                          {/* Status Badge */}
                          <td className="text-center py-2">
                            {(() => {
                              const st = String(row.status || "").toLowerCase();
                              if (st === "available") {
                                return (
                                  <span
                                    className="badge bg-success-subtle text-success border border-success-subtle rounded-pill px-2.5 py-1"
                                    style={{ fontSize: "0.7rem", fontWeight: "600" }}
                                  >
                                    Available
                                  </span>
                                );
                              }
                              if (st === "transferred") {
                                return (
                                  <span
                                    className="badge bg-primary-subtle text-primary border border-primary-subtle rounded-pill px-2.5 py-1"
                                    style={{ fontSize: "0.7rem", fontWeight: "600" }}
                                    title={row.shopkeeperName ? `Transferred to ${row.shopkeeperName}` : "Transferred to another shopkeeper"}
                                  >
                                    Transferred{row.shopkeeperName ? ` (${row.shopkeeperName})` : ""}
                                  </span>
                                );
                              }
                              if (st === "sold") {
                                return (
                                  <span
                                    className="badge bg-secondary-subtle text-secondary border rounded-pill px-2.5 py-1"
                                    style={{ fontSize: "0.7rem", fontWeight: "600" }}
                                  >
                                    Sold
                                  </span>
                                );
                              }
                              return (
                                <span
                                  className="badge bg-light text-dark border rounded-pill px-2.5 py-1 text-capitalize"
                                  style={{ fontSize: "0.7rem", fontWeight: "600" }}
                                >
                                  {row.status}
                                </span>
                              );
                            })()}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="modal-footer border-top py-2.5 px-3 bg-light d-flex justify-content-end">
          <button type="button" className="btn btn-secondary btn-sm px-4" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
