import React, { useRef, useEffect } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { FiHash, FiTruck, FiTag } from "react-icons/fi";
import StockSkeleton from "./StockSkeleton";
import { formatUnit, formatFullAmount } from "../../utils/unitChanger";

export default function StockVirtualGrid({
  items,
  hasMore,
  isLoadingMore,
  onLoadMore,
  onMoveToWarehouse,
  onMoveToShop,
  onSellItem,
  onViewDetails,
  onViewDetail,
  isWarehouse = false,
}) {
  const parentRef = useRef(null);

  // We chunk cards into rows of 3 on desktop / 2 on mobile
  const COLUMNS = 3;
  const rowCount = Math.ceil(items.length / COLUMNS);

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 180,
    overscan: 4,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();

  useEffect(() => {
    if (!virtualRows.length || !hasMore || isLoadingMore) return;
    const lastRow = virtualRows[virtualRows.length - 1];
    if (lastRow.index >= rowCount - 3) {
      onLoadMore();
    }
  }, [virtualRows, hasMore, isLoadingMore, rowCount, onLoadMore]);

  const renderStockBadge = (item) => {
    const avail = item?.availableQuantity ?? item?.quantity ?? 0;
    const transferred = item?.transferredQuantity ?? 0;
    const sold = item?.soldQuantity ?? 0;

    if (avail <= 0 && transferred <= 0 && sold <= 0) {
      return <span className="badge bg-danger rounded-pill px-2 py-1 small">Out of Stock</span>;
    }
    if (avail <= 0 && transferred > 0 && sold <= 0) {
      return <span className="badge bg-primary text-white rounded-pill px-2 py-1 small">Transferred ({transferred})</span>;
    }
    if (avail <= 0 && sold > 0 && transferred <= 0) {
      return <span className="badge bg-secondary text-white rounded-pill px-2 py-1 small">Sold ({sold})</span>;
    }

    return (
      <div className="d-flex align-items-center gap-1 flex-wrap justify-content-end">
        {avail > 0 ? (
          <span className={`badge rounded-pill px-2 py-1 small ${avail <= 20 ? "bg-warning text-dark" : "bg-dark text-white"}`}>
            {avail <= 20 ? `Low: ${avail}` : `${avail} avail`}
          </span>
        ) : (
          <span className="badge bg-danger-subtle text-danger border border-danger-subtle rounded-pill px-1.5 py-0.5" style={{ fontSize: "0.65rem" }}>
            0 avail
          </span>
        )}
        {transferred > 0 && (
          <span className="badge bg-primary-subtle text-primary border border-primary-subtle rounded-pill px-1.5 py-0.5 fw-semibold" style={{ fontSize: "0.65rem" }}>
            {transferred} trsf
          </span>
        )}
        {sold > 0 && (
          <span className="badge bg-secondary-subtle text-secondary border rounded-pill px-1.5 py-0.5" style={{ fontSize: "0.65rem" }}>
            {sold} sold
          </span>
        )}
      </div>
    );
  };

  return (
    <div
      ref={parentRef}
      className="pos-virtual-viewport"
      style={{
        maxHeight: "calc(100vh - 280px)",
        height: rowCount > 0 ? `${Math.min(560, Math.max(160, rowCount * 220 + 20))}px` : "200px",
        overflowY: "auto",
        overflowX: "hidden",
        paddingRight: "4px",
        scrollbarWidth: "none",
        msOverflowStyle: "none",
      }}
    >
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {virtualRows.map((virtualRow) => {
          const startIndex = virtualRow.index * COLUMNS;
          const rowItems = items.slice(startIndex, startIndex + COLUMNS);

          return (
            <div
              key={virtualRow.index}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
                paddingBottom: "12px",
              }}
            >
              <div className="row g-2 g-md-3 h-100">
                {rowItems.map((item) => (
                  <div className="col-12 col-md-4" key={item._id}>
                    <div
                      className="pos-stock-card card rounded-3 h-100 p-3 d-flex flex-column justify-content-between"
                    >
                      <div>
                        {/* Top row: Barcode(s) + Status badge */}
                        <div className="d-flex justify-content-between align-items-start mb-2">
                          {(() => {
                            const count = item.barcodesCount || (Array.isArray(item.barcodes) ? item.barcodes.length : (item.barcode && item.barcode.toUpperCase() !== "N/A" ? 1 : 0));
                            if (count === 0) {
                              return <span className="small text-muted d-flex align-items-center gap-1"><FiHash size={11} /> No IEMI</span>;
                            }
                            if (count === 1) {
                              const singleBc = (Array.isArray(item.barcodes) && item.barcodes[0]) || item.barcode;
                              return <span className="small text-muted font-monospace d-flex align-items-center gap-1" title={singleBc}><FiHash size={11} /> <span className="text-truncate" style={{ maxWidth: "90px" }}>{singleBc}</span></span>;
                            }
                            return (
                              <span className="badge bg-dark-subtle text-dark border d-inline-flex align-items-center gap-1" style={{ fontSize: "0.68rem" }}>
                                <FiTag size={10} /> {count} IEMI Numbers
                                {item.availableBarcodesCount != null && (
                                  <span className="text-success ms-1">({item.availableBarcodesCount} avail)</span>
                                )}
                              </span>
                            );
                          })()}
                          {renderStockBadge(item)}
                        </div>

                        {/* Product Title */}
                        <h6
                          className="fw-bold text-dark mb-1 text-truncate d-flex align-items-center gap-1"
                          title={item.productName}
                        >
                          <span className="text-truncate">{item.productName}</span>
                          {item.isLocalPurchase && (
                            <span
                              className="badge bg-danger-subtle text-danger border border-danger-subtle flex-shrink-0"
                              style={{ fontSize: "0.62rem", fontWeight: "600", padding: "2px 5px" }}
                            >
                              Local Purchase
                            </span>
                          )}
                        </h6>

                        {/* Supplier */}
                        <span className="small text-muted d-flex align-items-center gap-1 text-truncate mb-2">
                          <FiTruck size={12} /> {item.supplier?.name || (typeof item.supplier === "string" ? item.supplier : "Direct Supply")}
                        </span>
                      </div>

                      {/* Card Footer: Price, Total & View button */}
                      <div className="border-top pt-2 mt-2 d-flex justify-content-between align-items-center">
                        <div>
                          <div
                            className="fw-bold text-dark text-nowrap"
                            style={{ fontSize: "0.95rem" }}
                            title={formatFullAmount(item.unitPrice)}
                          >
                            {formatUnit(item.unitPrice)}
                          </div>
                          <span
                            className="text-secondary small text-nowrap d-block"
                            style={{ fontSize: "0.72rem" }}
                            title={formatFullAmount(item.totalPrice)}
                          >
                            Total: {formatUnit(item.totalPrice)}
                          </span>
                        </div>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-dark py-0 px-2 rounded-pill"
                          style={{ fontSize: "0.72rem" }}
                          onClick={() => {
                            const fn = onViewDetail || onViewDetails;
                            if (fn) fn(item);
                          }}
                        >
                          Details
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {isLoadingMore && <StockSkeleton type="bottom" />}
    </div>
  );
}
