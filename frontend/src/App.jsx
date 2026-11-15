import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { PrivacyProvider } from "./context/PrivacyContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Template from "./layouts/Template";
import Dashboard from "./pages/Dashboard";
import AddStock from "./pages/AddStock";
import ViewStock from "./pages/ViewStock";
import SupplierLedger from "./pages/SupplierLedger.jsx";
import Sales from "./pages/Sales.jsx";
import History from "./pages/History.jsx";
import Expenses from "./pages/Expenses.jsx";
import Returns from "./pages/Returns.jsx";
import ShopkeeperStock from "./pages/ShopkeeperStock.jsx";
import SupplierRefund from "./pages/SupplierRefund.jsx";
import Login from "./pages/Login";

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <PrivacyProvider>
          <Routes>
            {/* Public Login Route */}
            <Route path="/login" element={<Login />} />

            {/* Protected Routes - only accessible when authenticated */}
            <Route element={<ProtectedRoute />}>
              <Route element={<Template />}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/sales" element={<Sales />} />
                <Route path="/history" element={<History />} />
                <Route path="/sales/history" element={<History />} />
                <Route path="/stock-purchase-history" element={<History />} />
                <Route path="/stock/history" element={<History />} />
                <Route path="/returns" element={<Returns />} />
                <Route path="/expenses" element={<Expenses />} />
                <Route path="/add-stock" element={<AddStock />} />
                <Route path="/view-stock" element={<ViewStock />} />
                <Route path="/suppliers" element={<SupplierLedger />} />
                <Route path="/supplier-ledger" element={<SupplierLedger />} />
                <Route path="/shopkeeper-stock" element={<ShopkeeperStock />} />
                <Route path="/supplier-refund" element={<SupplierRefund />} />
              </Route>
            </Route>

            {/* Catch-all fallback route */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </PrivacyProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;