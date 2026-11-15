import React, { useState, useEffect } from "react";
import { FiX, FiCheck, FiMinus, FiPlus, FiRotateCcw, FiAlertCircle } from "react-icons/fi";
import Swal from "sweetalert2";
import api from "../../api/axios";

export default function ReturnStockModal({
  isOpen,
  onClose,
  transfer,
  onReturnSuccess,
}) {
  const [quantity, setQuantity] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const maxReturnable = transfer?.remainingQuantity || 0;

  useEffect(() => {
    if (transfer) {
      setQuantity(1);
      setError("");
      setIsSubmitting(false);
    }
  }, [transfer]);

  if (!isOpen || !transfer) return null;

  const handleDecrement = () => {
    setQuantity((prev) => Math.max(1, prev - 1));
  };

  const handleIncrement = () => {
    setQuantity((prev) => Math.min(maxReturnable, prev + 1));
  };

  const handleQuantityChange = (e) => {
    const val = parseInt(e.target.value, 10);
    if (isNaN(val)) {
      setQuantity(1);
    } else {
      setQuantity(Math.max(1, Math.min(maxReturnable, val)));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (quantity <= 0 || quantity > maxReturnable) {
      setError(`Quantity must be between 1 and ${maxReturnable}.`);
      return;
    }

    try {
      setIsSubmitting(true);
      setError("");

      const res = await api.post(`/shopkeepers/transfers/${transfer._id}/return`, {
        quantity,
        returnDate: new Date(),
      });

      if (res.data?.success) {
        Swal.fire({
          icon: "success",
          title: "Stock Returned!",
          text: `${quantity} unit(s) of "${transfer.productName}" added back to available shop inventory.`,
          confirmButtonColor: "#09090b",
          timer: 3000,
          timerProgressBar: true,
        });

        if (onReturnSuccess) {
          onReturnSuccess(res.data.data);
        }
        onClose();
      }
    } catch (err) {
      console.error("Return failed:", err);
      const msg = err.response?.data?.message || "Failed to process stock return.";
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="modal fade show d-block"
      style={{ backgroundColor: "rgba(0,0,0,0.55)", zIndex: 1065 }}
      tabIndex="-1"
      role="dialog"
      onClick={onClose}
    >
      <div
        className="modal-dialog modal-dialog-centered"
        style={{ maxWidth: "460px" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-content border-0 shadow-lg rounded-3 overflow-hidden">
          {/* Header */}
          <div className="modal-header bg-dark text-white py-2 px-3">
            <div className="d-flex align-items-center gap-2">
              <FiRotateCcw size={16} />
              <h6 className="modal-title fw-semibold mb-0" style={{ fontSize: "0.92rem" }}>
                Return Stock to Shop
              </h6>
            </div>
            <button
              type="button"
              className="btn-close btn-close-white"
              onClick={onClose}
              disabled={isSubmitting}
            />
          </div>

          <form onSubmit={handleSubmit}>
            <div className="modal-body p-3">
              {error && (
                <div className="alert alert-danger py-2 px-3 small d-flex align-items-center gap-2 mb-3">
                  <FiAlertCircle size={15} className="flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Info Card */}
              <div className="p-3 bg-light rounded-2 border mb-3">
                <div className="d-flex justify-content-between mb-2" style={{ fontSize: "0.78rem" }}>
                  <span className="text-secondary">Shopkeeper:</span>
                  <strong className="text-dark">{transfer.shopkeeperName}</strong>
                </div>
                <div className="d-flex justify-content-between mb-2" style={{ fontSize: "0.78rem" }}>
                  <span className="text-secondary">Product:</span>
                  <strong className="text-dark text-truncate" style={{ maxWidth: "240px" }} title={transfer.productName}>
                    {transfer.productName}
                  </strong>
                </div>
                <div className="d-flex justify-content-between pt-2 border-top" style={{ fontSize: "0.78rem" }}>
                  <span className="text-secondary">Remaining with Shopkeeper:</span>
                  <span className="badge bg-dark text-white">{maxReturnable} units</span>
                </div>
              </div>

              {/* Quantity to Return */}
              <div className="mb-3">
                <label className="form-label small fw-semibold text-dark mb-1" style={{ fontSize: "0.78rem" }}>
                  Quantity to Return <span className="text-danger">*</span>
                </label>
                <div className="input-group w-100" style={{ height: "40px" }}>
                  <button
                    type="button"
                    className="btn btn-outline-secondary px-3 d-flex align-items-center justify-content-center"
                    onClick={handleDecrement}
                    disabled={quantity <= 1 || isSubmitting}
                    style={{ minWidth: "50px", height: "100%" }}
                  >
                    <FiMinus size={16} />
                  </button>
                  <input
                    type="number"
                    min="1"
                    max={maxReturnable}
                    value={quantity}
                    onChange={handleQuantityChange}
                    className="form-control text-center fw-bold fs-6"
                    disabled={isSubmitting}
                    style={{ height: "100%" }}
                  />
                  <button
                    type="button"
                    className="btn btn-outline-secondary px-3 d-flex align-items-center justify-content-center"
                    onClick={handleIncrement}
                    disabled={quantity >= maxReturnable || isSubmitting}
                    style={{ minWidth: "50px", height: "100%" }}
                  >
                    <FiPlus size={16} />
                  </button>
                </div>
                <div className="form-text text-muted small mt-1" style={{ fontSize: "0.7rem" }}>
                  Returning stock adds items back to available inventory. No sale or revenue is recorded.
                </div>
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="modal-footer bg-light py-2 px-3 d-flex justify-content-end gap-2">
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary px-3 py-2"
                onClick={onClose}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-sm btn-dark px-3 py-2 d-flex align-items-center gap-2"
                disabled={isSubmitting || maxReturnable <= 0}
              >
                {isSubmitting ? (
                  <>
                    <span className="spinner-border spinner-border-sm" role="status" style={{ width: "12px", height: "12px" }} />
                    <span>Returning...</span>
                  </>
                ) : (
                  <>
                    <FiCheck size={14} />
                    <span>Confirm Return</span>
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
