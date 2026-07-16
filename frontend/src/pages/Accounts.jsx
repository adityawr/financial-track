import { useEffect, useState } from "react";
import { api, formatApiError } from "../lib/api";
import { formatIDR } from "../lib/format";
import { useI18n } from "../lib/i18n";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Card } from "../components/ui/card";
import { toast } from "sonner";
import { Plus, Lock, Users, Wallet, Building2, Smartphone, CreditCard, Trash2 } from "lucide-react";

const PROVIDERS = {
  bank: ["BCA", "BRI", "Mandiri", "BNI", "CIMB", "Permata", "Jenius"],
  ewallet: ["OVO", "GoPay", "Dana", "ShopeePay", "LinkAja"],
  cash: ["Cash"],
  credit_card: ["BCA Card", "Mandiri Card", "BNI Card", "Citibank"],
};

const BRAND_COLORS = {
  BCA: "#005EAA", BRI: "#003D79", Mandiri: "#F2A900", BNI: "#EE7D11", CIMB: "#8E2323",
  OVO: "#4C3494", GoPay: "#00AED6", Dana: "#118EEA", ShopeePay: "#EE4D2D", LinkAja: "#E30613",
  Cash: "#71717A", Permata: "#005E3C", Jenius: "#00A5DC",
};

const TYPE_ICONS = { bank: Building2, ewallet: Smartphone, cash: Wallet, credit_card: CreditCard };

function AccountDialog({ open, onOpenChange, onCreated }) {
  const { t } = useI18n();
  const [form, setForm] = useState({ name: "", type: "bank", provider: "BCA", opening_balance: "0", visibility: "PRIVATE" });
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const color = BRAND_COLORS[form.provider] || "#C5A880";
      const { data } = await api.post("/accounts", {
        name: form.name.trim(),
        type: form.type,
        provider: form.provider,
        opening_balance: Number(form.opening_balance.replace(/[^\d-]/g, "")) || 0,
        color,
        icon: form.type,
        visibility: form.visibility,
      });
      onCreated(data);
      onOpenChange(false);
      setForm({ name: "", type: "bank", provider: "BCA", opening_balance: "0", visibility: "PRIVATE" });
      toast.success("Akun dibuat");
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const providers = PROVIDERS[form.type] || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#141414] border-white/10 text-white" data-testid="account-dialog">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">{t("accounts.new")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-[#A1A1AA]">{t("accounts.name")}</Label>
            <Input data-testid="account-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. BCA Gaji" className="bg-white/[0.03] border-white/10 h-11" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[#A1A1AA]">{t("accounts.type")}</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v, provider: PROVIDERS[v][0] })}>
                <SelectTrigger data-testid="account-type" className="bg-white/[0.03] border-white/10 h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank">Bank</SelectItem>
                  <SelectItem value="ewallet">E-Wallet</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="credit_card">Credit Card</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[#A1A1AA]">{t("accounts.provider")}</Label>
              <Select value={form.provider} onValueChange={(v) => setForm({ ...form, provider: v })}>
                <SelectTrigger data-testid="account-provider" className="bg-white/[0.03] border-white/10 h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {providers.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[#A1A1AA]">{t("accounts.opening")} (IDR)</Label>
            <Input data-testid="account-opening" type="text" inputMode="numeric" value={form.opening_balance}
              onChange={(e) => setForm({ ...form, opening_balance: e.target.value })}
              className="bg-white/[0.03] border-white/10 h-11 tabular" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[#A1A1AA]">{t("accounts.visibility")}</Label>
            <Select value={form.visibility} onValueChange={(v) => setForm({ ...form, visibility: v })}>
              <SelectTrigger data-testid="account-visibility" className="bg-white/[0.03] border-white/10 h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="PRIVATE">{t("priv.PRIVATE")}</SelectItem>
                <SelectItem value="SHARED">{t("priv.SHARED")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} data-testid="account-cancel">{t("action.cancel")}</Button>
            <Button type="submit" disabled={submitting} data-testid="account-save"
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

export default function Accounts() {
  const { t } = useI18n();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = () => api.get("/accounts").then((r) => setAccounts(r.data)).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const del = async (id) => {
    try {
      await api.delete(`/accounts/${id}`);
      setAccounts((a) => a.filter((x) => x.id !== id));
      toast.success("Akun dihapus");
    } catch (err) { toast.error(formatApiError(err)); }
  };

  return (
    <div className="space-y-6" data-testid="accounts-page">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-4xl">{t("accounts.title")}</h1>
          <p className="text-sm text-[#71717A] mt-1">Bank, e-wallet, tunai, dan kartu kredit — semua dalam satu tempat.</p>
        </div>
        <Button data-testid="new-account-btn" onClick={() => setDialogOpen(true)}
          className="rounded-full font-semibold h-10"
          style={{ background: "linear-gradient(180deg, #C5A880, #8b7454)", color: "#0a0a0a" }}>
          <Plus className="w-4 h-4 mr-1" /> {t("accounts.new")}
        </Button>
      </div>

      {loading ? (
        <div className="text-[#71717A]">…</div>
      ) : accounts.length === 0 ? (
        <Card className="card-solid bg-transparent border-white/10 border-dashed p-12 text-center">
          <Wallet className="w-8 h-8 text-[#C5A880] mx-auto mb-3" />
          <div className="text-[#A1A1AA] mb-4">{t("accounts.no_accounts")}</div>
          <Button data-testid="empty-new-account" onClick={() => setDialogOpen(true)} className="rounded-full font-semibold"
            style={{ background: "linear-gradient(180deg, #C5A880, #8b7454)", color: "#0a0a0a" }}>
            <Plus className="w-4 h-4 mr-1" /> {t("accounts.new")}
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="accounts-grid">
          {accounts.map((a) => {
            const Icon = TYPE_ICONS[a.type] || Wallet;
            const color = a.color || BRAND_COLORS[a.provider] || "#C5A880";
            return (
              <Card key={a.id} data-testid={`account-card-${a.id}`}
                className="brand-edge card-solid bg-transparent border-white/10 p-5 pt-6 relative hover:bg-white/[0.02] transition-colors group"
                style={{ "--edge-color": color }}>
                <div className="flex items-start justify-between mb-8">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center"
                      style={{ background: color + "22", color }}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-sm text-white font-medium">{a.name}</div>
                      <div className="text-xs text-[#71717A]">{a.provider} · {a.type}</div>
                    </div>
                  </div>
                  {a.visibility === "PRIVATE"
                    ? <Lock className="w-3.5 h-3.5 text-[#71717A]" />
                    : <Users className="w-3.5 h-3.5 text-[#C5A880]" />}
                </div>
                <div className="flex items-end justify-between">
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-[#71717A] mb-1">Saldo</div>
                    <div className={`font-display text-2xl tabular ${a.type === "credit_card" ? "text-[#F43F5E]" : "text-white"}`}>
                      {formatIDR(a.current_balance)}
                    </div>
                  </div>
                  <button
                    data-testid={`delete-account-${a.id}`}
                    onClick={() => del(a.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-[#71717A] hover:text-[#F43F5E] p-1.5"
                    title="Hapus"
                  ><Trash2 className="w-4 h-4" /></button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <AccountDialog open={dialogOpen} onOpenChange={setDialogOpen} onCreated={(a) => setAccounts((prev) => [...prev, a])} />
    </div>
  );
}
