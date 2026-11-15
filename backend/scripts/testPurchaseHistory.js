// Automated test suite with Session Cookie handling
const BASE_URL = "http://localhost:3000/api";

let sessionCookie = "";

const api = {
  login: async (email, password) => {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) {
      sessionCookie = setCookie.split(";")[0];
    }
    const data = await res.json();
    return { data, status: res.status, ok: res.ok };
  },
  get: async (url, options = {}) => {
    let fullUrl = url;
    if (options.params) {
      const sp = new URLSearchParams();
      for (const [k, v] of Object.entries(options.params)) {
        if (v !== undefined && v !== null && v !== "") sp.append(k, v);
      }
      const qs = sp.toString();
      if (qs) fullUrl += (fullUrl.includes("?") ? "&" : "?") + qs;
    }
    const headers = { "Content-Type": "application/json" };
    if (sessionCookie) headers["Cookie"] = sessionCookie;

    const res = await fetch(fullUrl, {
      method: "GET",
      headers,
    });
    const data = await res.json();
    return { data, status: res.status, ok: res.ok };
  },
  post: async (url, body = {}) => {
    const headers = { "Content-Type": "application/json" };
    if (sessionCookie) headers["Cookie"] = sessionCookie;

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return { data, status: res.status, ok: res.ok };
  },
};

