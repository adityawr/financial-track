import { useEffect, useMemo, useRef, useState } from "react";
import { api, formatApiError } from "../lib/api";
import { formatIDR, formatDateTime } from "../lib/format";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card } from "../components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Switch } from "../components/ui/switch";
import { toast } from "sonner";
import { Zap, Lock, Users, Sparkles, CheckCircle2, Pencil, AlertCircle } from "lucide-react";

/* --------------------------- Parser (frontend mirror) --------------------------- */
function parseAmountToken(tok) {
  let t = (tok || "").trim().toLowerCase();
  if (!t) return null;
  if (t.startsWith("rp")) t = t.slice(2).trim();
  let mult = 1;
  if (t.endsWith("rb")) { t = t.slice(0, -2); mult = 1000; }
  else if (t.endsWith("k")) { t = t.slice(0, -1); mult = 1000; }
  t = t.replace(/[.,\s]/g, "");
  if (!/^\d+$/.test(t)) return null;
  const v = parseInt(t, 10) * mult;
  return v > 0 ? v : null;
}

function parseFreestyle(text) {
  const raw = (text || "").trim();
  if (!raw) return { ok: false, error: null };
  const normalized = raw.replace(/\brp\s+(\d)/gi, "rp$1");
  const tokens = normalized.split(/\s+/);
  let amount = null;
  let idx = -1;
  for (let i = 0; i < tokens.length; i++) {
    const v = parseAmountToken(tokens[i]);
    if (v !== null) { amount = v; idx = i; break; }
  }
  if (amount === null) return { ok: false, error: "Jumlah tidak terdeteksi. Contoh: 'makan siang 50000'." };
  const descTokens = tokens.slice(0, idx);
  if (descTokens.length === 0) return { ok: false, error: "Deskripsi wajib diisi sebelum jumlah." };
  const accountTokens = tokens.slice(idx + 1);
  return {
    ok: true,
    amount,
    description: descTokens.join(" ").trim(),
    account_hint: accountTokens.join(" ").trim() || null,
  };
}

function matchAccount(hint, accounts) {
  if (!hint) return { error: { code: "not_provided" } };
  const h = hint.toLowerCase().trim();
  const byName = accounts.filter((a) => (a.name || "").toLowerCase() === h);
  if (byName.length === 1) return { account: byName[0] };
  if (byName.length > 1) return { error: { code: "ambiguous", candidates: byName } };
  const byProv = accounts.filter((a) => (a.provider || "").toLowerCase() === h);
  if (byProv.length === 1) return { account: byProv[0] };
  if (byProv.length > 1) return { error: { code: "ambiguous", candidates: byProv } };
  return { error: { code: "not_found", hint } };
}

