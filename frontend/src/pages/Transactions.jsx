import { useEffect, useMemo, useState } from "react";
import { api, formatApiError } from "../lib/api";
import { formatIDR, formatDateShort } from "../lib/format";
import { useI18n } from "../lib/i18n";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Card } from "../components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "../components/ui/tabs";
import { toast } from "sonner";
import { Plus, Lock, Users, ArrowDownRight, ArrowUpRight, ArrowLeftRight, Trash2 } from "lucide-react";

function TxDialog({ open, onOpenChange, accounts, categories, onCreated }) {
  const { t } = useI18n();
  const [type, setType] = useState("expense");
  const [form, setForm] = useState({ amount: "", account_id: "", to_account_id: "", category_id: "", note: "", visibility: "PRIVATE" });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open && accounts.length && !form.account_id) {
      setForm((s) => ({ ...s, account_id: accounts[0].id }));
    }
  }, [open, accounts, form.account_id]);

  const cats = useMemo(() => categories.filter((c) => c.kind === type || (type === "transfer" && c.kind === "transfer")), [categories, type]);

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = {
        type,
        amount: Number(String(form.amount).replace(/[^\d]/g, "")),
        account_id: form.account_id,
        to_account_id: type === "transfer" ? form.to_account_id : undefined,
        category_id: form.category_id || undefined,
        note: form.note || undefined,
        visibility: form.visibility,
      };
      if (!payload.amount || payload.amount <= 0) throw new Error("Jumlah tidak valid");
      if (!payload.account_id) throw new Error("Pilih akun");
      if (type === "transfer" && !payload.to_account_id) throw new Error("Pilih akun tujuan");
      const { data } = await api.post("/transactions", payload);
      onCreated(data);
      onOpenChange(false);
      setForm({ amount: "", account_id: accounts[0]?.id || "", to_account_id: "", category_id: "", note: "", visibility: "PRIVATE" });
      toast.success("Transaksi tersimpan");
    } catch (err) {
      toast.error(formatApiError(err) || err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#141414] border-white/10 text-white max-w-lg" data-testid="tx-dialog">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">{t("tx.new")}</DialogTitle>
        </DialogHeader>
        <Tabs value={type} onValueChange={setType} className="w-full">
          <TabsList className="grid grid-cols-3 bg-white/[0.03] border border-white/10 h-10">
            <TabsTrigger data-testid="tx-tab-expense" value="expense" className="data-[state=active]:bg-[#F43F5E]/15 data-[state=active]:text-[#F43F5E]">{t("tx.expense")}</TabsTrigger>
            <TabsTrigger data-testid="tx-tab-income" value="income" className="data-[state=active]:bg-[#10B981]/15 data-[state=active]:text-[#10B981]">{t("tx.income")}</TabsTrigger>
            <TabsTrigger data-testid="tx-tab-transfer" value="transfer" className="data-[state=active]:bg-white/10 data-[state=active]:text-white">{t("tx.transfer")}</TabsTrigger>
          </TabsList>
        </Tabs>
        <form onSubmit={submit} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label className="text-[#A1A1AA]">{t("tx.amount")} (IDR)</Label>
            <Input data-testid="tx-amount" required inputMode="numeric" placeholder="0" value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              className="bg-white/[0.03] border-white/10 h-12 tabular font-display text-2xl" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[#A1A1AA]">{type === "transfer" ? t("tx.from") : "Akun"}</Label>
              <Select value={form.account_id} onValueChange={(v) => setForm({ ...form, account_id: v })}>
                <SelectTrigger data-testid="tx-account" className="bg-white/[0.03] border-white/10 h-11"><SelectValue placeholder="Pilih akun" /></SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {type === "transfer" ? (
              <div className="space-y-1.5">
                <Label className="text-[#A1A1AA]">{t("tx.to")}</Label>
                <Select value={form.to_account_id} onValueChange={(v) => setForm({ ...form, to_account_id: v })}>
                  <SelectTrigger data-testid="tx-to-account" className="bg-white/[0.03] border-white/10 h-11"><SelectValue placeholder="Pilih akun tujuan" /></SelectTrigger>
                  <SelectContent>
                    {accounts.filter((a) => a.id !== form.account_id).map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label className="text-[#A1A1AA]">{t("tx.category")}</Label>
                <Select value={form.category_id} onValueChange={(v) => setForm({ ...form, category_id: v })}>
                  <SelectTrigger data-testid="tx-category" className="bg-white/[0.03] border-white/10 h-11"><SelectValue placeholder="Pilih kategori" /></SelectTrigger>
                  <SelectContent>
                    {cats.map((c) => <SelectItem key={c.id} value={c.id}>{c.name_id || c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-[#A1A1AA]">{t("tx.note")}</Label>
            <Textarea data-testid="tx-note" rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })}
              className="bg-white/[0.03] border-white/10 resize-none" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[#A1A1AA]">Visibilitas</Label>
            <Select value={form.visibility} onValueChange={(v) => setForm({ ...form, visibility: v })}>
              <SelectTrigger data-testid="tx-visibility" className="bg-white/[0.03] border-white/10 h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="PRIVATE">{t("priv.PRIVATE")}</SelectItem>
                <SelectItem value="SHARED">{t("priv.SHARED")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} data-testid="tx-cancel">{t("action.cancel")}</Button>
            <Button type="submit" disabled={submitting} data-testid="tx-save"
              className="rounded-full font-semibold"
              style={{ background: "linear-gradient(180deg, #C5A880, #8b7454)", color: "#0a0a0a" }}>
              {submitting ? "…" : t("action.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Transactions() {
  const { t } = useI18n();
  const [txs, setTxs] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  const reload = async () => {
    const [tx, ac, ca] = await Promise.all([
      api.get("/transactions?limit=100"),
      api.get("/accounts"),
      api.get("/categories"),
    ]);
    setTxs(tx.data); setAccounts(ac.data); setCategories(ca.data);
  };

  useEffect(() => { reload().finally(() => setLoading(false)); }, []);

  const acctById = Object.fromEntries(accounts.map((a) => [a.id, a]));
  const catById = Object.fromEntries(categories.map((c) => [c.id, c]));

  const del = async (id) => {
    try {
      await api.delete(`/transactions/${id}`);
      setTxs((x) => x.filter((t) => t.id !== id));
      toast.success("Transaksi dihapus");
    } catch (err) { toast.error(formatApiError(err)); }
  };

  return (
    <div className="space-y-6" data-testid="transactions-page">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-4xl">{t("tx.title")}</h1>
          <p className="text-sm text-[#71717A] mt-1">Semua pergerakan dana keluarga Anda.</p>
        </div>
        <Button data-testid="new-tx-btn" disabled={accounts.length === 0} onClick={() => setDialogOpen(true)}
          className="rounded-full font-semibold h-10"
          style={{ background: "linear-gradient(180deg, #C5A880, #8b7454)", color: "#0a0a0a" }}>
          <Plus className="w-4 h-4 mr-1" /> {t("tx.new")}
        </Button>
      </div>

      {loading ? (
        <div className="text-[#71717A]">…</div>
      ) : (
        <Card className="card-solid bg-transparent border-white/10 divide-y divide-white/5 overflow-hidden" data-testid="transactions-list">
          {txs.length === 0 && (
            <div className="p-10 text-center">
              <div className="text-[#A1A1AA] mb-3">Belum ada transaksi.</div>
              {accounts.length === 0 && <div className="text-xs text-[#71717A]">Buat akun terlebih dahulu di menu Akun.</div>}
            </div>
          )}
          {txs.map((tx) => {
            const acct = acctById[tx.account_id];
            const dst = tx.to_account_id ? acctById[tx.to_account_id] : null;
            const cat = tx.category_id ? catById[tx.category_id] : null;
            const sign = tx.type === "income" ? "+" : tx.type === "expense" ? "-" : "";
            const color = tx.type === "income" ? "text-[#10B981]" : tx.type === "expense" ? "text-[#F43F5E]" : "text-white";
            const Icon = tx.type === "income" ? ArrowDownRight : tx.type === "expense" ? ArrowUpRight : ArrowLeftRight;
            return (
              <div key={tx.id} data-testid={`tx-row-${tx.id}`} className="flex items-center gap-4 px-6 py-4 hover:bg-white/[0.02] transition-colors group">
                <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: (cat?.color || "#C5A880") + "22", color: cat?.color || "#C5A880" }}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-white truncate">{tx.note || cat?.name_id || cat?.name || (tx.type === "transfer" ? "Transfer" : "—")}</div>
                  <div className="text-xs text-[#71717A] mt-0.5 truncate">
                    {tx.type === "transfer" ? `${acct?.name} → ${dst?.name}` : acct?.name} · {formatDateShort(tx.date)}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {tx.visibility === "PRIVATE"
                    ? <Lock className="w-3.5 h-3.5 text-[#71717A]" />
                    : <Users className="w-3.5 h-3.5 text-[#C5A880]" />}
                  <div className={`font-medium tabular ${color}`}>{sign}{formatIDR(tx.amount)}</div>
                  <button data-testid={`tx-delete-${tx.id}`} onClick={() => del(tx.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-[#71717A] hover:text-[#F43F5E] p-1">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </Card>
      )}

      <TxDialog open={dialogOpen} onOpenChange={setDialogOpen} accounts={accounts} categories={categories} onCreated={() => reload()} />
    </div>
  );
}
