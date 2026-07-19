import { useEffect, useState } from "react";
import { api, formatApiError } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card } from "../components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { toast } from "sonner";
import { Plus, Trash2, Settings2, Building2, Smartphone, Wallet, CreditCard, ShieldCheck } from "lucide-react";

const TYPE_META = {
  bank: { label: "Bank", icon: Building2 },
  ewallet: { label: "E-Wallet", icon: Smartphone },
  cash: { label: "Cash", icon: Wallet },
  credit_card: { label: "Credit Card", icon: CreditCard },
};

function ProviderDialog({ open, onOpenChange, onCreated }) {
  const [form, setForm] = useState({ name: "", type: "bank", color: "#C5A880" });
  const [saving, setSaving] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await api.post("/providers", {
        name: form.name.trim(), type: form.type, color: form.color,
      });
      onCreated(data); onOpenChange(false);
      setForm({ name: "", type: "bank", color: "#C5A880" });
      toast.success("Provider ditambahkan");
    } catch (err) { toast.error(formatApiError(err)); }
    finally { setSaving(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#141414] border-white/10 text-white" data-testid="provider-dialog">
        <DialogHeader><DialogTitle className="font-display text-2xl">Provider Baru</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-[#A1A1AA]">Nama</Label>
            <Input data-testid="provider-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="mis. Seabank" className="bg-white/[0.03] border-white/10 h-11" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[#A1A1AA]">Tipe</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger data-testid="provider-type" className="bg-white/[0.03] border-white/10 h-11"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(TYPE_META).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[#A1A1AA]">Warna</Label>
              <div className="flex items-center gap-2 h-11 bg-white/[0.03] border border-white/10 rounded-md px-3">
                <input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })}
                  className="w-8 h-8 rounded cursor-pointer bg-transparent border-none" />
                <span className="text-sm font-mono text-white">{form.color}</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Batal</Button>
            <Button type="submit" disabled={saving} data-testid="provider-save" className="rounded-full font-semibold"
              style={{ background: "linear-gradient(180deg, #C5A880, #8b7454)", color: "#0a0a0a" }}>{saving ? "…" : "Simpan"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Settings() {
  const { user } = useAuth();
  const { lang, setLang, t } = useI18n();
  const [settings, setSettings] = useState(null);
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [provDialog, setProvDialog] = useState(false);
  const [cycleDay, setCycleDay] = useState("25");
  const [saving, setSaving] = useState(false);

  const isOwner = user?.role === "Owner";

  const load = async () => {
    const [s, p] = await Promise.all([api.get("/settings"), api.get("/providers")]);
    setSettings(s.data); setProviders(p.data); setCycleDay(String(s.data.budget_cycle_day || 25));
  };
  useEffect(() => { load().finally(() => setLoading(false)); }, []);

  const saveCycleDay = async () => {
    setSaving(true);
    try {
      const { data } = await api.patch("/settings", { budget_cycle_day: Number(cycleDay) });
      setSettings(data);
      toast.success("Siklus budget diperbarui");
    } catch (err) { toast.error(formatApiError(err)); }
    finally { setSaving(false); }
  };

  const delProv = async (id, name) => {
    if (!window.confirm(`Hapus provider "${name}"?`)) return;
    try { await api.delete(`/providers/${id}`); setProviders((xs) => xs.filter((x) => x.id !== id)); toast.success("Provider dihapus"); }
    catch (err) { toast.error(formatApiError(err)); }
  };

  if (loading) return <div className="text-[#71717A]">…</div>;

  const grouped = providers.reduce((acc, p) => {
    (acc[p.type] = acc[p.type] || []).push(p); return acc;
  }, {});

  return (
    <div className="space-y-6" data-testid="settings-page">
      <div>
        <h1 className="font-display text-4xl">Pengaturan</h1>
        <p className="text-sm text-[#71717A] mt-1">Konfigurasi keluarga, provider akun, siklus budget, dan bahasa.</p>
      </div>

      <Tabs defaultValue="general">
        <TabsList className="bg-white/[0.03] border border-white/10 h-10">
          <TabsTrigger data-testid="tab-general" value="general">Umum</TabsTrigger>
          <TabsTrigger data-testid="tab-providers" value="providers">Provider Akun</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-6 space-y-4">
          <Card className="card-solid bg-transparent border-white/10 p-6 space-y-6">
            <div>
              <div className="text-xs uppercase tracking-widest text-[#C5A880] mb-1">Keluarga</div>
              <div className="font-display text-2xl">{settings.family_name}</div>
              <div className="text-xs text-[#71717A] mt-1">Mata uang: IDR</div>
            </div>
            <div className="border-t border-white/5 pt-6 space-y-3">
              <Label className="text-[#A1A1AA] uppercase text-xs tracking-widest">Siklus Budget</Label>
              <p className="text-xs text-[#71717A]">Tanggal mulai siklus keuangan (default: 25). Contoh: 25 → 24 bulan berikutnya.</p>
              <div className="flex items-center gap-3">
                <Input data-testid="cycle-day-input" type="number" min="1" max="28" value={cycleDay} onChange={(e) => setCycleDay(e.target.value)}
                  disabled={!isOwner} className="bg-white/[0.03] border-white/10 h-11 w-24 tabular" />
                <Button data-testid="save-cycle-btn" onClick={saveCycleDay} disabled={saving || !isOwner || cycleDay === String(settings.budget_cycle_day)}
                  className="rounded-full font-semibold"
                  style={{ background: "linear-gradient(180deg, #C5A880, #8b7454)", color: "#0a0a0a" }}>{saving ? "…" : "Simpan"}</Button>
              </div>
              {!isOwner && <div className="text-xs text-[#71717A] flex items-center gap-1.5"><ShieldCheck className="w-3 h-3" /> Hanya Owner yang bisa mengubah</div>}
            </div>
            <div className="border-t border-white/5 pt-6 space-y-3">
              <Label className="text-[#A1A1AA] uppercase text-xs tracking-widest">Bahasa</Label>
              <div className="flex gap-2">
                <Button variant={lang === "id" ? "default" : "ghost"} onClick={() => setLang("id")}
                  className={`rounded-full ${lang === "id" ? "text-black" : "text-white border border-white/10"}`}
                  style={lang === "id" ? { background: "linear-gradient(180deg, #C5A880, #8b7454)" } : {}}>Bahasa Indonesia</Button>
                <Button variant={lang === "en" ? "default" : "ghost"} onClick={() => setLang("en")}
                  className={`rounded-full ${lang === "en" ? "text-black" : "text-white border border-white/10"}`}
                  style={lang === "en" ? { background: "linear-gradient(180deg, #C5A880, #8b7454)" } : {}}>English</Button>
              </div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="providers" className="mt-6 space-y-4">
          <div className="flex items-end justify-between">
            <div>
              <div className="text-sm text-[#A1A1AA]">Bank, e-wallet, cash, dan kartu kredit yang bisa dipilih saat membuat akun.</div>
            </div>
            {isOwner && (
              <Button data-testid="new-provider-btn" onClick={() => setProvDialog(true)} className="rounded-full font-semibold h-10"
                style={{ background: "linear-gradient(180deg, #C5A880, #8b7454)", color: "#0a0a0a" }}>
                <Plus className="w-4 h-4 mr-1" /> Provider Baru
              </Button>
            )}
          </div>

          {Object.keys(TYPE_META).map((typeKey) => {
            const list = grouped[typeKey] || [];
            const Icon = TYPE_META[typeKey].icon;
            return (
              <Card key={typeKey} className="card-solid bg-transparent border-white/10 overflow-hidden">
                <div className="flex items-center gap-2 px-5 py-3 border-b border-white/5 bg-white/[0.02]">
                  <Icon className="w-4 h-4 text-[#C5A880]" />
                  <div className="font-medium">{TYPE_META[typeKey].label}</div>
                  <div className="text-xs text-[#71717A]">({list.length})</div>
                </div>
                {list.length === 0 ? (
                  <div className="px-5 py-4 text-sm text-[#71717A]">Belum ada.</div>
                ) : (
                  <div className="divide-y divide-white/5">
                    {list.map((p) => (
                      <div key={p.id} data-testid={`provider-${p.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-white/[0.02] transition-colors group">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ background: (p.color || "#71717A") + "22", color: p.color || "#71717A" }}>
                          <Icon className="w-3.5 h-3.5" />
                        </div>
                        <div className="flex-1 text-sm">{p.name}</div>
                        {p.is_default && <span className="text-[10px] uppercase tracking-widest text-[#71717A]">Default</span>}
                        {isOwner && (
                          <button data-testid={`provider-del-${p.id}`} onClick={() => delProv(p.id, p.name)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-[#71717A] hover:text-[#F43F5E] p-1">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </TabsContent>
      </Tabs>

      <ProviderDialog open={provDialog} onOpenChange={setProvDialog} onCreated={(p) => setProviders((xs) => [...xs, p])} />
    </div>
  );
}
