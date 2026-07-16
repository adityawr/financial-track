import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { formatIDR, formatDateShort } from "../lib/format";
import { useI18n } from "../lib/i18n";
import { useAuth } from "../context/AuthContext";
import { Card } from "../components/ui/card";
import { Lock, Users, ArrowDownRight, ArrowUpRight, ArrowLeftRight, TrendingUp } from "lucide-react";

function StatCard({ label, value, sub, tone = "neutral", testId }) {
  const toneClasses = {
    income: "text-[#10B981]",
    expense: "text-[#F43F5E]",
    neutral: "text-white",
  };
  return (
    <Card data-testid={testId} className="card-solid p-6 bg-transparent border-white/10">
      <div className="text-xs uppercase tracking-widest text-[#71717A] mb-3">{label}</div>
      <div className={`font-display text-3xl tabular ${toneClasses[tone]}`}>{value}</div>
      {sub && <div className="text-xs text-[#71717A] mt-2">{sub}</div>}
    </Card>
  );
}

export default function Dashboard() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get("/dashboard/summary"),
      api.get("/accounts"),
      api.get("/categories"),
    ]).then(([s, a, c]) => {
      setSummary(s.data);
      setAccounts(a.data);
      setCategories(c.data);
    }).finally(() => setLoading(false));
  }, []);

  const acctById = Object.fromEntries(accounts.map((a) => [a.id, a]));
  const catById = Object.fromEntries(categories.map((c) => [c.id, c]));

  if (loading) {
    return <div className="text-[#A1A1AA]">…</div>;
  }

  const netWorth = summary?.net_worth ?? 0;
  const income = summary?.period_income ?? 0;
  const expense = summary?.period_expense ?? 0;
  const cashflow = summary?.period_cashflow ?? 0;
  const recent = summary?.recent_transactions ?? [];

  const cycleFrom = summary?.cycle_start ? formatDateShort(summary.cycle_start) : "";
  const cycleTo = summary?.cycle_end ? formatDateShort(summary.cycle_end) : "";

  return (
    <div className="space-y-8" data-testid="dashboard-page">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-xs uppercase tracking-widest text-[#71717A]">{new Date().toLocaleDateString("id-ID", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}</div>
          <h1 className="font-display text-4xl mt-1">Halo, {user?.name?.split(" ")[0]}.</h1>
        </div>
        <div className="hidden md:flex items-center gap-2 text-xs text-[#A1A1AA] border border-white/10 rounded-full px-3 py-1.5">
          <TrendingUp className="w-3.5 h-3.5 text-[#C5A880]" />
          <span className="uppercase tracking-widest">{t("dash.cycle")}: {cycleFrom} — {cycleTo}</span>
        </div>
      </div>

      {/* Net Worth hero */}
      <Card data-testid="networth-card" className="relative overflow-hidden card-solid gold-glow p-8 md:p-10 border-white/10">
        <div className="relative z-10">
          <div className="text-xs uppercase tracking-[0.2em] text-[#C5A880] mb-4">{t("dash.net_worth")}</div>
          <div className="font-display text-6xl md:text-7xl tabular tracking-tight text-white">
            {formatIDR(netWorth)}
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-3 text-sm text-[#A1A1AA]">
            <span>{summary?.account_count ?? 0} akun aktif</span>
            <span className="hidden md:inline text-[#3f3f46]">·</span>
            <span className="tabular"><span className="text-[#10B981]">{formatIDR(income)}</span> masuk</span>
            <span className="hidden md:inline text-[#3f3f46]">·</span>
            <span className="tabular"><span className="text-[#F43F5E]">{formatIDR(expense)}</span> keluar</span>
          </div>
        </div>
        <div className="absolute top-0 right-0 w-[280px] h-[280px] rounded-full opacity-40"
          style={{ background: "radial-gradient(circle, rgba(197,168,128,0.15), transparent 65%)" }} />
      </Card>

      {/* Stat grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <StatCard testId="stat-income" label={t("dash.income")} tone="income" value={formatIDR(income)} sub={`${cycleFrom} → ${cycleTo}`} />
        <StatCard testId="stat-expense" label={t("dash.expense")} tone="expense" value={formatIDR(expense)} sub={`${cycleFrom} → ${cycleTo}`} />
        <StatCard testId="stat-cashflow" label={t("dash.cashflow")} tone={cashflow >= 0 ? "income" : "expense"} value={formatIDR(cashflow)} sub={cashflow >= 0 ? "Surplus" : "Defisit"} />
      </div>

      {/* Recent transactions */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm uppercase tracking-widest text-[#71717A]">{t("dash.recent")}</h2>
        </div>
        <Card className="card-solid border-white/10 bg-transparent divide-y divide-white/5 overflow-hidden" data-testid="recent-transactions">
          {recent.length === 0 && (
            <div className="p-8 text-center text-[#71717A]">{t("dash.no_tx")}</div>
          )}
          {recent.map((t) => {
            const acct = acctById[t.account_id];
            const cat = t.category_id ? catById[t.category_id] : null;
            const sign = t.type === "income" ? "+" : t.type === "expense" ? "-" : "";
            const amountColor = t.type === "income" ? "text-[#10B981]" : t.type === "expense" ? "text-[#F43F5E]" : "text-white";
            const TypeIcon = t.type === "income" ? ArrowDownRight : t.type === "expense" ? ArrowUpRight : ArrowLeftRight;
            return (
              <div key={t.id} className="flex items-center gap-4 px-6 py-4 hover:bg-white/[0.02] transition-colors">
                <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: (cat?.color || "#C5A880") + "22", color: cat?.color || "#C5A880" }}>
                  <TypeIcon className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-white truncate">{t.note || cat?.name || (t.type === "transfer" ? "Transfer" : "—")}</div>
                  <div className="text-xs text-[#71717A] mt-0.5 truncate">
                    {acct?.name || "—"} · {formatDateShort(t.date)}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {t.visibility === "PRIVATE"
                    ? <Lock className="w-3.5 h-3.5 text-[#71717A]" />
                    : <Users className="w-3.5 h-3.5 text-[#C5A880]" />}
                  <div className={`font-medium tabular ${amountColor}`}>{sign}{formatIDR(t.amount)}</div>
                </div>
              </div>
            );
          })}
        </Card>
      </div>
    </div>
  );
}
