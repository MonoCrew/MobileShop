const { syncLocalToCloud, getSyncProgressStatus } = require("../services/syncService");

/**
 * POST /api/admin/sync-local-to-cloud
 * Trigger authenticated, insert-only database synchronization to MongoDB Atlas.
 */
const handleSyncLocalToCloud = async (req, res) => {
  try {
    const { batchSize } = req.body || {};
    const summary = await syncLocalToCloud({ batchSize });

    const isFullSuccess = summary.status === "success";
    return res.status(200).json({
      success: true,
      status: summary.status,
      message: isFullSuccess
        ? "Local data successfully synchronized to MongoDB Atlas."
        : "Synchronization completed with some items skipped or requiring review.",
      summary,
    });
  } catch (error) {
    console.error("[Sync] Synchronization error:", error.message);
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      status: "failed",
      message: error.message || "An unexpected error occurred during database synchronization.",
      summary: error.summary || null,
    });
  }
};

/**
 * GET /api/admin/sync-status
 * Check current synchronization lock status.
 */
const handleGetSyncStatus = (req, res) => {
  const status = getSyncProgressStatus();
  return res.status(200).json({
    success: true,
    ...status,
  });
};

module.exports = {
  handleSyncLocalToCloud,
  handleGetSyncStatus,
};
