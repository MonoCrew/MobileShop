const express = require("express");
const router = express.Router();
const {
  getCustomers,
  getCustomerById,
  createCustomer,
  settleBalance,
} = require("../controllers/customerController");

router.get("/", getCustomers);
router.post("/", createCustomer);
router.get("/:id", getCustomerById);
router.post("/:id/settle-balance", settleBalance);

module.exports = router;
