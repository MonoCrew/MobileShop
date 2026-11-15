import React from "react";

export default function StockSkeleton({ type = "table", count = 8 }) {
  if (type === "bottom") {
    return (
      <div className="d-flex align-items-center justify-content-center py-3 text-muted gap-2">
        <div
          className="spinner-border spinner-border-sm text-dark"
          style={{ width: "16px", height: "16px" }}
          role="status"
        />
        <span className="small fw-medium">Loading next 50 records from database...</span>
      </div>
    );
  }

  if (type === "grid") {
    return (
      <div className="row g-3">
        {Array.from({ length: count }).map((_, idx) => (
          <div className="col-12 col-sm-6 col-lg-4 col-xl-3" key={idx}>
            <div className="card border shadow-sm rounded-3 p-3 bg-white h-100">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <div className="pos-skeleton-bar" style={{ width: "40%", height: "14px" }} />
                <div className="pos-skeleton-bar" style={{ width: "25%", height: "18px", borderRadius: "10px" }} />
              </div>
              <div className="pos-skeleton-bar mb-2" style={{ width: "80%", height: "16px" }} />
              <div className="pos-skeleton-bar mb-3" style={{ width: "55%", height: "12px" }} />
              <div className="border-top pt-2 mt-auto d-flex justify-content-between align-items-center">
                <div className="pos-skeleton-bar" style={{ width: "35%", height: "18px" }} />
                <div className="pos-skeleton-bar" style={{ width: "25%", height: "14px" }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (type === "compact") {
    return (
      <div className="card border shadow-sm rounded-3 bg-white p-2">
        {Array.from({ length: count }).map((_, idx) => (
          <div
            key={idx}
            className="d-flex align-items-center justify-content-between py-3 px-3 border-bottom"
          >
            <div className="d-flex align-items-center gap-3 w-50">
              <div className="pos-skeleton-bar" style={{ width: "24px", height: "24px", borderRadius: "4px" }} />
              <div className="w-75">
                <div className="pos-skeleton-bar mb-1" style={{ width: "70%", height: "13px" }} />
                <div className="pos-skeleton-bar" style={{ width: "40%", height: "10px" }} />
              </div>
            </div>
            <div className="pos-skeleton-bar" style={{ width: "60px", height: "14px" }} />
            <div className="pos-skeleton-bar" style={{ width: "70px", height: "14px" }} />
            <div className="pos-skeleton-bar" style={{ width: "50px", height: "18px", borderRadius: "10px" }} />
          </div>
        ))}
      </div>
    );
  }

  // Default: Table skeleton matching StockVirtualTable structure
  return (
    <div className="card border shadow-sm rounded-3 bg-white overflow-hidden">
      {/* Prominent Loading Status Bar */}
  <div className="d-flex align-items-center justify-content-center py-4 bg-light-subtle border-bottom">
    <div
        className="spinner-border text-dark"
        style={{
            width: "28px",
            height: "28px",
            borderWidth: "3px",
        }}
        role="status"
        aria-label="Loading"
    />
</div>

      <div
        className="pos-virtual-viewport"
        style={{
          overflowX: "auto",
          overflowY: "hidden",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
        }}
      >
        <div style={{ minWidth: "920px" }}>
          {/* Header matching real table */}
          <div
            className="pos-sticky-table-header d-flex align-items-center px-2 py-2 text-uppercase fw-semibold text-secondary border-bottom bg-light w-100"
            style={{ fontSize: "0.72rem" }}
          >
            <div style={{ flex: "2.8", minWidth: 0 }}>Product Name</div>
            <div style={{ flex: "1.05", minWidth: 0 }} className="text-end pe-2">Unit Price</div>
            <div style={{ flex: "1.0", minWidth: 0 }} className="text-end pe-2">Paid</div>
            <div style={{ flex: "0.85", minWidth: 0 }} className="text-center">Available</div>
            <div style={{ flex: "1.2", minWidth: 0 }} className="pe-2">Purchase Date</div>
            <div style={{ flex: "1.8", minWidth: 0 }}>Supplier</div>
            <div style={{ flex: "1.05", minWidth: 0 }} className="text-end pe-2">Total Value</div>
          </div>

          {/* Skeleton Rows matching real table column widths */}
          <div>
            {Array.from({ length: count }).map((_, idx) => (
              <div
                key={idx}
                className="d-flex align-items-center px-2 py-2 border-bottom w-100"
                style={{ height: "44px" }}
              >
                <div style={{ flex: "2.8", minWidth: 0 }} className="pe-2">
                  <div className="pos-skeleton-bar mb-1" style={{ width: "70%", height: "14px" }} />
                </div>
                <div style={{ flex: "1.05", minWidth: 0 }} className="pe-2 text-end">
                  <div className="pos-skeleton-bar ms-auto" style={{ width: "70%", height: "14px" }} />
                </div>
                <div style={{ flex: "1.0", minWidth: 0 }} className="pe-2 text-end">
                  <div className="pos-skeleton-bar ms-auto" style={{ width: "70%", height: "14px" }} />
                </div>
                <div style={{ flex: "0.85", minWidth: 0 }} className="text-center pe-1">
                  <div className="pos-skeleton-bar mx-auto" style={{ width: "45px", height: "18px", borderRadius: "10px" }} />
                </div>
                <div style={{ flex: "1.2", minWidth: 0 }} className="pe-2">
                  <div className="pos-skeleton-bar" style={{ width: "60%", height: "14px" }} />
                </div>
                <div style={{ flex: "1.8", minWidth: 0 }} className="pe-2">
                  <div className="pos-skeleton-bar" style={{ width: "65%", height: "14px" }} />
                </div>
                <div style={{ flex: "1.05", minWidth: 0 }} className="pe-2 text-end">
                  <div className="pos-skeleton-bar ms-auto" style={{ width: "60%", height: "14px" }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
