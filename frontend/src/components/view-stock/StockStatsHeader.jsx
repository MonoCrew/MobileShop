import React from "react";
import {
  FiPackage,
  FiDollarSign,
  FiCreditCard,
  FiAlertCircle,
  FiLayers,
} from "react-icons/fi";

import { formatUnit, formatFullAmount } from "../../utils/unitChanger";

const formatCurrency = (amount) => formatUnit(amount);

const StockStatsHeader = ({ stats, loading }) => {
  const totalProducts = stats?.totalProducts ?? 0;
  const availableProducts = stats?.availableProducts ?? totalProducts;
  const totalUnits = stats?.totalUnits ?? 0;
  const availableUnits = stats?.availableUnits ?? totalUnits;
  const transferredUnits = stats?.transferredUnits ?? 0;
  const soldUnits = stats?.soldUnits ?? 0;
  const inventoryValue = stats?.inventoryValue ?? 0;
  const paidToSuppliers = stats?.paidToSuppliers ?? 0;
  const remainingToSuppliers = stats?.remainingToSuppliers ?? 0;

  return (
    <div className="row g-2 g-md-3 mb-3">
      {/* Card 1: Available Products & Available / Transferred Units */}
      <div className="col-12 col-sm-6 col-xl-3">
        <div className="card border shadow-sm rounded-3 p-3 h-100 bg-white">
          <div className="d-flex align-items-center justify-content-between mb-1">
            <span className="text-secondary small fw-medium">Available Products</span>
            <div className="p-2 rounded-2 bg-light text-dark">
              <FiPackage size={15} />
            </div>
          </div>
          {loading ? (
            <div>
              <div className="pos-skeleton mb-2" style={{ width: "90px", height: "24px" }} />
              <div className="pos-skeleton" style={{ width: "65px", height: "16px" }} />
            </div>
          ) : (
            <div>
              <div className="h5 fw-bold text-dark mb-0">
                {availableProducts.toLocaleString()} products
                <span className="text-muted fw-normal ms-1" style={{ fontSize: "0.82rem" }}>
                  available
                </span>
              </div>
              <div className="small text-muted fw-medium mt-1.5 pt-1 border-top d-flex align-items-center flex-wrap gap-2" style={{ fontSize: "0.75rem" }}>
                <span className="d-inline-flex align-items-center gap-1 text-success fw-semibold">
                  <span className="rounded-circle bg-success" style={{ width: "6px", height: "6px", display: "inline-block" }} />
                  {availableUnits.toLocaleString()} Available
                </span>
                <span className="text-muted">•</span>
                <span className="d-inline-flex align-items-center gap-1 text-primary fw-semibold">
                  <span className="rounded-circle bg-primary" style={{ width: "6px", height: "6px", display: "inline-block" }} />
                  {transferredUnits.toLocaleString()} Transferred
                </span>
                {soldUnits > 0 && (
                  <>
                    <span className="text-muted">•</span>
                    <span className="d-inline-flex align-items-center gap-1 text-secondary">
                      {soldUnits.toLocaleString()} Sold
                    </span>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Card 2: Inventory Total Value */}
      <div className="col-12 col-sm-6 col-xl-3">
        <div className="card border shadow-sm rounded-3 p-3 h-100 bg-white">
          <div className="d-flex align-items-center justify-content-between mb-1">
            <span className="text-secondary small fw-medium">Inventory Value</span>
            <div className="p-2 rounded-2 bg-light text-dark">
              <FiDollarSign size={15} />
            </div>
          </div>
          {loading ? (
            <div>
              <div className="pos-skeleton mb-2" style={{ width: "120px", height: "24px" }} />
              <div className="pos-skeleton" style={{ width: "80px", height: "14px" }} />
            </div>
          ) : (
            <div>
              <div className="h5 fw-bold text-dark mb-0">
                {formatCurrency(inventoryValue)}
              </div>
              <span className="text-muted" style={{ fontSize: "0.72rem" }}>
                Total purchase valuation
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Card 3: Amount Paid to Suppliers */}
      <div className="col-12 col-sm-6 col-xl-3">
        <div className="card border shadow-sm rounded-3 p-3 h-100 bg-white">
          <div className="d-flex align-items-center justify-content-between mb-1">
            <span className="text-secondary small fw-medium">Paid to Suppliers</span>
            <div className="p-2 rounded-2 bg-light text-dark">
              <FiCreditCard size={15} />
            </div>
          </div>
          {loading ? (
            <div>
              <div className="pos-skeleton mb-2" style={{ width: "120px", height: "24px" }} />
              <div className="pos-skeleton" style={{ width: "70px", height: "14px" }} />
            </div>
          ) : (
            <div>
              <div className="h5 fw-bold text-dark mb-0">
                {formatCurrency(paidToSuppliers)}
              </div>
              <span className="text-muted" style={{ fontSize: "0.72rem" }}>
                Settled supplier payments
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Card 4: Amount Remaining to Suppliers */}
      <div className="col-12 col-sm-6 col-xl-3">
        <div className="card border shadow-sm rounded-3 p-3 h-100 bg-white">
          <div className="d-flex align-items-center justify-content-between mb-1">
            <span className="text-secondary small fw-medium">Remaining to Suppliers</span>
            <div className="p-2 rounded-2 bg-light text-dark">
              <FiAlertCircle size={15} />
            </div>
          </div>
          {loading ? (
            <div>
              <div className="pos-skeleton mb-2" style={{ width: "110px", height: "24px" }} />
              <div className="pos-skeleton" style={{ width: "85px", height: "14px" }} />
            </div>
          ) : (
            <div>
              <div className={`h5 fw-bold mb-0 ${remainingToSuppliers > 0 ? "text-dark" : "text-dark"}`}>
                {formatCurrency(remainingToSuppliers)}
              </div>
              <span className="text-muted" style={{ fontSize: "0.72rem" }}>
                {remainingToSuppliers > 0 ? "Outstanding balance payable" : "All supplier balances settled"}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StockStatsHeader;
