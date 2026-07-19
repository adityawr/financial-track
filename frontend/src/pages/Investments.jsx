import { useEffect, useState } from "react";
import { api, formatApiError } from "../lib/api";
import { formatIDR, formatDateShort } from "../lib/format";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card } from "../components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "../components/ui/tabs";
import { toast } from "sonner";
import { Plus, Coins, Landmark, LineChart as LineChartIcon, Lock, Users, Trash2, RefreshCw } from "lucide-react";

const TYPE_META = {
  gold: { label: "Emas", icon: Coins, color: "#C5A880" },
  time_deposit: { label: "Deposito", icon: Landmark, color: "#10B981" },
  mutual_fund: { label: "Reksadana", icon: LineChartIcon, color: "#0EA5E9" },
};

function InvestmentDialog({ open, onOpenChange, onCreated }) {
  const [type, setType] = useState("gold");
  const [form, setForm] = useState({
    name: "", units: "", unit_price: "", principal: "0", current_value: "0",
    bank: "", interest_rate: "", maturity_date: "",
    visibility: "PRIVATE", notes: "",
  });
  const [saving, setSaving] = useState(false);

  // Auto-compute for gold
  useEffect(() => {
    if (type === "gold") {
      const u = Number(String(form.units).replace(/[^\d.]/g, "")) || 0;
      const p = Number(String(form.unit_price).replace(/[^\d.]/g, "")) || 0;
      const total = u * p;
      setForm((s) => ({ ...s, principal: String(Math.round(total)), current_value: String(Math.round(total)) }));
    }
    // eslint-disable-next-line
  }, [form.units, form.unit_price, type]);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        type,
        name: form.name.trim() || TYPE_META[type].label,
        principal: Number(String(form.principal).replace(/\D/g, "")) || 0,
        current_value: Number(String(form.current_value).replace(/\D/g, "")) || 0,
        visibility: form.visibility,
        notes: form.notes || undefined,
      };
      if (type === "gold") {
        payload.units = Number(String(form.units).replace(/[^\d.]/g, "")) || 0;
        payload.unit_price = Number(String(form.unit_price).replace(/[^\d.]/g, "")) || 0;
      }
      if (type === "time_deposit") {
        payload.bank = form.bank || undefined;
        payload.interest_rate = Number(String(form.interest_rate).replace(/[^\d.]/g, "")) || 0;
        if (form.maturity_date) payload.maturity_date = new Date(form.maturity_date).toISOString();
      }
      if (type === "mutual_fund") {
        payload.units = Number(String(form.units).replace(/[^\d.]/g, "")) || 0;
        payload.unit_price = Number(String(form.unit_price).replace(/[^\d.]/g, "")) || 0;
      }
      const { data } = await api.post("/investments", payload);
      onCreated(data);
      onOpenChange(false);
      setForm({ name: "", units: "", unit_price: "", principal: "0", current_value: "0", bank: "", interest_rate: "", maturity_date: "", visibility: "PRIVATE", notes: "" });
      toast.success("Investasi ditambahkan");
    } catch (err) { toast.error(formatApiError(err)); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#141414] border-white/10 text-white max-w-lg" data-testid="inv-dialog">
        <DialogHeader><DialogTitle className="font-display text-2xl">Investasi Baru</DialogTitle></DialogHeader>
        <Tabs value={type} onValueChange={setType}>
          <TabsList className="grid grid-cols-3 bg-white/[0.03] border border-white/10 h-10">
            <TabsTrigger value="gold">Emas</TabsTrigger>
            <TabsTrigger value="time_deposit">Deposito</TabsTrigger>
            <TabsTrigger value="mutual_fund">Reksadana</TabsTrigger>
          </TabsList>
        </Tabs>
        <form onSubmit={submit} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label className="text-[#A1A1AA]">Nama</Label>
            <Input data-testid="inv-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder={type === "gold" ? "mis. Emas Antam" : type === "time_deposit" ? "Deposito 12 Bulan" : "Reksadana XYZ"}
              className="bg-white/[0.03] border-white/10 h-11" />
          </div>
          {type === "gold" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[#A1A1AA]">Berat (gram)</Label>
                <Input inputMode="decimal" value={form.units} onChange={(e) => setForm({ ...form, units: e.target.value })}
                  placeholder="10" className="bg-white/[0.03] border-white/10 h-11 tabular" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[#A1A1AA]">Harga/gr (IDR)</Label>
                <Input inputMode="numeric" value={form.unit_price} onChange={(e) => setForm({ ...form, unit_price: e.target.value })}
                  placeholder="1200000" className="bg-white/[0.03] border-white/10 h-11 tabular" />
              </div>
            </div>
          )}
          {type === "time_deposit" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-[#A1A1AA]">Bank</Label>
                  <Input value={form.bank} onChange={(e) => setForm({ ...form, bank: e.target.value })}
                    placeholder="BCA" className="bg-white/[0.03] border-white/10 h-11" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[#A1A1AA]">Bunga /tahun (%)</Label>
                  <Input inputMode="decimal" value={form.interest_rate} onChange={(e) => setForm({ ...form, interest_rate: e.target.value })}
                    placeholder="5.5" className="bg-white/[0.03] border-white/10 h-11 tabular" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[#A1A1AA]">Jatuh Tempo</Label>
                <Input type="date" value={form.maturity_date} onChange={(e) => setForm({ ...form, maturity_date: e.target.value })}
                  className="bg-white/[0.03] border-white/10 h-11" />
              </div>
            </>
          )}
          {type === "mutual_fund" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[#A1A1AA]">Unit</Label>
                <Input inputMode="decimal" value={form.units} onChange={(e) => setForm({ ...form, units: e.target.value })}
                  className="bg-white/[0.03] border-white/10 h-11 tabular" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[#A1A1AA]">NAV</Label>
                <Input inputMode="decimal" value={form.unit_price} onChange={(e) => setForm({ ...form, unit_price: e.target.value })}
                  className="bg-white/[0.03] border-white/10 h-11 tabular" />
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[#A1A1AA]">Modal (IDR)</Label>
              <Input inputMode="numeric" value={form.principal} onChange={(e) => setForm({ ...form, principal: e.target.value })}
                className="bg-white/[0.03] border-white/10 h-11 tabular" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[#A1A1AA]">Nilai Sekarang (IDR)</Label>
              <Input inputMode="numeric" value={form.current_value} onChange={(e) => setForm({ ...form, current_value: e.target.value })}
                className="bg-white/[0.03] border-white/10 h-11 tabular" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[#A1A1AA]">Visibilitas</Label>
            <Select value={form.visibility} onValueChange={(v) => setForm({ ...form, visibility: v })}>
              <SelectTrigger className="bg-white/[0.03] border-white/10 h-11"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="PRIVATE">Pribadi</SelectItem><SelectItem value="SHARED">Bersama</SelectItem></SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Batal</Button>
            <Button type="submit" disabled={saving} data-testid="inv-save" className="rounded-full font-semibold"
              style={{ background: "linear-gradient(180deg, #C5A880, #8b7454)", color: "#0a0a0a" }}>{saving ? "…" : "Simpan"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PriceDialog({ inv, open, onOpenChange, onSaved }) {
  const [price, setPrice] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open && inv) setPrice(String(inv.unit_price || "")); }, [open, inv]);
  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await api.post(`/investments/${inv.id}/price`, {
        unit_price: Number(String(price).replace(/[^\d.]/g, "")) || 0,
      });
      onSaved(data); onOpenChange(false); toast.success("Harga diperbarui");
    } catch (err) { toast.error(formatApiError(err)); }
    finally { setSaving(false); }
  };
  if (!inv) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#141414] border-white/10 text-white">
        <DialogHeader><DialogTitle className="font-display text-2xl">Update Harga</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="text-sm text-[#A1A1AA]">{inv.name}</div>
          <div className="space-y-1.5">
            <Label className="text-[#A1A1AA]">{inv.type === "gold" ? "Harga/gr (IDR)" : "NAV / harga per unit"}</Label>
            <Input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)}
              className="bg-white/[0.03] border-white/10 h-11 tabular font-display text-xl" />
          </div>
          <div className="text-xs text-[#71717A]">Unit saat ini: <span className="tabular text-white">{inv.units}</span></div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Batal</Button>
            <Button type="submit" disabled={saving} className="rounded-full font-semibold"
              style={{ background: "linear-gradient(180deg, #C5A880, #8b7454)", color: "#0a0a0a" }}>{saving ? "…" : "Simpan"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Investments() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [priceDialog, setPriceDialog] = useState(null);

  const load = () => api.get("/investments").then((r) => setItems(r.data)).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const del = async (id) => {
    try { await api.delete(`/investments/${id}`); setItems((xs) => xs.filter((x) => x.id !== id)); toast.success("Investasi ditutup"); }
    catch (err) { toast.error(formatApiError(err)); }
  };

  const totalPrincipal = items.reduce((s, i) => s + (i.principal || 0), 0);
  const totalValue = items.reduce((s, i) => s + (i.current_value || 0), 0);
  const totalGain = totalValue - totalPrincipal;

  return (
    <div className="space-y-6" data-testid="investments-page">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-4xl">Investasi</h1>
          <p className="text-sm text-[#71717A] mt-1">Emas, Deposito, Reksadana — pantau perkembangan portofolio.</p>
        </div>
        <Button data-testid="new-inv-btn" onClick={() => setDialogOpen(true)} className="rounded-full font-semibold h-10"
          style={{ background: "linear-gradient(180deg, #C5A880, #8b7454)", color: "#0a0a0a" }}>
          <Plus className="w-4 h-4 mr-1" /> Investasi Baru
        </Button>
      </div>

      {items.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <Card className="card-solid bg-transparent border-white/10 p-5">
            <div className="text-xs uppercase tracking-widest text-[#71717A]">Modal</div>
            <div className="font-display text-2xl tabular mt-2 text-[#A1A1AA]">{formatIDR(totalPrincipal)}</div>
          </Card>
          <Card className="card-solid bg-transparent border-white/10 p-5">
            <div className="text-xs uppercase tracking-widest text-[#71717A]">Nilai Sekarang</div>
            <div className="font-display text-2xl tabular mt-2">{formatIDR(totalValue)}</div>
          </Card>
          <Card className="card-solid bg-transparent border-white/10 p-5">
            <div className="text-xs uppercase tracking-widest text-[#71717A]">Gain / Loss</div>
            <div className={`font-display text-2xl tabular mt-2 ${totalGain >= 0 ? "text-[#10B981]" : "text-[#F43F5E]"}`}>
              {totalGain >= 0 ? "+" : ""}{formatIDR(totalGain)}
            </div>
          </Card>
        </div>
      )}

      {loading ? <div className="text-[#71717A]">…</div> : items.length === 0 ? (
        <Card className="card-solid bg-transparent border-white/10 border-dashed p-12 text-center">
          <Coins className="w-8 h-8 text-[#C5A880] mx-auto mb-3" />
          <div className="text-[#A1A1AA]">Mulai catat investasi Anda — emas, deposito, atau reksadana.</div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {items.map((i) => {
            const meta = TYPE_META[i.type];
            const Icon = meta.icon;
            const gain = (i.current_value || 0) - (i.principal || 0);
            const pct = i.principal ? (gain / i.principal) * 100 : 0;
            return (
              <Card key={i.id} data-testid={`inv-${i.id}`} className="card-solid bg-transparent border-white/10 p-5 group hover:bg-white/[0.02] transition-colors">
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: meta.color + "22", color: meta.color }}><Icon className="w-5 h-5" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="font-medium truncate">{i.name}</div>
                      {i.visibility === "PRIVATE" ? <Lock className="w-3.5 h-3.5 text-[#71717A]" /> : <Users className="w-3.5 h-3.5 text-[#C5A880]" />}
                    </div>
                    <div className="text-xs text-[#71717A] mt-0.5">
                      {meta.label}
                      {i.type === "gold" && i.units ? ` · ${i.units} gr @ ${formatIDR(i.unit_price)}` : ""}
                      {i.type === "time_deposit" && i.interest_rate ? ` · ${i.interest_rate}%/thn @ ${i.bank || "-"}` : ""}
                      {i.type === "mutual_fund" && i.units ? ` · ${i.units} unit @ ${formatIDR(i.unit_price)}` : ""}
                    </div>
                  </div>
                  <button data-testid={`inv-del-${i.id}`} onClick={() => del(i.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-[#71717A] hover:text-[#F43F5E] p-1"><Trash2 className="w-4 h-4" /></button>
                </div>
                <div className="mt-5 flex items-end justify-between">
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-[#71717A]">Nilai Sekarang</div>
                    <div className="font-display text-2xl tabular">{formatIDR(i.current_value)}</div>
                    <div className={`text-xs tabular mt-1 ${gain >= 0 ? "text-[#10B981]" : "text-[#F43F5E]"}`}>
                      {gain >= 0 ? "+" : ""}{formatIDR(gain)} ({pct.toFixed(1)}%)
                    </div>
                  </div>
                  {i.type !== "time_deposit" && (
                    <Button data-testid={`inv-price-${i.id}`} size="sm" variant="ghost" onClick={() => setPriceDialog(i)}
                      className="text-[#C5A880] hover:bg-[#C5A880]/10 rounded-full h-8">
                      <RefreshCw className="w-3.5 h-3.5 mr-1" /> Update Harga
                    </Button>
                  )}
                  {i.type === "time_deposit" && i.maturity_date && (
                    <div className="text-xs text-[#71717A]">Jt: {formatDateShort(i.maturity_date)}</div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <InvestmentDialog open={dialogOpen} onOpenChange={setDialogOpen} onCreated={(i) => setItems((xs) => [i, ...xs])} />
      <PriceDialog inv={priceDialog} open={!!priceDialog} onOpenChange={(o) => !o && setPriceDialog(null)}
        onSaved={(i) => setItems((xs) => xs.map((x) => x.id === i.id ? i : x))} />
    </div>
  );
}
