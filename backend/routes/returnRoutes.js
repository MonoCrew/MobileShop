const express = require("express");
const router = express.Router();
const {
  lookupReturn,
  searchReturnProducts,
  processReturn,
  getReturns,
  getReturnById,
} = require("../controllers/returnController");

router.get("/lookup", lookupReturn);
router.get("/search", searchReturnProducts);
router.get("/search-products", searchReturnProducts);
router.post("/", processReturn);
router.get("/", getReturns);
router.get("/:id", getReturnById);

module.exports = router;
