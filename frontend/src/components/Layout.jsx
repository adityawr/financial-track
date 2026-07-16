import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../lib/i18n";
import { LayoutDashboard, Wallet, ArrowLeftRight, LogOut, Sparkles, Users } from "lucide-react";

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const { t, lang, setLang } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();

  const nav = [
    { to: "/", label: t("nav.dashboard"), icon: LayoutDashboard, testId: "nav-dashboard" },
    { to: "/accounts", label: t("nav.accounts"), icon: Wallet, testId: "nav-accounts" },
    { to: "/transactions", label: t("nav.transactions"), icon: ArrowLeftRight, testId: "nav-transactions" },
    { to: "/members", label: t("nav.members"), icon: Users, testId: "nav-members" },
  ];

  const initials = (user?.name || "?").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="min-h-screen flex bg-[#0A0A0A] text-[#F4F4F5]">
      {/* Sidebar */}
      <aside className="hidden md:flex flex-col w-64 border-r border-white/5 p-5 sticky top-0 h-screen">
        <div className="flex items-center gap-2 mb-10">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg, #C5A880, #8b7454)" }}>
            <Sparkles className="w-4 h-4 text-black" />
          </div>
          <div className="leading-tight">
            <div className="font-display text-lg">{t("app.name")}</div>
            <div className="text-[10px] uppercase tracking-widest text-[#71717A]">Wealth OS</div>
          </div>
        </div>

        <nav className="space-y-1 flex-1">
          {nav.map((n) => {
            const active = location.pathname === n.to;
            const Icon = n.icon;
            return (
              <Link
                key={n.to}
                to={n.to}
                data-testid={n.testId}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors duration-150 ${
                  active
                    ? "bg-white/[0.06] text-white"
                    : "text-[#A1A1AA] hover:bg-white/[0.03] hover:text-white"
                }`}
              >
                <Icon className="w-4 h-4" />
                {n.label}
                {active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[#C5A880]" />}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-white/5 pt-4 space-y-3">
          <div className="flex gap-1 text-xs">
            <button data-testid="lang-id" onClick={() => setLang("id")}
              className={`px-2 py-1 rounded ${lang === "id" ? "bg-white/10 text-white" : "text-[#71717A] hover:text-white"}`}>ID</button>
            <button data-testid="lang-en" onClick={() => setLang("en")}
              className={`px-2 py-1 rounded ${lang === "en" ? "bg-white/10 text-white" : "text-[#71717A] hover:text-white"}`}>EN</button>
          </div>
          <div className="flex items-center gap-3 px-1">
            <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-sm font-semibold border border-white/10">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{user?.name}</div>
              <div className="text-[11px] text-[#71717A] truncate">{user?.email}</div>
            </div>
          </div>
          <button
            data-testid="logout-btn"
            onClick={() => { logout(); navigate("/auth"); }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-[#A1A1AA] hover:bg-white/[0.04] hover:text-white transition-colors"
          >
            <LogOut className="w-4 h-4" /> {t("nav.logout")}
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0">
        <div className="max-w-[1400px] mx-auto p-6 md:p-10">
          {children}
        </div>
      </main>
    </div>
  );
}
