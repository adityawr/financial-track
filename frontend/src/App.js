import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { I18nProvider } from "@/lib/i18n";
import AuthPage from "@/pages/AuthPage";
import Dashboard from "@/pages/Dashboard";
import Accounts from "@/pages/Accounts";
import Transactions from "@/pages/Transactions";
import Members from "@/pages/Members";
import Assets from "@/pages/Assets";
import Investments from "@/pages/Investments";
import Loans from "@/pages/Loans";
import Goals from "@/pages/Goals";
import Reports from "@/pages/Reports";
import Settings from "@/pages/Settings";
import QuickExpense from "@/pages/QuickExpense";
import Layout from "@/components/Layout";
import { Toaster } from "@/components/ui/sonner";

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading || user === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0A0A0A]">
        <div className="w-8 h-8 rounded-full border-2 border-[#C5A880]/30 border-t-[#C5A880] animate-spin" />
      </div>
    );
  }
  if (user === false) return <Navigate to="/auth" replace />;
  return <Layout>{children}</Layout>;
}

function AuthGate() {
  const { user, loading } = useAuth();
  if (loading || user === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0A0A0A]">
        <div className="w-8 h-8 rounded-full border-2 border-[#C5A880]/30 border-t-[#C5A880] animate-spin" />
      </div>
    );
  }
  if (user) return <Navigate to="/" replace />;
  return <AuthPage />;
}

function App() {
  return (
    <I18nProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/auth" element={<AuthGate />} />
            <Route path="/" element={<Protected><Dashboard /></Protected>} />
            <Route path="/accounts" element={<Protected><Accounts /></Protected>} />
            <Route path="/transactions" element={<Protected><Transactions /></Protected>} />
            <Route path="/quick-expense" element={<Protected><QuickExpense /></Protected>} />
            <Route path="/assets" element={<Protected><Assets /></Protected>} />
            <Route path="/investments" element={<Protected><Investments /></Protected>} />
            <Route path="/loans" element={<Protected><Loans /></Protected>} />
            <Route path="/goals" element={<Protected><Goals /></Protected>} />
            <Route path="/reports" element={<Protected><Reports /></Protected>} />
            <Route path="/members" element={<Protected><Members /></Protected>} />
            <Route path="/settings" element={<Protected><Settings /></Protected>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
        <Toaster theme="dark" position="top-right" />
      </AuthProvider>
    </I18nProvider>
  );
}

export default App;
