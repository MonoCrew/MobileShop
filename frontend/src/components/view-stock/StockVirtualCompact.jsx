import React, { useRef, useEffect } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { FiHash, FiTag, FiShare2, FiEye } from "react-icons/fi";
import StockSkeleton from "./StockSkeleton";
import StockActionDropdown from "./StockActionDropdown";
import { formatFullAmount } from "../../utils/unitChanger";

export default function StockVirtualCompact({
  items,
  hasMore,
  isLoadingMore,
  onLoadMore,
  onMoveToWarehouse,
  onMoveToShop,
  onSellItem,
  onGiveToShopkeeper,
  onViewDetails,
  onViewDetail,
  isWarehouse = false,
}) {
  const parentRef = useRef(null);

  const rowVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 42,
    overscan: 10,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();

  useEffect(() => {
    if (!virtualItems.length || !hasMore || isLoadingMore) return;
    const lastItem = virtualItems[virtualItems.length - 1];
    if (lastItem.index >= items.length - 10) {
      onLoadMore();
    }
  }, [virtualItems, hasMore, isLoadingMore, items.length, onLoadMore]);

  return (
    <div className="card border shadow-sm rounded-3 bg-white overflow-hidden">
      <div
        ref={parentRef}
        className="pos-virtual-viewport"
        style={{
          maxHeight: "calc(100vh - 280px)",
          height: items.length > 0 ? `${Math.min(560, Math.max(140, items.length * 44 + 48))}px` : "200px",
          overflowY: "auto",
          overflowX: "hidden",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
          width: "100%",
        }}
      >
        <div style={{ width: "100%", overflowX: "hidden" }}>
          {/* Compact Header */}
          <div
            className="pos-sticky-table-header d-flex align-items-center px-2 py-2 text-uppercase fw-semibold text-secondary w-100"
            style={{ fontSize: "0.72rem" }}
          >
            <div style={{ flex: "2.8", minWidth: 0 }}>Product Name</div>
            <div style={{ flex: "1.4", minWidth: 0 }}>IEMI</div>
            <div style={{ flex: "1.4", minWidth: 0 }}>Supplier</div>
            <div style={{ flex: "1", minWidth: 0 }}>Stock</div>
            <div style={{ flex: "1", minWidth: 0 }}>Price</div>
            <div style={{ flex: "1.1", minWidth: 0 }}>{isWarehouse ? "Total Value" : "Status"}</div>
            <div style={{ width: "32px", flexShrink: 0 }} className="text-center"></div>
          </div>

          {/* Virtual Items */}
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {virtualItems.map((virtualRow) => {
              const item = items[virtualRow.index];
              if (!item) return null;

              return (
                <div
                  key={item._id || virtualRow.index}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                    cursor: "pointer",
                  }}
                  className="pos-compact-row d-flex align-items-center px-2"
                  onClick={() => {
                    const fn = onViewDetail || onViewDetails;
                    if (fn) fn(item);
                  }}
                >
                  {/* Name */}
                  <div style={{ flex: "2.8", minWidth: 0 }} className="pe-2 text-truncate">
                    <span className="fw-semibold text-dark text-truncate d-flex align-items-center gap-1" title={item.productName} style={{ fontSize: "0.8rem" }}>
                      <span className="text-truncate">{item.productName}</span>
                      {(item.storage || item.color) && (
                        <span
                          className="badge bg-secondary-subtle text-dark border flex-shrink-0"
                          style={{ fontSize: "0.62rem", fontWeight: "600", padding: "1px 4px" }}
                        >
                          {[item.storage, item.color].filter(Boolean).join(" • ")}
                        </span>
                      )}
                      {item.isLocalPurchase && (
                        <span
                          className="badge bg-danger-subtle text-danger border border-danger-subtle flex-shrink-0"
                          style={{ fontSize: "0.62rem", fontWeight: "600", padding: "2px 5px" }}
                        >
                          Local Purchase
                        </span>
                      )}
                    </span>
                  </div>

                  {/* Barcode(s) */}
                  <div style={{ flex: "1.4", minWidth: 0 }} className="pe-2 text-truncate">
                    {(() => {
                      const count = item.barcodesCount || (Array.isArray(item.barcodes) ? item.barcodes.length : (item.barcode && item.barcode.toUpperCase() !== "N/A" ? 1 : 0));
                      if (count === 0) {
                        return <span className="text-muted small">—</span>;
                      }
                      if (count === 1) {
                        const singleBc = (Array.isArray(item.barcodes) && item.barcodes[0]) || item.barcode;
                        return (
                          <span className="font-monospace text-muted small text-truncate d-block" title={singleBc}>
                            {singleBc}
                          </span>
                        );
                      }
                      return (
                        <span className="badge bg-dark-subtle text-dark border d-inline-flex align-items-center gap-1" style={{ fontSize: "0.68rem" }}>
                          <FiTag size={9} /> {count} Barcodes
                          {item.availableBarcodesCount != null && (
                            <span className="text-success ms-1">({item.availableBarcodesCount} avail)</span>
                          )}
                        </span>
                      );
                    })()}
                  </div>

                  {/* Supplier */}
                  <div style={{ flex: "1.4", minWidth: 0 }} className="pe-2 text-truncate">
                    <span className="text-secondary small text-truncate d-block" style={{ fontSize: "0.74rem" }}>
                      {item.supplier?.name || (typeof item.supplier === "string" ? item.supplier : "—")}
                    </span>
                  </div>

                  {/* Stock */}
                  <div style={{ flex: "1.1", minWidth: 0 }} className="pe-1 text-center">
                    {(() => {
                      const avail = item?.availableQuantity ?? item?.quantity ?? 0;
                      const transferred = item?.transferredQuantity ?? 0;
                      const sold = item?.soldQuantity ?? 0;

                      if (avail <= 0 && transferred <= 0 && sold <= 0) {
                        return <span className="badge bg-danger rounded-pill px-2 py-0.5" style={{ fontSize: "0.68rem" }}>0</span>;
                      }
                      if (avail <= 0 && transferred > 0 && sold <= 0) {
                        return <span className="badge bg-primary text-white rounded-pill px-1.5 py-0.5" style={{ fontSize: "0.64rem" }}>{transferred} trsf</span>;
                      }
                      if (avail <= 0 && sold > 0 && transferred <= 0) {
                        return <span className="badge bg-secondary text-white rounded-pill px-1.5 py-0.5" style={{ fontSize: "0.64rem" }}>{sold} sold</span>;
                      }

                      return (
                        <div className="d-flex align-items-center justify-content-center gap-1 flex-wrap">
                          <span
                            className={`badge rounded-pill px-1.5 py-0.5 ${
                              avail <= 0 ? "bg-danger" : avail <= 20 ? "bg-warning text-dark" : "bg-dark text-white"
                            }`}
                            style={{ fontSize: "0.68rem" }}
                          >
                            {avail}
                          </span>
                          {transferred > 0 && (
                            <span className="badge bg-primary-subtle text-primary border border-primary-subtle rounded-pill px-1 py-0.5 fw-semibold" style={{ fontSize: "0.62rem" }} title={`${transferred} transferred`}>
                              +{transferred}t
                            </span>
                          )}
                          {sold > 0 && (
                            <span className="badge bg-secondary-subtle text-secondary border rounded-pill px-1 py-0.5" style={{ fontSize: "0.62rem" }} title={`${sold} sold`}>
                              +{sold}s
                            </span>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Price */}
                  <div style={{ flex: "1", minWidth: 0 }} className="pe-2 text-end text-nowrap">
                    <span className="fw-medium text-dark small" style={{ fontSize: "0.76rem" }}>
                      {formatFullAmount(item.unitPrice)}
                    </span>
                  </div>

                  {/* Payment / Total Value */}
                  <div style={{ flex: "1.1", minWidth: 0 }} className="pe-2 text-end text-nowrap">
                    {isWarehouse ? (
                      <span className="fw-semibold text-primary" style={{ fontSize: "0.76rem" }}>
                        {formatFullAmount(item.totalPrice)}
                      </span>
                    ) : (
                      <span
                        className={`badge small ${
                          item.paymentStatus === "Paid"
                            ? "bg-light text-dark border"
                            : item.paymentStatus === "Partial"
                            ? "bg-warning text-dark"
                            : "bg-danger-subtle text-danger"
                        }`}
                        style={{ fontSize: "0.68rem" }}
                      >
                        {item.paymentStatus}
                      </span>
                    )}
                  </div>

                  {/* Three-Dot Action Menu */}
                  <div style={{ width: "32px", flexShrink: 0 }} className="d-flex align-items-center justify-content-center" onClick={(e) => e.stopPropagation()}>
                    <StockActionDropdown
                      actions={[
                        {
                          label: "Stock Details",
                          icon: <FiEye size={13} />,
                          onClick: () => {
                            const fn = onViewDetail || onViewDetails;
                            if (fn) fn(item);
                          },
                        },
                        {
                          label: "Give to Another Shopkeeper",
                          icon: <FiShare2 size={13} />,
                          disabled: (item.quantity || 0) <= 0,
                          onClick: () => onGiveToShopkeeper && onGiveToShopkeeper(item),
                        },
                      ]}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {isLoadingMore && <StockSkeleton type="bottom" />}
        </div>
      </div>
    </div>
  );
}
