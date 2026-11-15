import React, { useRef, useEffect } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { FiShare2, FiEye } from "react-icons/fi";
import StockSkeleton from "./StockSkeleton";
import StockActionDropdown from "./StockActionDropdown";
import { formatFullAmount } from "../../utils/unitChanger";

export default function StockVirtualTable({
  items,
  hasMore,
  isLoadingMore,
  onLoadMore,
  isLoading = false,
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
    estimateSize: () => 44,
    overscan: 8,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();

  // Proactive 50-chunk fetch trigger when reaching ~80% of loaded rows
  useEffect(() => {
    if (!virtualItems.length || !hasMore || isLoadingMore) return;
    const lastItem = virtualItems[virtualItems.length - 1];
    if (lastItem.index >= items.length - 10) {
      onLoadMore();
    }
  }, [virtualItems, hasMore, isLoadingMore, items.length, onLoadMore]);

  const totalRowSize = rowVirtualizer.getTotalSize();
  const dynamicViewportHeight = items.length > 0
    ? `${Math.min(560, Math.max(140, totalRowSize + 48))}px`
    : "200px";

  const renderStockStatus = (item) => {
    const avail = item?.availableQuantity ?? item?.quantity ?? 0;
    const transferred = item?.transferredQuantity ?? 0;
    const sold = item?.soldQuantity ?? 0;

    // If completely out of stock with no transfers/sales
    if (avail <= 0 && transferred <= 0 && sold <= 0) {
      return (
        <span className="badge bg-danger rounded-pill px-2 py-1" style={{ fontSize: "0.68rem" }}>
          Out of Stock
        </span>
      );
    }

    // If all units were transferred
    if (avail <= 0 && transferred > 0 && sold <= 0) {
      return (
        <span className="badge bg-primary-subtle text-primary border border-primary-subtle rounded-pill px-2 py-1 fw-semibold" style={{ fontSize: "0.68rem" }}>
          All Transferred ({transferred})
        </span>
      );
    }

    // If all units were sold
    if (avail <= 0 && sold > 0 && transferred <= 0) {
      return (
        <span className="badge bg-secondary-subtle text-secondary border rounded-pill px-2 py-1 fw-semibold" style={{ fontSize: "0.68rem" }}>
          All Sold ({sold})
        </span>
      );
    }

    return (
      <div className="d-flex align-items-center justify-content-center flex-wrap gap-1">
        {avail > 0 ? (
          <span
            className={`badge rounded-pill px-1.5 py-0.5 ${
              avail <= 20 ? "bg-warning text-dark" : "bg-dark text-white"
            }`}
            style={{ fontSize: "0.68rem" }}
          >
            {avail <= 20 ? `Low: ${avail}` : `${avail} Avail`}
          </span>
        ) : (
          <span className="badge bg-danger-subtle text-danger border border-danger-subtle rounded-pill px-1.5 py-0.5" style={{ fontSize: "0.65rem" }}>
            0 Avail
          </span>
        )}

        {transferred > 0 && (
          <span
            className="badge bg-primary-subtle text-primary border border-primary-subtle rounded-pill px-1.5 py-0.5 fw-semibold"
            style={{ fontSize: "0.65rem" }}
            title={`${transferred} unit(s) transferred to shopkeeper(s)`}
          >
            {transferred} Transferred
          </span>
        )}

        {sold > 0 && (
          <span
            className="badge bg-secondary-subtle text-secondary border rounded-pill px-1.5 py-0.5"
            style={{ fontSize: "0.65rem" }}
            title={`${sold} unit(s) sold`}
          >
            {sold} Sold
          </span>
        )}
      </div>
    );
  };

  const getPaymentBadge = (status) => {
    if (status === "Paid") return <span className="badge bg-light text-dark border px-2 py-1 fw-medium" style={{ fontSize: "0.68rem" }}>Paid</span>;
    if (status === "Partial") return <span className="badge bg-warning text-dark px-2 py-1" style={{ fontSize: "0.68rem" }}>Partial</span>;
    return <span className="badge bg-danger-subtle text-danger border border-danger-subtle px-2 py-1" style={{ fontSize: "0.68rem" }}>Unpaid</span>;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "—";
    const d = new Date(dateStr);
    return isNaN(d.getTime())
      ? "—"
      : d.toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
        });
  };

  return (
    <div className="card border shadow-sm rounded-3 bg-white overflow-hidden w-100">
      {/* Scrollable Virtual Viewport - strictly zero horizontal scroll */}
      <div
        ref={parentRef}
        className="pos-virtual-viewport"
        style={{
          maxHeight: "calc(100vh - 280px)",
          height: dynamicViewportHeight,
          overflowY: "auto",
          overflowX: "hidden",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
          width: "100%",
        }}
      >
        <div style={{ width: "100%", overflowX: "hidden" }}>
          {/* Sticky Table Header */}
          {isWarehouse ? (
            <div
              className="pos-sticky-table-header d-flex align-items-center px-2 py-2 text-uppercase fw-semibold text-secondary w-100"
              style={{ fontSize: "0.72rem", borderBottom: "1px solid #e4e4e7" }}
            >
              <div style={{ flex: "2.0", minWidth: 0 }}>Product Name</div>
              <div style={{ flex: "1.1", minWidth: 0 }}>IEMI</div>
              <div style={{ flex: "1.1", minWidth: 0 }}>Supplier</div>
              <div style={{ flex: "1.0", minWidth: 0 }} className="pe-2">Purchase Date</div>
              <div style={{ flex: "1.35", minWidth: 0 }} className="text-center">Stock / Status</div>
              <div style={{ flex: "1.0", minWidth: 0 }} className="text-end pe-2">Unit Cost</div>
              <div style={{ flex: "1.0", minWidth: 0 }} className="text-end pe-2">Total Value</div>
              <div style={{ flex: "1.1", minWidth: 0 }} className="text-end pe-2">Est. Sale</div>
            </div>
          ) : (
            <div
              className="pos-sticky-table-header d-flex align-items-center px-2 py-2 text-uppercase fw-semibold text-secondary w-100"
              style={{ fontSize: "0.72rem", borderBottom: "1px solid #e4e4e7" }}
            >
              <div style={{ flex: "2.1", minWidth: 0 }}>Product / Batch</div>
              <div style={{ flex: "1.35", minWidth: 0 }} className="text-center">Stock / Status</div>
              <div style={{ flex: "1.0", minWidth: 0 }} className="text-end pe-2">Total Bill</div>
              <div style={{ flex: "0.95", minWidth: 0 }} className="text-end pe-2">Paid</div>
              <div style={{ flex: "0.95", minWidth: 0 }} className="text-end pe-2">Remaining</div>
              <div style={{ flex: "0.8", minWidth: 0 }} className="text-center">Status</div>
              <div style={{ flex: "1.4", minWidth: 0 }}>Supplier</div>
              <div style={{ flex: "1.0", minWidth: 0 }} className="pe-2">Date</div>
              <div style={{ width: "36px", flexShrink: 0 }} className="text-center">Action</div>
            </div>
          )}

          {/* Fallback loading state */}
          {items.length === 0 && isLoading && (
            <div className="d-flex flex-column p-3 align-items-center justify-content-center py-4 text-secondary">
              <div
                className="spinner-border spinner-border-sm text-dark mb-2"
                style={{ width: "20px", height: "20px" }}
                role="status"
              />
              <span className="small fw-semibold" style={{ fontSize: "0.75rem" }}>Loading stock records...</span>
            </div>
          )}

          {/* Virtual Rows Canvas */}
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
              overflowX: "hidden",
            }}
          >
            {virtualItems.map((virtualRow) => {
              const item = items[virtualRow.index];
              if (!item) return null;

              if (isWarehouse) {
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
                      fontSize: "0.78rem",
                    }}
                    className="pos-stock-row d-flex align-items-center px-2"
                  >
                    {/* Product Name */}
                    <div style={{ flex: "2.2", minWidth: 0 }} className="pe-2 text-truncate">
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

                    {/* Barcode */}
                    <div style={{ flex: "1.2", minWidth: 0 }} className="pe-2 text-truncate">
                      <span
                        className="font-monospace text-secondary text-truncate d-block"
                        style={{ fontSize: "0.72rem" }}
                        title={item.barcode && item.barcode !== "N/A" ? item.barcode : "—"}
                      >
                        {item.barcode && item.barcode !== "N/A" ? item.barcode : "—"}
                      </span>
                    </div>

                    {/* Supplier */}
                    <div style={{ flex: "1.2", minWidth: 0 }} className="pe-2 text-truncate">
                      <span
                        className="text-secondary text-truncate d-block"
                        style={{ fontSize: "0.74rem" }}
                        title={item.supplier?.name || (typeof item.supplier === "string" ? item.supplier : "—")}
                      >
                        {item.supplier?.name || (typeof item.supplier === "string" ? item.supplier : "—")}
                      </span>
                    </div>

                    {/* Purchase Date */}
                    <div style={{ flex: "1.1", minWidth: 0 }} className="pe-2 text-truncate">
                      <span
                        className="text-secondary text-nowrap d-block"
                        style={{ fontSize: "0.74rem" }}
                        title={item.purchaseDate ? new Date(item.purchaseDate).toLocaleDateString() : ""}
                      >
                        {formatDate(item.purchaseDate || item.createdAt)}
                      </span>
                    </div>

                    {/* Stock Availability & Status */}
                    <div style={{ flex: "1.35", minWidth: 0 }} className="text-center pe-1">
                      {renderStockStatus(item)}
                    </div>

                    {/* Unit Cost */}
                    <div style={{ flex: "1.05", minWidth: 0 }} className="pe-2 text-end">
                      <span
                        className="fw-semibold text-dark text-nowrap"
                        style={{ fontSize: "0.76rem" }}
                        title={formatFullAmount(item.unitPrice)}
                      >
                        {formatFullAmount(item.unitPrice)}
                      </span>
                    </div>

                    {/* Total Value */}
                    <div style={{ flex: "1.05", minWidth: 0 }} className="pe-2 text-end">
                      <span
                        className="fw-semibold text-primary text-nowrap"
                        style={{ fontSize: "0.76rem" }}
                        title={formatFullAmount(item.totalPrice)}
                      >
                        {formatFullAmount(item.totalPrice)}
                      </span>
                    </div>

                    {/* Est. Sale Price */}
                    <div style={{ flex: "1.15", minWidth: 0 }} className="pe-2 text-end">
                      <span className="text-dark fw-medium text-nowrap" style={{ fontSize: "0.76rem" }}>
                        {item.estimatedSalePricePerUnit ? formatFullAmount(item.estimatedSalePricePerUnit) : "—"}
                      </span>
                    </div>
                  </div>
                );
              }

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
                    fontSize: "0.78rem",
                    cursor: "pointer",
                  }}
                  className="pos-stock-row d-flex align-items-center px-2"
                  onClick={() => {
                    const fn = onViewDetail || onViewDetails;
                    if (fn) fn(item);
                  }}
                >
                  {/* Product / Batch */}
                  <div style={{ flex: "2.1", minWidth: 0 }} className="pe-2 text-truncate">
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
                      {item.items && item.items.length > 1 && (
                        <span
                          className="badge bg-secondary-subtle text-secondary border flex-shrink-0"
                          style={{ fontSize: "0.62rem", fontWeight: "600", padding: "1px 4px" }}
                        >
                          {item.items.length} items
                        </span>
                      )}
                      {item.isLocalPurchase && (
                        <span
                          className="badge bg-danger-subtle text-danger border border-danger-subtle flex-shrink-0"
                          style={{ fontSize: "0.62rem", fontWeight: "600", padding: "2px 5px" }}
                        >
                          Local
                        </span>
                      )}
                    </span>
                  </div>

                  {/* Stock Availability & Status */}
                  <div style={{ flex: "1.35", minWidth: 0 }} className="text-center pe-1">
                    {renderStockStatus(item)}
                  </div>

                  {/* Total Bill */}
                  <div style={{ flex: "1.0", minWidth: 0 }} className="pe-2 text-end">
                    <span
                      className="fw-semibold text-dark text-nowrap"
                      style={{ fontSize: "0.76rem" }}
                      title={formatFullAmount(item.totalPrice)}
                    >
                      {formatFullAmount(item.totalPrice)}
                    </span>
                  </div>

                  {/* Amount Paid */}
                  <div style={{ flex: "0.95", minWidth: 0 }} className="pe-2 text-end">
                    <span
                      className="text-dark fw-medium text-nowrap"
                      style={{ fontSize: "0.76rem" }}
                      title={formatFullAmount(item.amountPaid)}
                    >
                      {formatFullAmount(item.amountPaid)}
                    </span>
                  </div>

                  {/* Amount Remaining / Due */}
                  <div style={{ flex: "1.0", minWidth: 0 }} className="pe-2 text-end">
                    <span
                      className={`text-nowrap ${Number(item.amountDue) > 0 ? "fw-bold text-danger" : "text-muted"}`}
                      style={{ fontSize: "0.76rem" }}
                      title={formatFullAmount(item.amountDue)}
                    >
                      {formatFullAmount(item.amountDue || 0)}
                    </span>
                  </div>

                  {/* Payment Status Badge */}
                  <div style={{ flex: "0.85", minWidth: 0 }} className="text-center pe-1">
                    {getPaymentBadge(item.paymentStatus)}
                  </div>

                  {/* Supplier */}
                  <div style={{ flex: "1.5", minWidth: 0 }} className="pe-2 text-truncate">
                    <span
                      className="text-secondary text-truncate d-block"
                      style={{ fontSize: "0.74rem" }}
                      title={item.supplier?.name || (typeof item.supplier === "string" ? item.supplier : (item.supplierName || "—"))}
                    >
                      {item.supplier?.name || (typeof item.supplier === "string" ? item.supplier : (item.supplierName || "—"))}
                    </span>
                  </div>

                  {/* Purchase Date */}
                  <div style={{ flex: "1.0", minWidth: 0 }} className="pe-2 text-truncate">
                    <span
                      className="text-secondary text-nowrap d-block"
                      style={{ fontSize: "0.74rem" }}
                      title={item.purchaseDate ? new Date(item.purchaseDate).toLocaleDateString() : ""}
                    >
                      {formatDate(item.purchaseDate || item.createdAt)}
                    </span>
                  </div>

                  {/* Action Buttons: dropdown */}
                  <div
                    style={{ width: "36px", flexShrink: 0 }}
                    className="d-flex align-items-center justify-content-center"
                    onClick={(e) => e.stopPropagation()}
                  >
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

          {/* Bottom Loading Indicator */}
          {isLoadingMore && <StockSkeleton type="bottom" />}
        </div>
      </div>
    </div>
  );
}
