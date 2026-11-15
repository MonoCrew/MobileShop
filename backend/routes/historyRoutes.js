const express = require("express");
const router = express.Router();
const { getUnifiedHistory } = require("../controllers/historyController");

// Unified History API (Sales, Stock Intakes, Exchanges, Returns)
router.get("/", getUnifiedHistory);

module.exports = router;