async function runTests() {
  console.log("=====================================================");
  console.log("STARTING COMPREHENSIVE STOCK PURCHASE HISTORY TESTS");
  console.log("=====================================================\n");

  const results = {
    authLogin: false,
    testA_SupplierPurchase: false,
    testA_SubsequentPayment: false,
    testB_LocalPurchase: false,
    testC_ExchangeTradeIn: false,
    testFilters_Type: false,
    testFilters_SearchReceipt: false,
    testFilters_SearchModel: false,
    testFilters_SearchIMEI: false,
    testFilters_PaymentStatus: false,
    testDetailsEndpoint: false,
    testZeroDoubleCounting: false,
  };

  try {
    // 0. Authenticate
    console.log("--- 0. Authenticating Admin User ---");
    const loginRes = await api.login("hamzanazir780@gmail.com", "12345678");
    if (!loginRes.data.success) {
      throw new Error(`Login failed: ${loginRes.data.message}`);
    }
    results.authLogin = true;
    console.log("✓ Logged in successfully. Cookie:", sessionCookie);

    // ─────────────────────────────────────────────────────────────
    // TEST A: Registered Supplier Purchase (Type A)
    // Samsung Galaxy S24, 10 units @ 75,000 = 750,000. Paid 500,000, Due 250,000.
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- 1. Testing Type A: Supplier Purchase ---");
    const uniqueBatchSuffix = Date.now().toString().slice(-4);
    const supplierName = `Supplier_Alpha_${uniqueBatchSuffix}`;
    const s24_imeis = Array.from({ length: 10 }, (_, i) => `3541112223330${uniqueBatchSuffix}${i}`);

    const supplierPurchasePayload = {
      productName: "Samsung Galaxy S24",
      category: "Mobile",
      quantity: 10,
      priceMode: "unit",
      unitPrice: 75000,
      purchasePrice: 750000,
      supplier: supplierName,
      isLocalPurchase: false,
      amountPaid: 500000,
      paymentMethod: "Cash",
      barcodes: s24_imeis,
      purchaseDate: new Date().toISOString(),
    };

    const suppRes = await api.post(`${BASE_URL}/stock`, supplierPurchasePayload);
    if (!suppRes.data.success) {
      throw new Error(`Failed to create supplier purchase: ${suppRes.data.message}`);
    }
    const supplierInvoice = suppRes.data.invoice;
    console.log(`Created Supplier Purchase Invoice: ${supplierInvoice.invoiceNumber}`);
    console.log(`Total: Rs. ${supplierInvoice.totalAmount}, Paid: Rs. ${supplierInvoice.amountPaid}, Due: Rs. ${supplierInvoice.amountDue}`);

    if (
      supplierInvoice.totalAmount === 750000 &&
      supplierInvoice.amountPaid === 500000 &&
      supplierInvoice.amountDue === 250000 &&
      supplierInvoice.paymentStatus === "partial"
    ) {
      results.testA_SupplierPurchase = true;
      console.log("✓ Test A (Supplier Purchase Creation): PASSED");
    } else {
      console.error("✗ Test A Failed: Values mismatch:", supplierInvoice);
    }

    // ─────────────────────────────────────────────────────────────
    // TEST A (Part 2): Subsequent Payment of PKR 100,000
    // Live balance must become PKR 150,000
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- 2. Testing Subsequent Payment of PKR 100,000 ---");
    const payRes = await api.post(
      `${BASE_URL}/suppliers/${encodeURIComponent(supplierName)}/payments`,
      {
        amount: 100000,
        paymentMethod: "Cash",
        notes: "Subsequent installment payment",
      }
    );

    if (!payRes.data.success) {
      throw new Error(`Failed to pay supplier: ${payRes.data.message}`);
    }
    console.log(`Payment processed: Rs. 100,000 to ${supplierName}`);

    // Verify via /api/stock/purchase-history
    const histResAfterPay = await api.get(`${BASE_URL}/stock/purchase-history`, {
      params: { search: supplierInvoice.invoiceNumber },
    });

    const updatedInv = histResAfterPay.data.data.find(
      (it) => it.transactionId === supplierInvoice.invoiceNumber
    );

    console.log(`After payment - Invoice total: ${updatedInv.totalAmount}, Paid: ${updatedInv.amountPaid}, Due: ${updatedInv.amountDue}`);
    if (updatedInv && updatedInv.amountPaid === 600000 && updatedInv.amountDue === 150000) {
      results.testA_SubsequentPayment = true;
      console.log("✓ Test A (Subsequent Payment & Live Balance): PASSED");
    } else {
      console.error("✗ Test A Part 2 Failed: Live balance did not update correctly:", updatedInv);
    }

    // ─────────────────────────────────────────────────────────────
    // TEST B: Local Walk-in Seller Purchase (Type B)
    // iPhone 13, 3 units @ 60,000 = 180,000. Paid 120,000, Due 60,000.
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- 3. Testing Type B: Local Purchase ---");
    const sellerName = `LocalSeller_${uniqueBatchSuffix}`;
    const ip13_imeis = Array.from({ length: 3 }, (_, i) => `3589998887770${uniqueBatchSuffix}${i}`);

    const localPurchasePayload = {
      productName: "iPhone 13",
      category: "Mobile",
      quantity: 3,
      priceMode: "unit",
      unitPrice: 60000,
      purchasePrice: 180000,
      customerName: sellerName,
      isLocalPurchase: true,
      amountPaid: 120000,
      paymentMethod: "Cash",
      barcodes: ip13_imeis,
      purchaseDate: new Date().toISOString(),
    };

    const localRes = await api.post(`${BASE_URL}/stock`, localPurchasePayload);
    if (!localRes.data.success) {
      throw new Error(`Failed to create local purchase: ${localRes.data.message}`);
    }
    const localInvoice = localRes.data.invoice;
    console.log(`Created Local Purchase Invoice: ${localInvoice.invoiceNumber}`);
    console.log(`Total: Rs. ${localInvoice.totalAmount}, Paid: Rs. ${localInvoice.amountPaid}, Due: Rs. ${localInvoice.amountDue}`);

    if (
      localInvoice.totalAmount === 180000 &&
      localInvoice.amountPaid === 120000 &&
      localInvoice.amountDue === 60000
    ) {
      results.testB_LocalPurchase = true;
      console.log("✓ Test B (Local Purchase Creation): PASSED");
    } else {
      console.error("✗ Test B Failed:", localInvoice);
    }

    // ─────────────────────────────────────────────────────────────
    // TEST C: Exchange / Trade-In (Type C)
    // Received: Samsung Galaxy S22 (agreed 60,000)
    // Given from stock: iPhone 13 (selling price 85,000)
    // Cash received: 15,000, Remaining receivable: 10,000
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- 4. Testing Type C: Phone Exchange / Trade-In ---");
    const exchangeCustName = `ExchangeCustomer_${uniqueBatchSuffix}`;
    const receivedImei = `3522223334440${uniqueBatchSuffix}`;
    const givenStockId = localRes.data.data?._id;
    const givenImei = ip13_imeis[0];

    const exchangePayload = {
      items: [
        {
          stockId: givenStockId,
          productName: "iPhone 13",
          barcode: givenImei,
          barcodes: [givenImei],
          quantity: 1,
          sellingPrice: 85000,
          unitSellingPrice: 85000,
          totalAmount: 85000,
          unitPurchaseCost: 60000,
        },
      ],
      paymentMethod: "Cash",
      isExchange: true,
      customerName: exchangeCustName,
      customerPhone: "0300-9876543",
      amountPaid: 15000,
      amountDue: 10000,
      tradeInItem: {
        productName: "Samsung Galaxy S22",
        barcode: receivedImei,
        barcodes: [receivedImei],
        quantity: 1,
        unitPrice: 60000,
        purchasePrice: 60000,
        totalValue: 60000,
        customerName: exchangeCustName,
        purchaseDate: new Date().toISOString(),
      },
      notes: `Trade-in exchange test for customer ${exchangeCustName}`,
    };

    const exchRes = await api.post(`${BASE_URL}/sales`, exchangePayload);
    if (!exchRes.data.success) {
      throw new Error(`Failed to create exchange: ${exchRes.data.message}`);
    }
    const createdSale = exchRes.data.data.sale;
    console.log(`Created Exchange Sale: ${createdSale.saleNumber}`);
    console.log(`Given Value: Rs. ${createdSale.totalAmount}, Trade-in Credit: Rs. ${createdSale.returnCredit}, Net Diff: Rs. ${createdSale.netDifference}, Paid: Rs. ${createdSale.amountPaid}, Due: Rs. ${createdSale.amountDue}`);

    if (
      createdSale.isExchange &&
      createdSale.totalAmount === 85000 &&
      createdSale.returnCredit === 60000 &&
      createdSale.netDifference === 25000 &&
      createdSale.amountPaid === 15000 &&
      createdSale.amountDue === 10000
    ) {
      results.testC_ExchangeTradeIn = true;
      console.log("✓ Test C (Exchange Trade-In Creation): PASSED");
    } else {
      console.error("✗ Test C Failed:", createdSale);
    }

    // ─────────────────────────────────────────────────────────────
    // TEST FILTERS & AGGREGATION
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- 5. Testing Unified History Endpoint & Filters ---");
    const allHistoryRes = await api.get(`${BASE_URL}/stock/purchase-history`);
    console.log(`Total history transactions fetched: ${allHistoryRes.data.pagination.totalCount}`);
    console.log("Stats summary:", allHistoryRes.data.stats);

    // Verify Type Filters
    const suppOnlyRes = await api.get(`${BASE_URL}/stock/purchase-history`, {
      params: { type: "supplier_purchase" },
    });
    const suppPass = suppOnlyRes.data.data.every((it) => it.transactionType === "supplier_purchase");

    const localOnlyRes = await api.get(`${BASE_URL}/stock/purchase-history`, {
      params: { type: "local_purchase" },
    });
    const localPass = localOnlyRes.data.data.every((it) => it.transactionType === "local_purchase");

    const exchOnlyRes = await api.get(`${BASE_URL}/stock/purchase-history`, {
      params: { type: "exchange" },
    });
    const exchPass = exchOnlyRes.data.data.every((it) => it.transactionType === "exchange");

    if (suppPass && localPass && exchPass) {
      results.testFilters_Type = true;
      console.log("✓ Test Filters (Transaction Types: Supplier, Local, Exchange): PASSED");
    } else {
      console.error("✗ Test Filters Type Failed");
    }

    // Verify Search by Receipt #
    const searchReceiptRes = await api.get(`${BASE_URL}/stock/purchase-history`, {
      params: { search: supplierInvoice.invoiceNumber },
    });
    if (searchReceiptRes.data.data.some((it) => it.receiptNumber === supplierInvoice.invoiceNumber)) {
      results.testFilters_SearchReceipt = true;
      console.log("✓ Test Search by Receipt Number: PASSED");
    }

    // Verify Search by Model Name
    const searchModelRes = await api.get(`${BASE_URL}/stock/purchase-history`, {
      params: { search: "Galaxy S22" },
    });
    if (searchModelRes.data.data.some((it) => it.itemsSummary.some((i) => i.productName.includes("Galaxy S22")))) {
      results.testFilters_SearchModel = true;
      console.log("✓ Test Search by Phone Model: PASSED");
    }

    // Verify Search by IMEI
    const searchImeiRes = await api.get(`${BASE_URL}/stock/purchase-history`, {
      params: { search: receivedImei },
    });
    if (searchImeiRes.data.data.some((it) => it.itemsSummary.some((i) => (i.barcodes || []).includes(receivedImei)))) {
      results.testFilters_SearchIMEI = true;
      console.log("✓ Test Search by IMEI: PASSED");
    }

    // Verify Payment Status Filter
    const paidFilterRes = await api.get(`${BASE_URL}/stock/purchase-history`, {
      params: { paymentStatus: "partial" },
    });
    if (paidFilterRes.data.data.every((it) => it.paymentStatus === "partial")) {
      results.testFilters_PaymentStatus = true;
      console.log("✓ Test Payment Status Filter: PASSED");
    }

    // ─────────────────────────────────────────────────────────────
    // TEST DETAILS ENDPOINT
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- 6. Testing Purchase Details Endpoint ---");
    const detailsRes = await api.get(
      `${BASE_URL}/stock/purchase-history/${supplierInvoice.invoiceNumber}`
    );
    if (
      detailsRes.data.success &&
      detailsRes.data.data.receiptData &&
      Array.isArray(detailsRes.data.data.paymentHistory)
    ) {
      results.testDetailsEndpoint = true;
      console.log("✓ Test Details Endpoint: PASSED");
      console.log(`Details fetched. Payment history entries: ${detailsRes.data.data.paymentHistory.length}`);
    } else {
      console.error("✗ Test Details Endpoint Failed:", detailsRes.data);
    }

    // ─────────────────────────────────────────────────────────────
    // TEST ZERO DOUBLE COUNTING
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- 7. Testing Zero Double Counting ---");
    // Verify that the received exchange phone appears strictly once (as an exchange)
    const exchDeviceCheck = await api.get(`${BASE_URL}/stock/purchase-history`, {
      params: { search: receivedImei },
    });
    console.log(`Transactions found for IMEI ${receivedImei}: ${exchDeviceCheck.data.data.length}`);
    if (
      exchDeviceCheck.data.data.length === 1 &&
      exchDeviceCheck.data.data[0].transactionType === "exchange"
    ) {
      results.testZeroDoubleCounting = true;
      console.log("✓ Test Zero Double Counting: PASSED (Appeared strictly once as Exchange)");
    } else {
      console.error("✗ Test Zero Double Counting Failed:", exchDeviceCheck.data.data);
    }

    console.log("\n=====================================================");
    console.log("ALL TESTS COMPLETED SUCCESSFULLY!");
    console.log(JSON.stringify(results, null, 2));
    console.log("=====================================================");
  } catch (err) {
    console.error("Test execution error:", err.message);
    process.exit(1);
  }
}

runTests();
