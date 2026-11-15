import React, { useState, useEffect, useCallback } from "react";
import {
  FiX,
  FiUser,
  FiPhone,
  FiPackage,
  FiClock,
  FiDollarSign,
  FiRotateCcw,
  FiCheckCircle,
  FiAlertCircle,
  FiCreditCard,
  FiFileText,
  FiShare2,
} from "react-icons/fi";
import Swal from "sweetalert2";
import api from "../../api/axios";
import { formatFullAmount } from "../../utils/unitChanger";

export default function ShopkeeperDetailModal({
  isOpen,
  onClose,
  shopkeeperId,
  shopkeeperName,
  onRecordUpdated,
}) {
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("transfers"); // "transfers" | "sales" | "returns"
  const [isRecordingPayment, setIsRecordingPayment] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);

  const fetchDetails = useCallback(async () => {
    if (!shopkeeperId && !shopkeeperName) return;
    try {
      setIsLoading(true);
      const identifier = shopkeeperId || encodeURIComponent(shopkeeperName);
      const res = await api.get(`/shopkeepers/${identifier}`);
      if (res.data?.success && res.data.data) {
        setData(res.data.data);
      }
    } catch (err) {
      console.error("Failed to load shopkeeper details:", err);
    } finally {
      setIsLoading(false);
    }
  }, [shopkeeperId, shopkeeperName]);

  useEffect(() => {
    if (isOpen) {
      fetchDetails();
      setIsRecordingPayment(false);
      setPaymentAmount("");
    }
  }, [isOpen, fetchDetails]);

  if (!isOpen) return null;

  const shopkeeper = data?.shopkeeper;
  const summary = data?.summary || {};
  const transfers = data?.transfers || [];
  const sales = data?.sales || [];

  // Flatten all returns across transfers for the returns tab
  const allReturns = [];
  transfers.forEach((t) => {
    if (Array.isArray(t.returns)) {
      t.returns.forEach((r) => {
        allReturns.push({
          ...r,
          productName: t.productName,
          transferNumber: t.transferNumber,
        });
      });
    }
  });

  const handleSettlePayment = async (e) => {
    e.preventDefault();
    const amt = parseFloat(paymentAmount);
    if (isNaN(amt) || amt <= 0) return;

    try {
      setIsSubmittingPayment(true);
      const res = await api.post(`/shopkeepers/${shopkeeper._id}/payments`, {
        amount: amt,
        paymentMethod,
      });

      if (res.data?.success) {
        Swal.fire({
          icon: "success",
          title: "Payment Recorded",
          text: `Rs. ${amt.toLocaleString()} recorded for ${shopkeeper.name}.`,
          confirmButtonColor: "#09090b",
          timer: 2500,
        });
        setIsRecordingPayment(false);
        setPaymentAmount("");
        fetchDetails();
        if (onRecordUpdated) onRecordUpdated();
      }
    } catch (err) {
      console.error("Payment failed:", err);
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "—";
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  };

  return (
    <div
      className="modal fade show d-block"
      style={{ backgroundColor: "rgba(0,0,0,0.6)", zIndex: 1060 }}
      tabIndex="-1"
      role="dialog"
      onClick={onClose}
    >
      <div
        className="modal-dialog modal-dialog-centered modal-dialog-scrollable"
        style={{ maxWidth: "800px" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-content border-0 shadow-lg rounded-3 overflow-hidden">
          {/* Header */}
          <div className="modal-header bg-dark text-white py-2 px-3">
            <div className="d-flex align-items-center gap-2">
              <FiUser size={16} />
              <h6 className="modal-title fw-semibold mb-0" style={{ fontSize: "0.92rem" }}>
                Shopkeeper Profile & Consignment Ledger
              </h6>
            </div>
            <button type="button" className="btn-close btn-close-white" onClick={onClose} />
          </div>

          <div className="modal-body p-3">
            {isLoading ? (
              <div className="text-center py-5">
                <span className="spinner-border spinner-border-sm text-dark me-2" role="status" />
                <span className="small text-secondary">Loading shopkeeper ledger...</span>
              </div>
            ) : !shopkeeper ? (
              <div className="alert alert-warning py-3 text-center small">
                Shopkeeper record not found.
              </div>
            ) : (
              <>
                {/* Shopkeeper Profile Card */}
                <div className="card border bg-light p-3 rounded-3 mb-3">
                  <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
                    <div>
                      <div className="d-flex align-items-center gap-2">
                        <h5 className="fw-bold text-dark mb-0">{shopkeeper.name}</h5>
                        <span className="badge bg-dark-subtle text-dark border small" style={{ fontSize: "0.68rem" }}>
                          External Shopkeeper
                        </span>
                      </div>
                      {shopkeeper.phone && (
                        <div className="text-secondary small d-flex align-items-center gap-1 mt-1" style={{ fontSize: "0.76rem" }}>
                          <FiPhone size={12} /> {shopkeeper.phone}
                        </div>
                      )}
                    </div>

                    {/* Quick Payment Action if due > 0 */}
                    {summary.totalDue > 0 && !isRecordingPayment && (
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-danger d-flex align-items-center gap-2"
                        onClick={() => {
                          setPaymentAmount(String(summary.totalDue));
                          setIsRecordingPayment(true);
                        }}
                      >
                        <FiCreditCard size={13} />
                        <span>Settle Due Balance (Rs. {summary.totalDue.toLocaleString()})</span>
                      </button>
                    )}
                  </div>

                  {/* Payment Form inline drawer */}
                  {isRecordingPayment && (
                    <form onSubmit={handleSettlePayment} className="mt-3 pt-3 border-top">
                      <div className="row g-2 align-items-end">
                        <div className="col-sm-5">
                          <label className="form-label small fw-semibold mb-1" style={{ fontSize: "0.74rem" }}>
                            Payment Amount Received (Rs.)
                          </label>
                          <input
                            type="number"
                            min="1"
                            step="any"
                            value={paymentAmount}
                            onChange={(e) => setPaymentAmount(e.target.value)}
                            className="form-control form-control-sm fw-bold"
                            placeholder="Amount..."
                            required
                          />
                        </div>
                        <div className="col-sm-4">
                          <label className="form-label small fw-semibold mb-1" style={{ fontSize: "0.74rem" }}>
                            Method
                          </label>
                          <select
                            className="form-select form-select-sm"
                            value={paymentMethod}
                            onChange={(e) => setPaymentMethod(e.target.value)}
                          >
                            <option value="Cash">Cash</option>
                            <option value="Bank Transfer">Bank Transfer</option>
                            <option value="Online">Online / Wallet</option>
                          </select>
                        </div>
                        <div className="col-sm-3 d-flex gap-1">
                          <button
                            type="submit"
                            className="btn btn-sm btn-dark flex-grow-1"
                            disabled={isSubmittingPayment}
                          >
                            {isSubmittingPayment ? "Saving..." : "Record"}
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-secondary"
                            onClick={() => setIsRecordingPayment(false)}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </form>
                  )}
                </div>

                {/* KPI Cards Grid */}
                <div className="row g-2 mb-3 text-center">
                  <div className="col-6 col-md-3">
                    <div className="p-2 border rounded-2 bg-white">
                      <span className="text-secondary small d-block" style={{ fontSize: "0.68rem" }}>Current Held Stock</span>
                      <strong className={`fs-6 ${summary.currentUnitsHeld > 0 ? "text-primary" : "text-dark"}`}>
                        {summary.currentUnitsHeld} units
                      </strong>
                    </div>
                  </div>
                  <div className="col-6 col-md-3">
                    <div className="p-2 border rounded-2 bg-white">
                      <span className="text-secondary small d-block" style={{ fontSize: "0.68rem" }}>Units Sold</span>
                      <strong className="fs-6 text-dark">{summary.totalUnitsSold} units</strong>
                    </div>
                  </div>
                  <div className="col-6 col-md-3">
                    <div className="p-2 border rounded-2 bg-white">
                      <span className="text-secondary small d-block" style={{ fontSize: "0.68rem" }}>Units Returned</span>
                      <strong className="fs-6 text-dark">{summary.totalUnitsReturned} units</strong>
                    </div>
                  </div>
                  <div className="col-6 col-md-3">
                    <div className="p-2 border rounded-2 bg-white">
                      <span className="text-secondary small d-block" style={{ fontSize: "0.68rem" }}>Realized Profit</span>
                      <strong className="fs-6 text-success">+{formatFullAmount(summary.totalProfit)}</strong>
                    </div>
                  </div>
                  <div className="col-6 col-md-4">
                    <div className="p-2 border rounded-2 bg-white">
                      <span className="text-secondary small d-block" style={{ fontSize: "0.68rem" }}>Total Sales Value</span>
                      <strong className="fs-6 text-dark">{formatFullAmount(summary.totalSalesPayable)}</strong>
                    </div>
                  </div>
                  <div className="col-6 col-md-4">
                    <div className="p-2 border rounded-2 bg-white">
                      <span className="text-secondary small d-block" style={{ fontSize: "0.68rem" }}>Total Paid Received</span>
                      <strong className="fs-6 text-dark">{formatFullAmount(summary.totalPaid)}</strong>
                    </div>
                  </div>
                  <div className="col-12 col-md-4">
                    <div className="p-2 border rounded-2 bg-white">
                      <span className="text-secondary small d-block" style={{ fontSize: "0.68rem" }}>Outstanding Due Balance</span>
                      <strong className={`fs-6 ${summary.totalDue > 0 ? "text-danger" : "text-success"}`}>
                        {formatFullAmount(summary.totalDue)}
                      </strong>
                    </div>
                  </div>
                </div>

                {/* Ledger Navigation Tabs */}
                <ul className="nav nav-tabs nav-fill mb-3" style={{ fontSize: "0.78rem" }}>
                  <li className="nav-item">
                    <button
                      type="button"
                      className={`nav-link fw-semibold py-2 ${activeTab === "transfers" ? "active text-dark" : "text-secondary"}`}
                      onClick={() => setActiveTab("transfers")}
                    >
                      Stock Transfers ({transfers.length})
                    </button>
                  </li>
                  <li className="nav-item">
                    <button
                      type="button"
                      className={`nav-link fw-semibold py-2 ${activeTab === "sales" ? "active text-dark" : "text-secondary"}`}
                      onClick={() => setActiveTab("sales")}
                    >
                      Completed Sales ({sales.length})
                    </button>
                  </li>
                  <li className="nav-item">
                    <button
                      type="button"
                      className={`nav-link fw-semibold py-2 ${activeTab === "returns" ? "active text-dark" : "text-secondary"}`}
                      onClick={() => setActiveTab("returns")}
                    >
                      Stock Returns ({allReturns.length})
                    </button>
                  </li>
                </ul>

                {/* Tab Content */}
                {activeTab === "transfers" && (
                  <div className="table-responsive border rounded-2 bg-white">
                    <table className="table table-sm table-hover mb-0" style={{ fontSize: "0.74rem" }}>
                      <thead className="table-light">
                        <tr>
                          <th className="ps-2 py-2">Date</th>
                          <th className="py-2">Product</th>
                          <th className="text-center py-2">Taken</th>
                          <th className="text-center py-2">Sold</th>
                          <th className="text-center py-2">Ret.</th>
                          <th className="text-center py-2">Remaining</th>
                          <th className="text-end py-2">Agreed Price</th>
                          <th className="text-center pe-2 py-2">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {transfers.length === 0 ? (
                          <tr>
                            <td colSpan="8" className="text-center text-muted py-3">
                              No transfer records found for this shopkeeper.
                            </td>
                          </tr>
                        ) : (
                          transfers.map((t) => (
                            <tr key={t._id}>
                              <td className="ps-2 py-2 text-nowrap">{formatDate(t.transferDate)}</td>
                              <td className="py-2 fw-semibold text-dark text-truncate" style={{ maxWidth: "180px" }}>
                                {t.productName}
                              </td>
                              <td className="text-center py-2">{t.originalQuantity}</td>
                              <td className="text-center py-2">{t.soldQuantity || 0}</td>
                              <td className="text-center py-2">{t.returnedQuantity || 0}</td>
                              <td className="text-center py-2">
                                <span className={`badge ${t.remainingQuantity > 0 ? "bg-dark text-white" : "bg-light text-secondary border"}`}>
                                  {t.remainingQuantity}
                                </span>
                              </td>
                              <td className="text-end py-2 text-nowrap">{formatFullAmount(t.agreedAmountPerUnit)}</td>
                              <td className="text-center pe-2 py-2">
                                <span
                                  className={`badge px-2 py-1 small ${
                                    t.status === "completed"
                                      ? "bg-success-subtle text-success border border-success-subtle"
                                      : t.status === "returned"
                                      ? "bg-secondary-subtle text-secondary"
                                      : "bg-warning-subtle text-dark border border-warning-subtle"
                                  }`}
                                  style={{ fontSize: "0.66rem" }}
                                >
                                  {t.status}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                {activeTab === "sales" && (
                  <div className="table-responsive border rounded-2 bg-white">
                    <table className="table table-sm table-hover mb-0" style={{ fontSize: "0.74rem" }}>
                      <thead className="table-light">
                        <tr>
                          <th className="ps-2 py-2">Invoice #</th>
                          <th className="py-2">Sale Date</th>
                          <th className="py-2">Product</th>
                          <th className="text-center py-2">Qty</th>
                          <th className="text-end py-2">Agreed Price</th>
                          <th className="text-end py-2">Total Amount</th>
                          <th className="text-center py-2">Profit</th>
                          <th className="text-center pe-2 py-2">Payment</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sales.length === 0 ? (
                          <tr>
                            <td colSpan="8" className="text-center text-muted py-3">
                              No completed sales recorded for this shopkeeper yet.
                            </td>
                          </tr>
                        ) : (
                          sales.map((s) => (
                            <tr key={s._id}>
                              <td className="ps-2 py-2 font-monospace text-dark fw-semibold">{s.saleNumber}</td>
                              <td className="py-2 text-nowrap">{formatDate(s.saleDate)}</td>
                              <td className="py-2 fw-semibold text-dark text-truncate" style={{ maxWidth: "160px" }}>
                                {s.productName}
                              </td>
                              <td className="text-center py-2">{s.quantity}</td>
                              <td className="text-end py-2 text-nowrap">{formatFullAmount(s.unitSellingPrice)}</td>
                              <td className="text-end py-2 text-nowrap fw-bold text-dark">{formatFullAmount(s.totalAmount)}</td>
                              <td className="text-center py-2 text-success fw-semibold">
                                +{formatFullAmount(s.profit)}
                              </td>
                              <td className="text-center pe-2 py-2">
                                <span
                                  className={`badge px-2 py-1 ${
                                    s.paymentStatus === "Paid"
                                      ? "bg-light text-dark border"
                                      : "bg-danger-subtle text-danger border border-danger-subtle"
                                  }`}
                                  style={{ fontSize: "0.66rem" }}
                                >
                                  {s.paymentStatus}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                {activeTab === "returns" && (
                  <div className="table-responsive border rounded-2 bg-white">
                    <table className="table table-sm table-hover mb-0" style={{ fontSize: "0.74rem" }}>
                      <thead className="table-light">
                        <tr>
                          <th className="ps-2 py-2">Return Date</th>
                          <th className="py-2">Product Name</th>
                          <th className="py-2">Transfer #</th>
                          <th className="text-center py-2">Qty Returned</th>
                          <th className="pe-2 py-2">Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allReturns.length === 0 ? (
                          <tr>
                            <td colSpan="5" className="text-center text-muted py-3">
                              No returns recorded for this shopkeeper.
                            </td>
                          </tr>
                        ) : (
                          allReturns.map((r, i) => (
                            <tr key={i}>
                              <td className="ps-2 py-2 text-nowrap">{formatDate(r.returnDate)}</td>
                              <td className="py-2 fw-semibold text-dark">{r.productName}</td>
                              <td className="py-2 font-monospace text-secondary">{r.transferNumber}</td>
                              <td className="text-center py-2">
                                <span className="badge bg-light text-dark border px-2 py-1">
                                  {r.quantity}
                                </span>
                              </td>
                              <td className="pe-2 py-2 text-muted small">{r.notes || "—"}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="modal-footer bg-light py-2 px-3">
            <button type="button" className="btn btn-sm btn-outline-secondary px-3 py-2" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
