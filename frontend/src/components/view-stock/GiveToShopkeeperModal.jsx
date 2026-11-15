import React, { useState, useEffect } from "react";
import { FiX, FiCheck, FiMinus, FiPlus, FiShare2, FiAlertCircle } from "react-icons/fi";
import Swal from "sweetalert2";
import api from "../../api/axios";
import ShopkeeperAutocomplete from "../shopkeeper/ShopkeeperAutocomplete";
import { formatFullAmount } from "../../utils/unitChanger";

export default function GiveToShopkeeperModal({
  isOpen,
  onClose,
  stockItem,
  onTransferSuccess,
}) {
  const [shopkeeperName, setShopkeeperName] = useState("");
  const [shopkeeperId, setShopkeeperId] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [agreedAmount, setAgreedAmount] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState({});

  // Serialized devices in this batch
  const [availableDevices, setAvailableDevices] = useState([]);
  const [isLoadingDevices, setIsLoadingDevices] = useState(false);
  const [selectedImei, setSelectedImei] = useState("");

  const cleanProductName =
    stockItem?.items?.[0]?.productName ||
    stockItem?.productNames?.[0] ||
    (typeof stockItem?.productName === "string"
      ? stockItem.productName.replace(/\s*\(\d+\s*units?\)$/i, "").trim()
      : stockItem?.productName || "Product");

  const availableStock = stockItem?.quantity || 0;
  const unitCost = stockItem?.unitPrice || 0;

  // Initialize form when a stock item is selected
  useEffect(() => {
    if (stockItem) {
      setShopkeeperName("");
      setShopkeeperId(null);
      setQuantity(1);
      setSelectedImei("");
      // Default agreed amount to unit cost or estimated sale price if available
      setAgreedAmount(
        stockItem.estimatedSalePricePerUnit != null && stockItem.estimatedSalePricePerUnit > 0
          ? String(stockItem.estimatedSalePricePerUnit)
          : String(stockItem.unitPrice || "")
      );
      setErrors({});
      setIsSubmitting(false);

      // 1. If stockItem already has serializedUnits pre-populated
      if (Array.isArray(stockItem.serializedUnits) && stockItem.serializedUnits.length > 0) {
        const avail = stockItem.serializedUnits.filter(
          (u) => u.status === "available" && u.barcode && u.barcode.toUpperCase() !== "N/A"
        );
        setAvailableDevices(avail);
        setIsLoadingDevices(false);
      } else {
        // Load available devices in this batch/stock
        setIsLoadingDevices(true);
        api
          .get(`/stock/${stockItem._id}/barcodes`)
          .then((res) => {
            if (res.data?.success && Array.isArray(res.data.data?.units)) {
              const avail = res.data.data.units.filter(
                (u) => u.status === "available" && u.barcode && u.barcode.toUpperCase() !== "N/A"
              );
              setAvailableDevices(avail);
            } else if (Array.isArray(stockItem.barcodes) && stockItem.barcodes.length > 0) {
              setAvailableDevices(stockItem.barcodes.map((bc) => ({ barcode: bc })));
            } else if (stockItem.barcode && stockItem.barcode.toUpperCase() !== "N/A") {
              setAvailableDevices([{ barcode: stockItem.barcode }]);
            } else {
              setAvailableDevices([]);
            }
          })
          .catch(() => {
            if (Array.isArray(stockItem.barcodes) && stockItem.barcodes.length > 0) {
              setAvailableDevices(stockItem.barcodes.map((bc) => ({ barcode: bc })));
            } else if (stockItem.barcode && stockItem.barcode.toUpperCase() !== "N/A") {
              setAvailableDevices([{ barcode: stockItem.barcode }]);
            } else {
              setAvailableDevices([]);
            }
          })
          .finally(() => {
            setIsLoadingDevices(false);
          });
      }
    }
  }, [stockItem]);

  if (!isOpen || !stockItem) return null;

  const handleImeiSelectChange = (e) => {
    const imei = e.target.value;
    setSelectedImei(imei);
    if (imei) {
      setQuantity(1);
    }
  };

  const handleDecrement = () => {
    if (selectedImei) return;
    setQuantity((prev) => Math.max(1, prev - 1));
  };

  const handleIncrement = () => {
    if (selectedImei) return;
    setQuantity((prev) => Math.min(availableStock, prev + 1));
  };

  const handleQuantityChange = (e) => {
    if (selectedImei) return;
    const val = parseInt(e.target.value, 10);
    if (isNaN(val)) {
      setQuantity(1);
    } else {
      setQuantity(Math.max(1, Math.min(availableStock, val)));
    }
  };

  const validate = () => {
    const errs = {};
    if (!shopkeeperName || !shopkeeperName.trim()) {
      errs.shopkeeper = "Shopkeeper name is required.";
    }
    if (quantity <= 0) {
      errs.quantity = "Quantity must be greater than zero.";
    } else if (quantity > availableStock) {
      errs.quantity = `Quantity cannot exceed available stock (${availableStock}).`;
    }

    const parsedAgreed = parseFloat(agreedAmount);
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
        stockId: stockItem._id,
        productName: cleanProductName,
        shopkeeperId: shopkeeperId || undefined,
        shopkeeperName: shopkeeperName.trim(),
        quantity,
        agreedAmountPerUnit: parseFloat(agreedAmount),
        barcode: selectedImei || undefined,
        barcodes: selectedImei ? [selectedImei] : undefined,
      };

      const res = await api.post("/shopkeepers/transfers", payload);
      if (res.data?.success) {
        const imeiText = selectedImei ? ` (IMEI: ${selectedImei})` : "";
        Swal.fire({
          icon: "success",
          title: "Stock Transferred!",
          text: `${quantity} unit(s) of "${cleanProductName}"${imeiText} transferred to ${shopkeeperName.trim()}.`,
          confirmButtonColor: "#09090b",
          timer: 3000,
          timerProgressBar: true,
        });

        if (onTransferSuccess) {
          onTransferSuccess(res.data.data);
        }
        onClose();
      }
    } catch (err) {
      console.error("Transfer failed:", err);
      const msg = err.response?.data?.message || "Failed to process stock transfer. Please try again.";
      setErrors((prev) => ({ ...prev, server: msg }));
    } finally {
      setIsSubmitting(false);
    }
  };

  const parsedAgreedNum = parseFloat(agreedAmount) || 0;
  const totalAgreed = Number((parsedAgreedNum * quantity).toFixed(2));
  const estimatedProfitPerUnit = parsedAgreedNum - unitCost;
  const totalEstimatedProfit = Number((estimatedProfitPerUnit * quantity).toFixed(2));

  return (
    <div
      className="modal fade show d-block"
      style={{ backgroundColor: "rgba(0,0,0,0.55)", zIndex: 1055 }}
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
              <FiShare2 size={16} />
              <h6 className="modal-title fw-semibold mb-0" style={{ fontSize: "0.92rem" }}>
                Give to Another Shopkeeper
              </h6>
            </div>
            <button
              type="button"
              className="btn-close btn-close-white"
              onClick={onClose}
              disabled={isSubmitting}
              aria-label="Close"
            />
          </div>

          {/* Form Body */}
          <form onSubmit={handleSubmit}>
            <div className="modal-body py-2.5 px-3">
              {errors.server && (
                <div className="alert alert-danger py-1.5 px-2.5 small d-flex align-items-center gap-2 mb-2">
                  <FiAlertCircle size={14} className="flex-shrink-0" />
                  <span>{errors.server}</span>
                </div>
              )}

              {/* 1. Product Name (Read-Only) */}
              <div className="mb-2">
                <label className="form-label small fw-semibold text-secondary mb-0.5" style={{ fontSize: "0.74rem" }}>
                  Product Name
                </label>
                <div
                  className="px-2.5 bg-light rounded-2 border text-dark fw-semibold small text-truncate d-flex align-items-center"
                  style={{ height: "34px" }}
                  title={cleanProductName}
                >
                  {cleanProductName}
                </div>
              </div>

              {/* 2. Available Stock & Purchase Cost Info Banner */}
              <div className="row g-2 mb-2">
                <div className="col-6">
                  <div className="py-1 px-2 border rounded-2 bg-light text-center">
                    <span className="text-secondary small d-block" style={{ fontSize: "0.68rem" }}>Available in Shop</span>
                    <strong className="fs-6 text-dark" style={{ fontSize: "0.88rem" }}>{availableStock} units</strong>
                  </div>
                </div>
                <div className="col-6">
                  <div className="py-1 px-2 border rounded-2 bg-light text-center">
                    <span className="text-secondary small d-block" style={{ fontSize: "0.68rem" }}>Purchase Cost / Unit</span>
                    <strong className="fs-6 text-dark" style={{ fontSize: "0.88rem" }}>{formatFullAmount(unitCost)}</strong>
                  </div>
                </div>
              </div>

              {/* 3. Shopkeeper Name (Autocomplete from DB) */}
              <div className="mb-2">
                <label className="form-label small fw-semibold text-dark mb-0.5" style={{ fontSize: "0.76rem" }}>
                  Shopkeeper Name <span className="text-danger">*</span>
                </label>
                <ShopkeeperAutocomplete
                  value={shopkeeperName}
                  shopkeeperId={shopkeeperId}
                  onChange={({ name, _id }) => {
                    setShopkeeperName(name);
                    setShopkeeperId(_id);
                    if (errors.shopkeeper) {
                      setErrors((prev) => ({ ...prev, shopkeeper: null }));
                    }
                  }}
                  error={errors.shopkeeper}
                  disabled={isSubmitting}
                  placeholder="Select or enter shopkeeper name..."
                />
              </div>

              {/* 3.5. Select Specific Device / IMEI Dropdown (Optional) */}
              {(availableDevices.length > 0 || isLoadingDevices) && (
                <div className="mb-2">
                  <div className="d-flex justify-content-between align-items-center mb-0.5">
                    <label className="form-label small fw-semibold text-dark mb-0" style={{ fontSize: "0.76rem" }}>
                      Select Device IMEI <span className="text-muted fw-normal">(Optional)</span>
                    </label>
                    {availableDevices.length > 0 && (
                      <span className="badge bg-light text-secondary border px-1.5 py-0.5" style={{ fontSize: "0.66rem" }}>
                        {availableDevices.length} available in batch
                      </span>
                    )}
                  </div>
                  <select
                    className="form-select font-monospace"
                    style={{ height: "34px", fontSize: "0.80rem" }}
                    value={selectedImei}
                    onChange={handleImeiSelectChange}
                    disabled={isSubmitting || isLoadingDevices}
                  >
                    <option value="">
                      {isLoadingDevices ? "Loading devices in batch..." : "-- No specific device (Random / Any) --"}
                    </option>
                    {availableDevices.map((dev, dIdx) => (
                      <option key={dIdx} value={dev.barcode}>
                        IMEI: {dev.barcode}
                      </option>
                    ))}
                  </select>
                  {selectedImei && (
                    <div className="text-success small mt-0.5 fw-semibold d-flex align-items-center gap-1" style={{ fontSize: "0.70rem" }}>
                      <span>✓ Only device <strong>{selectedImei}</strong> will be given to shopkeeper.</span>
                    </div>
                  )}
                </div>
              )}

              {/* 4. Quantity to Transfer (+ / - Controls, Full Width and Compact Height) */}
              <div className="mb-2">
                <div className="d-flex justify-content-between align-items-center mb-0.5">
                  <label className="form-label small fw-semibold text-dark mb-0" style={{ fontSize: "0.76rem" }}>
                    Quantity to Give <span className="text-danger">*</span>
                  </label>
                  {selectedImei && (
                    <span className="text-muted small" style={{ fontSize: "0.68rem" }}>
                      (Locked to 1 for selected IMEI)
                    </span>
                  )}
                </div>
                <div className="input-group w-100" style={{ height: "34px" }}>
                  <button
                    type="button"
                    className="btn btn-outline-secondary px-2.5 d-flex align-items-center justify-content-center"
                    onClick={handleDecrement}
                    disabled={quantity <= 1 || isSubmitting || Boolean(selectedImei)}
                    style={{ minWidth: "42px", height: "100%" }}
                  >
                    <FiMinus size={14} />
                  </button>
                  <input
                    type="number"
                    min="1"
                    max={availableStock}
                    value={quantity}
                    onChange={handleQuantityChange}
                    className={`form-control text-center fw-bold ${errors.quantity ? "is-invalid" : ""}`}
                    disabled={isSubmitting || Boolean(selectedImei)}
                    style={{ height: "100%", fontSize: "0.88rem" }}
                  />
                  <button
                    type="button"
                    className="btn btn-outline-secondary px-2.5 d-flex align-items-center justify-content-center"
                    onClick={handleIncrement}
                    disabled={quantity >= availableStock || isSubmitting || Boolean(selectedImei)}
                    style={{ minWidth: "42px", height: "100%" }}
                  >
                    <FiPlus size={14} />
                  </button>
                </div>
                {errors.quantity && (
                  <div className="text-danger small mt-0.5" style={{ fontSize: "0.72rem" }}>
                    {errors.quantity}
                  </div>
                )}
              </div>

              {/* 5. Agreed Amount Payable to Me per Unit */}
              <div className="mb-2">
                <div className="d-flex justify-content-between align-items-center mb-0.5">
                  <label className="form-label small fw-semibold text-dark mb-0" style={{ fontSize: "0.76rem" }}>
                    Agreed Amount Payable to Me per Unit (Rs.) <span className="text-danger">*</span>
                  </label>
                  {estimatedProfitPerUnit > 0 ? (
                    <span className="badge bg-success-subtle text-success border border-success-subtle px-1.5 py-0.5" style={{ fontSize: "0.66rem" }}>
                      +{formatFullAmount(estimatedProfitPerUnit)} profit/unit
                    </span>
                  ) : estimatedProfitPerUnit < 0 ? (
                    <span className="badge bg-danger-subtle text-danger border border-danger-subtle px-1.5 py-0.5" style={{ fontSize: "0.66rem" }}>
                      Loss: {formatFullAmount(estimatedProfitPerUnit)}
                    </span>
                  ) : (
                    <span className="badge bg-light text-secondary border px-1.5 py-0.5" style={{ fontSize: "0.66rem" }}>
                      At cost
                    </span>
                  )}
                </div>
                <div className="input-group" style={{ height: "34px" }}>
                  <span className="input-group-text bg-white text-secondary fw-semibold py-0" style={{ fontSize: "0.78rem" }}>Rs.</span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={agreedAmount}
                    onChange={(e) => {
                      setAgreedAmount(e.target.value);
                      if (errors.agreedAmount) {
                        setErrors((prev) => ({ ...prev, agreedAmount: null }));
                      }
                    }}
                    placeholder="Enter agreed price..."
                    className={`form-control fw-semibold ${errors.agreedAmount ? "is-invalid" : ""}`}
                    disabled={isSubmitting}
                    style={{ height: "100%", fontSize: "0.85rem" }}
                  />
                </div>
                {errors.agreedAmount && (
                  <div className="text-danger small mt-0.5" style={{ fontSize: "0.72rem" }}>
                    {errors.agreedAmount}
                  </div>
                )}
              </div>

              {/* Summary Calculation Box */}
              <div className="py-2 px-2.5 rounded-2 bg-light border mb-1" style={{ fontSize: "0.74rem" }}>
                <div className="d-flex justify-content-between text-secondary mb-1">
                  <span>Total Expected Receivable:</span>
                  <strong className="text-dark" style={{ fontSize: "0.85rem" }}>{formatFullAmount(totalAgreed)}</strong>
                </div>
                <div className="d-flex justify-content-between text-secondary">
                  <span>Estimated Total Profit (upon sale):</span>
                  <strong className={totalEstimatedProfit >= 0 ? "text-success" : "text-danger"} style={{ fontSize: "0.85rem" }}>
                    {totalEstimatedProfit >= 0 ? "+" : ""}{formatFullAmount(totalEstimatedProfit)}
                  </strong>
                </div>
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="modal-footer bg-light py-2 px-3 d-flex justify-content-end gap-2">
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary px-3 py-1.5"
                style={{ fontSize: "0.80rem" }}
                onClick={onClose}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-sm btn-dark px-3 py-1.5 d-flex align-items-center gap-1.5"
                style={{ fontSize: "0.80rem" }}
                disabled={isSubmitting || availableStock <= 0}
              >
                {isSubmitting ? (
                  <>
                    <span className="spinner-border spinner-border-sm" role="status" style={{ width: "12px", height: "12px" }} />
                    <span>Transferring...</span>
                  </>
                ) : (
                  <>
                    <FiCheck size={14} />
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
