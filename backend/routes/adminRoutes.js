const express = require("express");
const router = express.Router();
const { requireAuth, requireAdmin } = require("../middleware/auth");
const {
  handleSyncLocalToCloud,
  handleGetSyncStatus,
} = require("../controllers/syncController");
/**
 * POST /api/admin/clear-cache
 * No-op endpoint maintained for backward compatibility
 */
router.all("/clear-cache", (req, res) => {
  return res.json({ success: true, message: "In-memory caching is disabled." });
});

/**
 * POST /api/admin/sync-local-to-cloud
 * Initiates safe, insert-only synchronization from local MongoDB to Atlas.
 * Restricts access to authenticated administrators only.
 */
router.post("/sync-local-to-cloud", requireAuth, requireAdmin, handleSyncLocalToCloud);

/**
 * GET /api/admin/sync-status
 * Returns current lock status of synchronization.
 */
router.get("/sync-status", requireAuth, requireAdmin, handleGetSyncStatus);

module.exports = router;
