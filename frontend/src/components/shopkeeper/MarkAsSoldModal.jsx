import React, { useState, useEffect } from "react";
import { FiX, FiCheck, FiMinus, FiPlus, FiDollarSign, FiAlertCircle, FiInfo } from "react-icons/fi";
import Swal from "sweetalert2";
import api from "../../api/axios";
import { formatFullAmount } from "../../utils/unitChanger";

export default function MarkAsSoldModal({
  isOpen,
  onClose,
  transfer,
  onSaleSuccess,
}) {
  const [quantity, setQuantity] = useState(1);
  const [agreedAmount, setAgreedAmount] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState({});

  const maxSoldable = transfer?.remainingQuantity || 0;
  const originalCost = transfer?.unitCost || 0;

  useEffect(() => {
    if (transfer) {
      setQuantity(1);
      const agreed = transfer.agreedAmountPerUnit != null ? String(transfer.agreedAmountPerUnit) : "";
      setAgreedAmount(agreed);
      setErrors({});
      setIsSubmitting(false);
    }
  }, [transfer]);

  const handleQuantityChange = (newQty) => {
    const validQty = Math.max(1, Math.min(maxSoldable, newQty));
    setQuantity(validQty);
  };

  if (!isOpen || !transfer) return null;

  const parsedAgreed = parseFloat(agreedAmount) || 0;
  const myProfitPerUnit = Number((parsedAgreed - originalCost).toFixed(2));
  const totalAmountPayableToMe = Number((parsedAgreed * quantity).toFixed(2));
  const totalProfit = Number((myProfitPerUnit * quantity).toFixed(2));

  const validate = () => {
    const errs = {};
    if (quantity <= 0 || quantity > maxSoldable) {
      errs.quantity = `Quantity must be between 1 and ${maxSoldable}.`;
    }
    if (isNaN(parsedAgreed) || parsedAgreed < 0) {
      errs.agreedAmount = "Please enter a valid, non-negative agreed amount.";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate() || isSubmitting) return;

    try {
      setIsSubmitting(true);
      const payload = {
        quantity,
        agreedAmountPerUnit: parsedAgreed,
        customerSalePrice: parsedAgreed,
        amountPaid: totalAmountPayableToMe,
        paymentMethod: "Cash",
        notes: "",
        saleDate: new Date(),
      };

      const res = await api.post(`/shopkeepers/transfers/${transfer._id}/sell`, payload);
      if (res.data?.success) {
        Swal.fire({
          icon: "success",
          title: "Sale Confirmed!",
          html: `<div>
            <p class="mb-1">Sold <strong>${quantity} unit(s)</strong> of <strong>${transfer.productName}</strong> via <strong>${transfer.shopkeeperName}</strong>.</p>
            <p class="mb-0 text-success fw-bold">My Realized Profit: Rs. ${totalProfit.toLocaleString()}</p>
          </div>`,
          confirmButtonColor: "#09090b",
          timer: 3000,
          timerProgressBar: true,
        });

        if (onSaleSuccess) {
          onSaleSuccess(res.data.data);
        }
        onClose();
      }
    } catch (err) {
      console.error("Sale confirmation failed:", err);
      const msg = err.response?.data?.message || "Failed to complete sale.";
      setErrors((prev) => ({ ...prev, server: msg }));
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
        style={{ maxWidth: "480px" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-content border-0 shadow-lg rounded-3 overflow-hidden">
          {/* Header */}
          <div className="modal-header bg-dark text-white py-2 px-3">
            <div className="d-flex align-items-center gap-2">
              <FiDollarSign size={16} />
              <h6 className="modal-title fw-semibold mb-0" style={{ fontSize: "0.92rem" }}>
                Mark as Sold / Record Sale
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
              {errors.server && (
                <div className="alert alert-danger py-2 px-3 small d-flex align-items-center gap-2 mb-3">
                  <FiAlertCircle size={15} className="flex-shrink-0" />
                  <span>{errors.server}</span>
                </div>
              )}

              {/* Product and Shopkeeper Details */}
              <div className="p-3 bg-light rounded-2 border mb-3">
                <div className="d-flex justify-content-between mb-1" style={{ fontSize: "0.78rem" }}>
                  <span className="text-secondary">Shopkeeper:</span>
                  <strong className="text-dark">{transfer.shopkeeperName}</strong>
                </div>
                <div className="d-flex justify-content-between mb-1" style={{ fontSize: "0.78rem" }}>
                  <span className="text-secondary">Product:</span>
                  <strong className="text-dark text-truncate" style={{ maxWidth: "240px" }} title={transfer.productName}>
                    {transfer.productName}
                  </strong>
                </div>
                <div className="d-flex justify-content-between pt-1 border-top" style={{ fontSize: "0.78rem" }}>
                  <span className="text-secondary">Available with Shopkeeper:</span>
                  <span className="badge bg-dark text-white">{maxSoldable} units</span>
                </div>
              </div>

              {/* Quantity Sold & Reference Cost */}
              <div className="row g-2 mb-3">
                <div className="col-sm-6">
                  <label className="form-label small fw-semibold text-dark mb-1" style={{ fontSize: "0.78rem" }}>
                    Quantity Sold <span className="text-danger">*</span>
                  </label>
                  <div className="input-group" style={{ height: "40px" }}>
                    <button
                      type="button"
                      className="btn btn-outline-secondary px-3 d-flex align-items-center justify-content-center"
                      onClick={() => handleQuantityChange(quantity - 1)}
                      disabled={quantity <= 1 || isSubmitting}
                      style={{ minWidth: "48px", height: "100%" }}
                    >
                      <FiMinus size={15} />
                    </button>
                    <input
                      type="number"
                      min="1"
                      max={maxSoldable}
                      value={quantity}
                      onChange={(e) => handleQuantityChange(parseInt(e.target.value, 10) || 1)}
                      className={`form-control text-center fw-bold fs-6 ${errors.quantity ? "is-invalid" : ""}`}
                      disabled={isSubmitting}
                      style={{ height: "100%" }}
                    />
                    <button
                      type="button"
                      className="btn btn-outline-secondary px-3 d-flex align-items-center justify-content-center"
                      onClick={() => handleQuantityChange(quantity + 1)}
                      disabled={quantity >= maxSoldable || isSubmitting}
                      style={{ minWidth: "48px", height: "100%" }}
                    >
                      <FiPlus size={15} />
                    </button>
                  </div>
                  {errors.quantity && <div className="text-danger small mt-1">{errors.quantity}</div>}
                </div>

                <div className="col-sm-6">
                  <label className="form-label small fw-semibold text-dark mb-1" style={{ fontSize: "0.78rem" }}>
                    Cost / Unit (My Purchase Cost)
                  </label>
                  <div
                    className="p-2 bg-light rounded-2 border text-center fw-semibold text-secondary d-flex align-items-center justify-content-center"
                    style={{ fontSize: "0.85rem", height: "40px" }}
                  >
                    {formatFullAmount(originalCost)}
                  </div>
                </div>
              </div>

              {/* Single Agreed Price Field */}
              <div className="mb-3">
                <label className="form-label small fw-semibold text-dark mb-1" style={{ fontSize: "0.78rem" }}>
                  Agreed Payable to Me / Unit <span className="text-danger">*</span>
                </label>
                <div className="input-group" style={{ height: "40px" }}>
                  <span className="input-group-text bg-white text-secondary fw-semibold">Rs.</span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={agreedAmount}
                    onChange={(e) => setAgreedAmount(e.target.value)}
                    placeholder="Enter agreed sale value..."
                    className={`form-control fw-semibold fs-6 ${errors.agreedAmount ? "is-invalid" : ""}`}
                    disabled={isSubmitting}
                    style={{ height: "100%" }}
                  />
                </div>
                {errors.agreedAmount && <div className="text-danger small mt-1">{errors.agreedAmount}</div>}
                <div className="form-text text-muted small mt-1" style={{ fontSize: "0.7rem" }}>
                  Enter the agreed amount payable. A higher value directly yields higher profit.
                </div>
              </div>

              {/* Financial Calculation Breakdown Card */}
              <div className="p-3 bg-light rounded-2 border mb-1">
                <div className="d-flex align-items-center gap-2 mb-2 text-dark fw-semibold" style={{ fontSize: "0.78rem" }}>
                  <FiInfo size={14} className="text-primary" />
                  <span>Profit & Financial Calculation</span>
                </div>
                <div className="d-flex justify-content-between mb-1" style={{ fontSize: "0.76rem" }}>
                  <span className="text-secondary">My Profit per Unit:</span>
                  <strong className={myProfitPerUnit >= 0 ? "text-success" : "text-danger"}>
                    {myProfitPerUnit >= 0 ? "+" : ""}{formatFullAmount(myProfitPerUnit)}
                  </strong>
                </div>
                <div className="d-flex justify-content-between mb-1" style={{ fontSize: "0.76rem" }}>
                  <span className="text-secondary">Total Amount Payable to My Shop:</span>
                  <strong className="text-dark fs-6">{formatFullAmount(totalAmountPayableToMe)}</strong>
                </div>
                <div className="d-flex justify-content-between pt-1 border-top" style={{ fontSize: "0.76rem" }}>
                  <span className="fw-semibold text-dark">My Total Realized Profit:</span>
                  <strong className={totalProfit >= 0 ? "text-success fs-6" : "text-danger fs-6"}>
                    {totalProfit >= 0 ? "+" : ""}{formatFullAmount(totalProfit)}
                  </strong>
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
                disabled={isSubmitting || maxSoldable <= 0}
              >
                {isSubmitting ? (
                  <>
                    <span className="spinner-border spinner-border-sm" role="status" style={{ width: "12px", height: "12px" }} />
                    <span>Recording Sale...</span>
                  </>
                ) : (
                  <>
                    <FiCheck size={14} />
                    <span>Confirm Sale & Record Profit</span>
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
