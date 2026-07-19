import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { formatIDR } from "../lib/format";
import { Card } from "../components/ui/card";
import { TrendingUp, TrendingDown, PieChart as PieChartIcon, BarChart3, Landmark, Coins, Target } from "lucide-react";

function Bar({ label, income, expense, max }) {
  const incomeW = max > 0 ? (income / max) * 100 : 0;
  const expenseW = max > 0 ? (expense / max) * 100 : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-[#A1A1AA]">{label}</span>
        <span className="tabular text-[#71717A]">
          <span className="text-[#10B981]">{formatIDR(income, { withSymbol: false })}</span> · <span className="text-[#F43F5E]">-{formatIDR(expense, { withSymbol: false })}</span>
        </span>
      </div>
      <div className="flex gap-1">
        <div className="flex-1 relative h-8 bg-white/[0.03] rounded overflow-hidden">
          <div className="absolute inset-y-0 left-0 bg-[#10B981]/40" style={{ width: `${incomeW}%` }} />
          <div className="absolute inset-y-0 left-0 top-1/2 h-1/2 bg-[#F43F5E]/50" style={{ width: `${expenseW}%` }} />
        </div>
      </div>
    </div>
  );
}

export default function Reports() {
  const [cashflow, setCashflow] = useState(null);
  const [breakdown, setBreakdown] = useState(null);
  const [nw, setNW] = useState(null);
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    Promise.all([
      api.get("/reports/cashflow?months=6"),
      api.get("/reports/expense-breakdown"),
      api.get("/reports/networth-history?months=6"),
      api.get("/reports/summary"),
    ]).then(([cf, eb, n, sm]) => {
      setCashflow(cf.data); setBreakdown(eb.data); setNW(n.data); setSummary(sm.data);
    });
  }, []);

  const maxBar = cashflow ? Math.max(1, ...cashflow.periods.map((p) => Math.max(p.income, p.expense))) : 1;
  const nwMax = nw ? Math.max(1, ...nw.series.map((s) => Math.abs(s.value))) : 1;

  return (
    <div className="space-y-8" data-testid="reports-page">
      <div>
        <h1 className="font-display text-4xl">Laporan</h1>
        <p className="text-sm text-[#71717A] mt-1">Analisis keuangan keluarga per siklus (25 → 24).</p>
      </div>

      {/* Net Worth History */}
      {nw && (
        <Card className="card-solid bg-transparent border-white/10 p-6">
          <div className="flex items-baseline justify-between mb-6">
            <div>
              <div className="text-xs uppercase tracking-widest text-[#C5A880] mb-2">Kekayaan Bersih Sekarang</div>
              <div className="font-display text-4xl md:text-5xl tabular">{formatIDR(nw.current_net_worth)}</div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
              <div><div className="text-[#71717A]">Akun</div><div className="tabular text-white mt-1">{formatIDR(nw.components.accounts)}</div></div>
              <div><div className="text-[#71717A]">Aset</div><div className="tabular text-white mt-1">{formatIDR(nw.components.assets)}</div></div>
              <div><div className="text-[#71717A]">Investasi</div><div className="tabular text-white mt-1">{formatIDR(nw.components.investments)}</div></div>
              <div><div className="text-[#71717A]">- Pinjaman</div><div className="tabular text-[#F43F5E] mt-1">-{formatIDR(nw.components.loans_outstanding)}</div></div>
            </div>
          </div>
          <div className="flex items-end gap-2 h-32 border-b border-white/5 pb-1">
            {nw.series.map((s, i) => {
              const h = Math.max(6, (Math.abs(s.value) / nwMax) * 100);
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1" title={`${s.label}: ${formatIDR(s.value)}`}>
                  <div className="w-full rounded-t" style={{ height: `${h}%`, background: "linear-gradient(180deg, #C5A880, rgba(197,168,128,0.15))" }} />
                  <div className="text-[10px] text-[#71717A]">{s.label}</div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Cash flow */}
      {cashflow && (
        <Card className="card-solid bg-transparent border-white/10 p-6">
          <div className="flex items-center gap-2 mb-6">
            <BarChart3 className="w-4 h-4 text-[#C5A880]" />
            <h2 className="text-sm uppercase tracking-widest text-[#71717A]">Arus Kas per Siklus (25 → 24)</h2>
          </div>
          <div className="space-y-4">
            {cashflow.periods.map((p, i) => <Bar key={i} label={p.label} income={p.income} expense={p.expense} max={maxBar} />)}
          </div>
        </Card>
      )}

      {/* Expense breakdown */}
      {breakdown && (
        <Card className="card-solid bg-transparent border-white/10 p-6">
          <div className="flex items-center gap-2 mb-6">
            <PieChartIcon className="w-4 h-4 text-[#C5A880]" />
            <h2 className="text-sm uppercase tracking-widest text-[#71717A]">Pengeluaran per Kategori (Siklus Ini)</h2>
          </div>
          {breakdown.rows.length === 0 ? (
            <div className="text-sm text-[#71717A]">Belum ada pengeluaran dalam siklus ini.</div>
          ) : (
            <div className="space-y-3">
              {breakdown.rows.map((r) => (
                <div key={r.category_id || "none"} className="space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: r.color }} />
                      <span className="text-white">{r.category_name}</span>
                      <span className="text-[#71717A] text-xs">· {r.count}×</span>
                    </span>
                    <span className="tabular text-white">{formatIDR(r.total)} <span className="text-[#71717A] text-xs">({r.percent}%)</span></span>
                  </div>
                  <div className="h-1.5 bg-white/[0.03] rounded overflow-hidden">
                    <div className="h-full" style={{ width: `${r.percent}%`, background: r.color }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="card-solid bg-transparent border-white/10 p-5">
            <div className="flex items-center gap-2 text-[#71717A] text-xs uppercase tracking-widest"><Landmark className="w-3.5 h-3.5" /> Pinjaman Aktif</div>
            <div className="font-display text-2xl tabular mt-2">{summary.loans.active_loans}</div>
            <div className="text-xs tabular text-[#F43F5E] mt-1">Sisa {formatIDR(summary.loans.outstanding)}</div>
          </Card>
          <Card className="card-solid bg-transparent border-white/10 p-5">
            <div className="flex items-center gap-2 text-[#71717A] text-xs uppercase tracking-widest"><Coins className="w-3.5 h-3.5" /> Investasi</div>
            <div className="font-display text-2xl tabular mt-2">{formatIDR(summary.investments.current_value)}</div>
            <div className={`text-xs tabular mt-1 ${summary.investments.gain >= 0 ? "text-[#10B981]" : "text-[#F43F5E]"}`}>
              {summary.investments.gain >= 0 ? "+" : ""}{formatIDR(summary.investments.gain)} dari modal
            </div>
          </Card>
          <Card className="card-solid bg-transparent border-white/10 p-5">
            <div className="flex items-center gap-2 text-[#71717A] text-xs uppercase tracking-widest"><Target className="w-3.5 h-3.5" /> Target Tabungan</div>
            <div className="font-display text-2xl tabular mt-2">{summary.goals.length}</div>
            <div className="text-xs text-[#71717A] mt-1">
              {summary.goals.slice(0, 2).map((g) => `${g.name.slice(0, 12)} ${g.progress}%`).join(" · ")}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
