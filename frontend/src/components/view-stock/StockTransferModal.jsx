import React, { useState, useEffect } from "react";
import {
  FiX,
  FiArrowRight,
  FiAlertCircle,
  FiCheckCircle,
  FiPackage,
  FiArchive,
  FiHash,
  FiDollarSign,
  FiLayers,
} from "react-icons/fi";
import api from "../../api/axios";
import { formatFullAmount } from "../../utils/unitChanger";
import Swal from "sweetalert2";

export default function StockTransferModal({
  isOpen,
  onClose,
  item,
  sourceLocation = "shop",
  destinationLocation = "warehouse",
  onSuccess,
}) {
  const [transferQty, setTransferQty] = useState(1);
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const isToWarehouse = destinationLocation.toLowerCase() === "warehouse";
  const sourceLabel = sourceLocation.toLowerCase() === "warehouse" ? "Warehouse" : "Shop";
  const destLabel = destinationLocation.toLowerCase() === "warehouse" ? "Warehouse" : "Shop";

  useEffect(() => {
    if (isOpen && item) {
      setTransferQty(1);
      setNotes("");
      setErrorMessage("");
      setIsSubmitting(false);
    }
  }, [isOpen, item]);

  if (!isOpen || !item) return null;

  const availableQty = Number(item.quantity || 0);
  const unitCost = Number(item.unitPrice || 0);
  const parsedQty = parseInt(transferQty, 10) || 0;
  const totalCost = Number((parsedQty * unitCost).toFixed(2));

  const validate = () => {
    if (isNaN(parsedQty) || parsedQty <= 0) {
      setErrorMessage("Transfer quantity must be greater than zero.");
      return false;
    }
    if (parsedQty > availableQty) {
      setErrorMessage(
        `Quantity cannot exceed the available ${sourceLabel.toLowerCase()} stock (${availableQty} units).`
      );
      return false;
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate() || isSubmitting) return;

    try {
      setIsSubmitting(true);
      setErrorMessage("");

      const payload = {
        stockId: item._id,
        barcode: item.barcode && item.barcode !== "N/A" ? item.barcode : undefined,
        quantity: parsedQty,
        sourceLocation: sourceLocation.toLowerCase(),
        destinationLocation: destinationLocation.toLowerCase(),
        notes: notes ? notes.trim() : "",
      };

      const res = await api.post("/stock/transfer", payload);

      if (res.data?.success) {
        await Swal.fire({
          icon: "success",
          title: "Transfer Complete",
          text: `Successfully moved ${parsedQty} unit(s) of "${item.productName}" from ${sourceLabel} to ${destLabel}.`,
          confirmButtonColor: "#09090b",
          timer: 2500,
          timerProgressBar: true,
        });

        if (onSuccess) {
          onSuccess();
        }
        onClose();
      } else {
        setErrorMessage(res.data?.message || "Failed to transfer stock.");
      }
    } catch (err) {
      console.error("Stock transfer error:", err);
      const errMsg =
        err.response?.data?.message ||
        err.message ||
        "An unexpected error occurred during transfer.";
      setErrorMessage(errMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="modal show d-block"
      tabIndex="-1"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.55)", zIndex: 1055 }}
      onClick={onClose}
    >
      <div
        className="modal-dialog modal-dialog-centered my-3"
        style={{ maxWidth: "480px", maxHeight: "calc(100vh - 2rem)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-content border-0 shadow-lg rounded-3 overflow-hidden" style={{ maxHeight: "calc(100vh - 2rem)", display: "flex", flexDirection: "column" }}>
          {/* Header */}
          <div className="modal-header bg-dark text-white py-2 px-3 d-flex justify-content-between align-items-center flex-shrink-0">
            <div className="d-flex align-items-center gap-2">
              <div className="p-2 rounded-2 bg-white bg-opacity-10 text-white">
                {isToWarehouse ? <FiArchive size={16} /> : <FiPackage size={16} />}
              </div>
              <div>
                <h6 className="modal-title fw-bold mb-0" style={{ fontSize: "0.95rem" }}>
                  {isToWarehouse ? "Move to Warehouse" : "Move to Shop"}
                </h6>
                <small className="text-white-50" style={{ fontSize: "0.7rem" }}>
                  Internal Stock Movement
                </small>
              </div>
            </div>
            <button
              type="button"
              className="btn-close btn-close-white"
              onClick={onClose}
              disabled={isSubmitting}
              aria-label="Close"
            />
          </div>

          {/* Body */}
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
            <div className="modal-body p-3" style={{ overflowY: "auto" }}>
              {/* Transfer Direction Banner */}
              <div className="card bg-light border-0 rounded-2 p-2 mb-2">
                <div className="d-flex align-items-center justify-content-between">
                  <div className="d-flex align-items-center gap-2">
                    <span className="badge bg-secondary-subtle text-secondary-emphasis px-2 py-1" style={{ fontSize: "0.7rem" }}>
                      Source
                    </span>
                    <strong className="text-dark small">{sourceLabel}</strong>
                  </div>
                  <div className="p-1 rounded-circle bg-white shadow-sm text-secondary d-flex align-items-center justify-content-center">
                    <FiArrowRight size={12} />
                  </div>
                  <div className="d-flex align-items-center gap-2">
                    <span className="badge bg-primary-subtle text-primary-emphasis px-2 py-1" style={{ fontSize: "0.7rem" }}>
                      Destination
                    </span>
                    <strong className="text-dark small">{destLabel}</strong>
                  </div>
                </div>
              </div>

              {/* Product Info Card */}
              <div className="border rounded-2 p-3 mb-2 bg-white">
                <div className="d-flex justify-content-between align-items-start pb-2 mb-2 border-bottom">
                  <div className="me-2 text-truncate">
                    <span className="text-muted d-block" style={{ fontSize: "0.7rem" }}>
                      Product Name
                    </span>
                    <span className="fw-bold text-dark text-truncate d-block" style={{ fontSize: "0.95rem" }}>
                      {item.productName}
                    </span>
                  </div>
                  <div className="text-end flex-shrink-0">
                    <span className="text-muted d-block" style={{ fontSize: "0.7rem" }}>
                      Available in {sourceLabel}
                    </span>
                    <span className="badge bg-dark text-white px-2 py-1" style={{ fontSize: "0.75rem" }}>
                      {availableQty} units
                    </span>
                  </div>
                </div>

                <div className="row g-2 align-items-center">
                  <div className="col-4">
                    <span className="text-muted d-block" style={{ fontSize: "0.7rem" }}>
                      Barcode
                    </span>
                    <span className="font-monospace text-secondary text-truncate d-block" style={{ fontSize: "0.75rem" }}>
                      {item.barcode && item.barcode !== "N/A" ? item.barcode : "Batch / Catalog"}
                    </span>
                  </div>
                  <div className="col-4 text-center">
                    <span className="text-muted d-block" style={{ fontSize: "0.7rem" }}>
                      Unit Cost
                    </span>
                    <span className="fw-semibold text-dark font-monospace" style={{ fontSize: "0.8rem" }}>
                      {formatFullAmount(unitCost)}
                    </span>
                  </div>
                  <div className="col-4 text-end">
                    <span className="text-muted d-block" style={{ fontSize: "0.7rem" }}>
                      Total Cost
                    </span>
                    <span className="fw-bold text-primary font-monospace" style={{ fontSize: "0.85rem" }}>
                      {formatFullAmount(totalCost)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Quantity Stepper Input */}
              <div className="mb-2">
                <label className="form-label fw-bold text-dark mb-1" style={{ fontSize: "0.92rem" }}>
                  Quantity <span className="text-danger">*</span>
                </label>
                <div
                  className="d-flex align-items-center bg-white rounded-2"
                  style={{
                    border: "1.5px solid #475569",
                    height: "40px",
                    overflow: "hidden",
                  }}
                >
                  <button
                    type="button"
                    className="btn btn-link text-decoration-none text-dark d-flex align-items-center justify-content-center p-0 m-0"
                    style={{
                      width: "44px",
                      height: "100%",
                      borderRight: "1.5px solid #475569",
                      borderRadius: 0,
                      fontSize: "1.15rem",
                      fontWeight: "400",
                      color: "#1e293b",
                      userSelect: "none",
                    }}
                    onClick={() => {
                      const cur = parseInt(transferQty, 10) || 1;
                      if (cur > 1) {
                        setTransferQty(cur - 1);
                        setErrorMessage("");
                      }
                    }}
                    disabled={isSubmitting || (parseInt(transferQty, 10) || 1) <= 1}
                  >
                    -
                  </button>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    className="form-control border-0 text-center shadow-none p-0 m-0 fw-semibold"
                    style={{
                      flex: 1,
                      fontSize: "1.1rem",
                      height: "100%",
                      backgroundColor: "transparent",
                      color: "#0f172a",
                    }}
                    value={transferQty}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, "");
                      setTransferQty(val === "" ? "" : Math.min(availableQty, parseInt(val, 10) || 0));
                      setErrorMessage("");
                    }}
                    onBlur={() => {
                      if (!transferQty || parseInt(transferQty, 10) <= 0) {
                        setTransferQty(1);
                      }
                    }}
                    required
                    disabled={isSubmitting}
                  />
                  <button
                    type="button"
                    className="btn btn-link text-decoration-none text-dark d-flex align-items-center justify-content-center p-0 m-0"
                    style={{
                      width: "44px",
                      height: "100%",
                      borderLeft: "1.5px solid #475569",
                      borderRadius: 0,
                      fontSize: "1.15rem",
                      fontWeight: "400",
                      color: "#1e293b",
                      userSelect: "none",
                    }}
                    onClick={() => {
                      const cur = parseInt(transferQty, 10) || 0;
                      if (cur < availableQty) {
                        setTransferQty(cur + 1);
                        setErrorMessage("");
                      }
                    }}
                    disabled={isSubmitting || (parseInt(transferQty, 10) || 0) >= availableQty}
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Non-accounting internal transfer notice */}
              <div className="alert alert-light border small text-muted p-2 mb-0" style={{ fontSize: "0.72rem", lineHeight: "1.3" }}>
                <FiAlertCircle className="me-1 text-secondary" size={13} />
                Internal movement only. Does not alter financial ledgers, cash drawers, or supplier balances. Total company inventory value remains invariant.
              </div>

              {/* Error Message */}
              {errorMessage && (
                <div className="alert alert-danger p-2 mt-2 small mb-0 d-flex align-items-center gap-2" style={{ fontSize: "0.75rem" }}>
                  <FiAlertCircle className="flex-shrink-0" size={14} />
                  <span>{errorMessage}</span>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="modal-footer bg-light px-3 py-2 d-flex justify-content-end gap-2 border-top flex-shrink-0">
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm px-3"
                onClick={onClose}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-dark btn-sm px-4 d-flex align-items-center gap-2"
                disabled={isSubmitting || availableQty <= 0}
              >
                {isSubmitting ? (
                  <>
                    <span
                      className="spinner-border spinner-border-sm"
                      role="status"
                      aria-hidden="true"
                    />
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <FiCheckCircle size={14} />
                    <span>Confirm Transfer</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