/* --------------------------- Component --------------------------- */
export default function QuickExpense() {
  const { user, refresh } = useAuth();
  const [text, setText] = useState("");
  const [accounts, setAccounts] = useState([]);
  const [defaultAcctId, setDefaultAcctId] = useState(null);
  const [recent, setRecent] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [pickAccountId, setPickAccountId] = useState(""); // manual override when default missing / ambiguous
  const [setAsDefault, setSetAsDefault] = useState(false);
  const [visibility, setVisibility] = useState("PRIVATE");
  const [flashOk, setFlashOk] = useState(null); // last-posted for confirmation animation
  const inputRef = useRef(null);

  const load = async () => {
    const [a, prefs, rec] = await Promise.all([
      api.get("/accounts"),
      api.get("/preferences"),
      api.get("/quick-expense/recent?limit=5"),
    ]);
    setAccounts(a.data);
    setDefaultAcctId(prefs.data.default_expense_account_id || null);
    setRecent(rec.data);
  };

  useEffect(() => {
    load();
    inputRef.current?.focus();
  }, []);

  // Live parse (frontend only, backend re-validates)
  const parsed = useMemo(() => parseFreestyle(text), [text]);

  const accountResolution = useMemo(() => {
    if (!parsed.ok) return null;
    if (parsed.account_hint) return matchAccount(parsed.account_hint, accounts);
    const chosenId = pickAccountId || defaultAcctId;
    if (!chosenId) {
      return { error: { code: defaultAcctId ? "default_missing" : "no_default" } };
    }
    const acct = accounts.find((a) => a.id === chosenId);
    if (!acct) return { error: { code: "default_missing" } };
    return { account: acct };
  }, [parsed, accounts, defaultAcctId, pickAccountId]);

  const canSubmit = parsed.ok && accountResolution && accountResolution.account && !submitting;

  const submit = async (e) => {
    e?.preventDefault?.();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const body = {
        text: text.trim(),
        visibility,
      };
      // If user picked a manual account (because no default), send it explicitly
      if (!parsed.account_hint && pickAccountId) body.account_id = pickAccountId;

      const { data } = await api.post("/quick-expense", body);

      // Optional: set as default
      if (setAsDefault && (pickAccountId || accountResolution?.account?.id)) {
        const id = pickAccountId || accountResolution.account.id;
        await api.patch("/preferences", { default_expense_account_id: id });
        setDefaultAcctId(id);
        setSetAsDefault(false);
        await refresh();
      }

      setFlashOk({
        note: data.note, amount: data.amount, account: data.account_name,
      });
      setText("");
      setPickAccountId("");
      inputRef.current?.focus();
      // Refresh recents
      const rec = await api.get("/quick-expense/recent?limit=5");
      setRecent(rec.data);
      // Auto-clear flash
      setTimeout(() => setFlashOk(null), 3500);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === "Escape") { setText(""); e.preventDefault(); }
    if (e.key === "Enter" && canSubmit) submit(e);
  };

  const showAccountFallback = parsed.ok && !parsed.account_hint && !defaultAcctId;
  const acctError = accountResolution?.error;

  return (
    <div className="max-w-3xl mx-auto space-y-8" data-testid="quick-expense-page">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-lg flex items-center justify-center"
          style={{ background: "linear-gradient(135deg, #C5A880, #8b7454)" }}>
          <Zap className="w-5 h-5 text-black" />
        </div>
        <div>
          <h1 className="font-display text-4xl">Quick Expense</h1>
          <p className="text-sm text-[#71717A] mt-1">Ketik pengeluaran secara natural — deskripsi, jumlah, akun opsional.</p>
        </div>
      </div>

      {/* Input */}
      <Card className="card-solid bg-transparent border-white/10 p-6 space-y-5">
        <form onSubmit={submit} className="space-y-4">
          <Input
            ref={inputRef}
            data-testid="qe-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            autoFocus
            placeholder='mis. "makan siang 50000 gopay"'
            className="bg-white/[0.03] border-white/10 h-14 tabular font-display text-xl"
          />

          {/* Preview */}
          {text.trim().length > 0 && (
            <div data-testid="qe-preview" className="p-4 rounded-lg border border-white/10 bg-white/[0.02]">
              {!parsed.ok ? (
                <div className="flex items-start gap-2 text-sm">
                  <AlertCircle className="w-4 h-4 text-[#F43F5E] mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="text-xs uppercase tracking-widest text-[#71717A] mb-1">Parsed as</div>
                    <div className="text-[#F43F5E]">{parsed.error || "…"}</div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="text-xs uppercase tracking-widest text-[#71717A]">Parsed as</div>
                  <div className="flex items-baseline justify-between">
                    <div className="font-medium capitalize">{parsed.description}</div>
                    <div className="font-display text-2xl tabular text-[#F43F5E]">-{formatIDR(parsed.amount)}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-[#71717A]">Dari Akun</div>
                      {accountResolution?.account ? (
                        <div className="flex items-center gap-2 mt-1">
                          <span className="w-2 h-2 rounded-full" style={{ background: accountResolution.account.color || "#C5A880" }} />
                          <span className="text-white">{accountResolution.account.name}</span>
                          {accountResolution.account.visibility === "PRIVATE" ? (
                            <Lock className="w-3 h-3 text-[#71717A]" />
                          ) : (
                            <Users className="w-3 h-3 text-[#C5A880]" />
                          )}
                        </div>
                      ) : (
                        <div className="text-[#F43F5E] mt-1 text-xs">
                          {acctError?.code === "not_found" && `Akun "${acctError.hint}" tidak ditemukan atau tidak dapat diakses.`}
                          {acctError?.code === "ambiguous" && "Beberapa akun cocok. Pilih salah satu di bawah."}
                          {acctError?.code === "no_default" && "Belum ada akun default. Pilih akun di bawah."}
                          {acctError?.code === "default_missing" && "Akun default tidak tersedia. Pilih akun."}
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-[#71717A]">Kategori</div>
                      <div className="text-white mt-1">Uncategorized</div>
                    </div>
                  </div>
                  <div className="text-[10px] uppercase tracking-widest text-[#71717A] pt-1">Expense · Posted</div>
                </div>
              )}
            </div>
          )}

          {/* Manual account picker & set-as-default (only when no hint AND no default OR default missing) */}
          {showAccountFallback && accounts.length > 0 && (
            <div className="p-4 rounded-lg border border-[#C5A880]/30 bg-[#C5A880]/[0.04] space-y-3" data-testid="qe-account-fallback">
              <div className="text-xs uppercase tracking-widest text-[#C5A880]">Pilih Akun untuk Kali Ini</div>
              <Select value={pickAccountId} onValueChange={setPickAccountId}>
                <SelectTrigger data-testid="qe-pick-account" className="bg-white/[0.03] border-white/10 h-11">
                  <SelectValue placeholder="Pilih akun…" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      <span className="inline-flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ background: a.color || "#71717A" }} />
                        {a.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <label className="flex items-center gap-2 text-sm text-[#A1A1AA] cursor-pointer">
                <Switch data-testid="qe-set-default" checked={setAsDefault} onCheckedChange={setSetAsDefault} />
                Jadikan akun default untuk Quick Expense
              </label>
            </div>
          )}

          {/* Ambiguous candidates */}
          {parsed.ok && acctError?.code === "ambiguous" && (
            <div className="p-4 rounded-lg border border-white/10 bg-white/[0.02] space-y-2">
              <div className="text-xs text-[#A1A1AA]">Beberapa akun cocok. Pilih akun yang dimaksud:</div>
              <Select value={pickAccountId} onValueChange={setPickAccountId}>
                <SelectTrigger className="bg-white/[0.03] border-white/10 h-11"><SelectValue placeholder="Pilih akun" /></SelectTrigger>
                <SelectContent>
                  {acctError.candidates.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name} {a.provider ? `· ${a.provider}` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <div className="text-[11px] text-[#71717A] flex items-center gap-2">
              <Sparkles className="w-3 h-3 text-[#C5A880]" />
              Enter untuk simpan · Esc untuk hapus
              <span className="mx-1">·</span>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <span>Visibilitas:</span>
                <button type="button" onClick={() => setVisibility(visibility === "PRIVATE" ? "SHARED" : "PRIVATE")}
                  className="text-[#C5A880] hover:underline">
                  {visibility === "PRIVATE" ? "Pribadi" : "Bersama"}
                </button>
              </label>
            </div>
            <Button type="submit" data-testid="qe-submit" disabled={!canSubmit}
              className="rounded-full font-semibold h-10 disabled:opacity-40"
              style={{ background: "linear-gradient(180deg, #C5A880, #8b7454)", color: "#0a0a0a" }}>
              {submitting ? "…" : "Add Expense"}
            </Button>
          </div>
        </form>
      </Card>

      {/* Success flash */}
      {flashOk && (
        <div data-testid="qe-success"
          className="p-4 rounded-lg border border-[#10B981]/40 bg-[#10B981]/[0.08] flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <CheckCircle2 className="w-5 h-5 text-[#10B981]" />
          <div className="flex-1">
            <div className="text-sm font-medium capitalize">{flashOk.note}</div>
            <div className="text-xs text-[#A1A1AA]"><span className="tabular">{formatIDR(flashOk.amount)}</span> · {flashOk.account}</div>
          </div>
          <div className="text-[10px] uppercase tracking-widest text-[#10B981]">Tersimpan</div>
        </div>
      )}

      {/* Examples */}
      {text.trim().length === 0 && (
        <div className="text-xs text-[#71717A] flex flex-wrap items-center gap-2">
          <span className="uppercase tracking-widest">Contoh:</span>
          {["makan siang 50000", "bensin 300000 bni", "parkir 10000 cash", "kopi 25rb", "belanja Rp 175000 gopay"].map((ex) => (
            <button key={ex} data-testid={`qe-example-${ex.split(" ")[0]}`}
              onClick={() => { setText(ex); inputRef.current?.focus(); }}
              className="px-2.5 py-1 rounded-full border border-white/10 hover:bg-white/[0.04] hover:text-white transition-colors">
              {ex}
            </button>
          ))}
        </div>
      )}

      {/* Recent */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm uppercase tracking-widest text-[#71717A]">Quick Entries Terbaru</h2>
        </div>
        <Card className="card-solid bg-transparent border-white/10 divide-y divide-white/5 overflow-hidden" data-testid="qe-recent">
          {recent.length === 0 ? (
            <div className="p-8 text-center text-sm text-[#71717A]">Belum ada Quick Expense. Ketik entri pertama Anda di atas.</div>
          ) : recent.map((r) => (
            <div key={r.id} className="flex items-center gap-4 px-6 py-4 hover:bg-white/[0.02] transition-colors group">
              <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: (r.account_color || "#71717A") + "22", color: r.account_color || "#71717A" }}>
                <Zap className="w-3.5 h-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-white capitalize truncate">{r.note}</div>
                <div className="text-xs text-[#71717A] mt-0.5 truncate">
                  {r.account_name || "—"} · {formatDateTime(r.date)}
                </div>
              </div>
              <div className="flex items-center gap-3">
                {r.visibility === "PRIVATE" ? <Lock className="w-3.5 h-3.5 text-[#71717A]" /> : <Users className="w-3.5 h-3.5 text-[#C5A880]" />}
                <div className="tabular text-[#F43F5E]">-{formatIDR(r.amount)}</div>
                <a href={`/transactions?edit=${r.id}`} className="opacity-0 group-hover:opacity-100 text-[#71717A] hover:text-[#C5A880] p-1 transition-opacity"
                  title="Edit via halaman Transaksi">
                  <Pencil className="w-4 h-4" />
                </a>
              </div>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
