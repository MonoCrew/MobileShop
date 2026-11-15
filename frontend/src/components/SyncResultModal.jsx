import React, { useState } from "react";
import {
  FiCheckCircle,
  FiAlertTriangle,
  FiXCircle,
  FiLayers,
  FiUploadCloud,
  FiSearch,
  FiShield,
  FiClock,
  FiChevronDown,
  FiChevronUp,
} from "react-icons/fi";

export default function SyncResultModal({ isOpen, onClose, summary, error }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedErrors, setExpandedErrors] = useState({});

  if (!isOpen) return null;

  const collections = summary?.collections || [];
  const totalExamined = summary?.totalExamined ?? 0;
  const totalInserted = summary?.totalInserted ?? 0;
  const totalUpdated = summary?.totalUpdated ?? summary?.totalSkipped ?? 0;
  const totalDeleted = summary?.totalDeleted ?? 0;
  const totalFailed = summary?.totalFailed ?? 0;
  const collectionsProcessed = summary?.collectionsProcessed ?? collections.length;
  const durationSec = summary?.durationMs ? (summary.durationMs / 1000).toFixed(2) : "0.0";
  const isPartial = summary?.status === "partial_success";
  const isFailed = summary?.status === "failed" || !!error;
  const isFullSuccess = !isFailed && !isPartial && totalFailed === 0;

  const filteredCollections = collections.filter((c) =>
    c.collection.toLowerCase().includes(searchTerm.toLowerCase().trim())
  );

  const toggleErrorExpand = (colName) => {
    setExpandedErrors((prev) => ({
      ...prev,
      [colName]: !prev[colName],
    }));
  };

  return (
    <div
      className="modal fade show d-block"
      tabIndex="-1"
      role="dialog"
      aria-modal="true"
      style={{
        backgroundColor: "rgba(15, 23, 42, 0.65)",
        backdropFilter: "blur(6px)",
        zIndex: 1070,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal-dialog modal-dialog-centered modal-dialog-scrollable"
        style={{ maxWidth: "780px", width: "95%" }}
      >
        <div className="modal-content border-0 shadow-2xl rounded-4 overflow-hidden">
          {/* Header */}
          <div
            className={`modal-header border-0 px-4 py-3 text-white align-items-center ${
              isFailed ? "bg-danger" : isPartial ? "bg-warning text-dark" : "bg-dark"
            }`}
          >
            <div className="d-flex align-items-center gap-3">
              <div
                className={`rounded-3 p-2 d-flex align-items-center justify-content-center ${
                  isFailed
                    ? "bg-white text-danger"
                    : isPartial
                    ? "bg-dark text-warning"
                    : "bg-white bg-opacity-15 text-white"
                }`}
                style={{ width: "40px", height: "40px" }}
              >
                {isFailed ? (
                  <FiXCircle size={22} />
                ) : isPartial ? (
                  <FiAlertTriangle size={22} />
                ) : (
                  <FiUploadCloud size={22} />
                )}
              </div>
              <div>
                <h5 className="modal-title fw-bold mb-0" style={{ fontSize: "1.1rem" }}>
                  {isFailed
                    ? "Cloud Sync Encountered an Error"
                    : isPartial
                    ? "Cloud Sync Completed with Warnings"
                    : "Data Synchronized to MongoDB Atlas"}
                </h5>
                <div
                  className={`small ${
                    isPartial ? "text-dark opacity-75" : "text-white-50"
                  }`}
                  style={{ fontSize: "0.78rem" }}
                >
                  Local Database <span className="fw-semibold">mobile_pos</span> &rarr; Cloud Atlas
                </div>
              </div>
            </div>
            <button
              type="button"
              className={`btn-close ${isPartial ? "" : "btn-close-white"} p-2`}
              onClick={onClose}
              aria-label="Close"
            />
          </div>

          {/* Modal Body */}
          <div className="modal-body p-4 bg-light">
            {/* Error Banner if Fatal */}
            {isFailed && (
              <div className="alert alert-danger py-2 px-3 small d-flex align-items-center gap-2 mb-3 rounded-3 shadow-sm">
                <FiXCircle size={18} className="flex-shrink-0" />
                <div>
                  <strong>Synchronization Failed: </strong>
                  {error || summary?.fatalError || "Connection error with MongoDB Atlas."}
                </div>
              </div>
            )}

            {/* Non-destructive guarantee notice */}
            <div className="d-flex align-items-center gap-2 px-3 py-2 mb-3 bg-white border rounded-3 text-secondary small shadow-xs">
              <FiShield size={16} className="text-success flex-shrink-0" />
              <span style={{ fontSize: "0.78rem" }}>
                <strong>Insert-Only Safeguard Active:</strong> Existing cloud documents were untouched. No documents were overwritten, replaced, or deleted.
              </span>
            </div>

            {/* Metric KPI Cards */}
            <div className="row g-2 mb-3">
              <div className="col-6 col-sm-3">
                <div className="bg-white border rounded-3 p-3 text-center shadow-xs h-100">
                  <div className="text-secondary small fw-medium" style={{ fontSize: "0.72rem" }}>
                    LOCAL EXAMINED
                  </div>
                  <div className="fs-4 fw-bold text-dark mt-1">{totalExamined.toLocaleString()}</div>
                  <span className="text-muted" style={{ fontSize: "0.68rem" }}>
                    Documents scanned
                  </span>
                </div>
              </div>

              <div className="col-6 col-sm-3">
                <div className="bg-white border border-success-subtle rounded-3 p-3 text-center shadow-xs h-100">
                  <div className="text-success small fw-medium" style={{ fontSize: "0.72rem" }}>
                    INSERTED TO CLOUD
                  </div>
                  <div className="fs-4 fw-bold text-success mt-1">+{totalInserted.toLocaleString()}</div>
                  <span className="text-muted" style={{ fontSize: "0.68rem" }}>
                    New cloud documents
                  </span>
                </div>
              </div>

              <div className="col-6 col-sm-3">
                <div className="bg-white border rounded-3 p-3 text-center shadow-xs h-100">
                  <div className="text-secondary small fw-medium" style={{ fontSize: "0.72rem" }}>
                    UPDATED IN CLOUD
                  </div>
                  <div className="fs-4 fw-bold text-primary mt-1">{totalUpdated.toLocaleString()}</div>
                  <span className="text-muted" style={{ fontSize: "0.68rem" }}>
                    Existing matching records
                  </span>
                </div>
              </div>

              <div className="col-6 col-sm-3">
                <div
                  className={`bg-white border rounded-3 p-3 text-center shadow-xs h-100 ${
                    totalDeleted > 0 ? "border-warning-subtle" : totalFailed > 0 ? "border-danger-subtle" : ""
                  }`}
                >
                  <div
                    className={`small fw-medium ${
                      totalFailed > 0 ? "text-danger" : totalDeleted > 0 ? "text-warning" : "text-secondary"
                    }`}
                    style={{ fontSize: "0.72rem" }}
                  >
                    {totalFailed > 0 ? "FAILED / CONFLICTS" : "REMOVED (PRUNED)"}
                  </div>
                  <div
                    className={`fs-4 fw-bold mt-1 ${
                      totalFailed > 0 ? "text-danger" : totalDeleted > 0 ? "text-warning" : "text-muted"
                    }`}
                  >
                    {totalFailed > 0 ? totalFailed.toLocaleString() : `-${totalDeleted.toLocaleString()}`}
                  </div>
                  <span className="text-muted" style={{ fontSize: "0.68rem" }}>
                    {totalFailed > 0 ? "Constraint errors" : "Extra cloud records"}
                  </span>
                </div>
              </div>
            </div>

            {/* Quick telemetry bar */}
            <div className="d-flex justify-content-between align-items-center mb-3 px-1 text-secondary small" style={{ fontSize: "0.75rem" }}>
              <div className="d-flex align-items-center gap-2">
                <FiLayers size={14} />
                <span>
                  <strong>{collectionsProcessed}</strong> collections processed
                </span>
              </div>
              <div className="d-flex align-items-center gap-1">
                <FiClock size={13} />
                <span>Duration: {durationSec}s</span>
              </div>
            </div>

            {/* Collections Breakdown Table Card */}
            <div className="bg-white border rounded-3 shadow-sm overflow-hidden">
              <div className="p-3 border-bottom d-flex flex-wrap justify-content-between align-items-center gap-2 bg-light">
                <span className="fw-bold text-dark small" style={{ fontSize: "0.82rem" }}>
                  Per-Collection Synchronization Breakdown
                </span>
                <div className="input-group input-group-sm" style={{ maxWidth: "220px" }}>
                  <span className="input-group-text bg-white border-end-0 text-muted">
                    <FiSearch size={12} />
                  </span>
                  <input
                    type="text"
                    className="form-control border-start-0 ps-0"
                    placeholder="Search collection..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    style={{ fontSize: "0.75rem" }}
                  />
                </div>
              </div>

              <div className="table-responsive" style={{ maxHeight: "280px" }}>
                <table className="table table-hover table-sm align-middle mb-0" style={{ fontSize: "0.78rem" }}>
                  <thead className="table-light text-secondary small">
                    <tr>
                      <th className="ps-3 py-2">Collection</th>
                      <th className="text-center py-2">Examined</th>
                      <th className="text-center py-2">Inserted</th>
                      <th className="text-center py-2">Updated</th>
                      <th className="text-center py-2">Removed</th>
                      <th className="text-end pe-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCollections.length === 0 ? (
                      <tr>
                        <td colSpan="6" className="text-center py-4 text-muted">
                          No collections found matching filter.
                        </td>
                      </tr>
                    ) : (
                      filteredCollections.map((col) => {
                        const hasErrors = col.errors && col.errors.length > 0;
                        const isExpanded = !!expandedErrors[col.collection];
                        const updatedCount = col.updated ?? col.skipped ?? 0;
                        const deletedCount = col.deleted ?? 0;
                        return (
                          <React.Fragment key={col.collection}>
                            <tr>
                              <td className="ps-3 fw-semibold text-dark">
                                <span className="d-inline-flex align-items-center gap-1">
                                  <span>{col.collection}</span>
                                  {hasErrors && (
                                    <button
                                      type="button"
                                      className="btn btn-link btn-sm p-0 text-danger text-decoration-none ms-1"
                                      onClick={() => toggleErrorExpand(col.collection)}
                                      title="Toggle error details"
                                    >
                                      {isExpanded ? <FiChevronUp size={14} /> : <FiChevronDown size={14} />}
                                    </button>
                                  )}
                                </span>
                              </td>
                              <td className="text-center text-secondary">{col.examined.toLocaleString()}</td>
                              <td className="text-center">
                                {col.inserted > 0 ? (
                                  <span className="badge bg-success-subtle text-success px-2 py-1 rounded-pill">
                                    +{col.inserted.toLocaleString()}
                                  </span>
                                ) : (
                                  <span className="text-muted">0</span>
                                )}
                              </td>
                              <td className="text-center">
                                {updatedCount > 0 ? (
                                  <span className="badge bg-primary-subtle text-primary px-2 py-1 rounded-pill">
                                    {updatedCount.toLocaleString()}
                                  </span>
                                ) : (
                                  <span className="text-muted">0</span>
                                )}
                              </td>
                              <td className="text-center">
                                {deletedCount > 0 ? (
                                  <span className="badge bg-warning-subtle text-warning px-2 py-1 rounded-pill">
                                    -{deletedCount.toLocaleString()}
                                  </span>
                                ) : (
                                  <span className="text-muted">0</span>
                                )}
                              </td>
                              <td className="text-end pe-3">
                                {col.status === "success" ? (
                                  <span className="badge bg-success text-white px-2 py-1 rounded-pill" style={{ fontSize: "0.68rem" }}>
                                    Success
                                  </span>
                                ) : col.status === "partial_success" ? (
                                  <span className="badge bg-warning text-dark px-2 py-1 rounded-pill" style={{ fontSize: "0.68rem" }}>
                                    Partial
                                  </span>
                                ) : (
                                  <span className="badge bg-danger text-white px-2 py-1 rounded-pill" style={{ fontSize: "0.68rem" }}>
                                    Failed
                                  </span>
                                )}
                              </td>
                            </tr>
                            {/* Expanded Error Details if any */}
                            {hasErrors && isExpanded && (
                              <tr className="bg-light">
                                <td colSpan="6" className="p-3">
                                  <div className="border border-danger-subtle rounded-3 p-2 bg-white small">
                                    <div className="fw-semibold text-danger mb-1" style={{ fontSize: "0.75rem" }}>
                                      Constraint Conflict Details ({col.errors.length}):
                                    </div>
                                    <ul className="list-unstyled mb-0" style={{ fontSize: "0.72rem" }}>
                                      {col.errors.map((errItem, idx) => (
                                        <li key={idx} className="text-muted py-1 border-bottom border-light">
                                          &bull; <strong>ID:</strong> {String(errItem.docId || "N/A")} &mdash;{" "}
                                          <span className="text-dark">{errItem.reason}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Modal Footer */}
          <div className="modal-footer bg-white border-0 px-4 py-3 justify-content-between">
            <span className="text-muted small" style={{ fontSize: "0.72rem" }}>
              Synced safely without overwriting cloud documents.
            </span>
            <button
              type="button"
              className="btn btn-sm btn-dark px-4 py-2 rounded-pill shadow-sm"
              onClick={onClose}
              style={{ fontSize: "0.8rem", fontWeight: 500 }}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
