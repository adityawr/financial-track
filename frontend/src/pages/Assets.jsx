import { useEffect, useState } from "react";
import { api, formatApiError } from "../lib/api";
import { formatIDR, formatDateShort } from "../lib/format";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Card } from "../components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { toast } from "sonner";
import { Plus, Home, Landmark, Car, Coins, Package, Lock, Users, Trash2, TrendingUp } from "lucide-react";

const CATS = {
  house: { label: "Rumah", icon: Home, color: "#10B981" },
  land: { label: "Tanah", icon: Landmark, color: "#84CC16" },
  vehicle: { label: "Kendaraan", icon: Car, color: "#06B6D4" },
  gold: { label: "Emas", icon: Coins, color: "#C5A880" },
  other: { label: "Lainnya", icon: Package, color: "#71717A" },
};

function AssetDialog({ open, onOpenChange, onCreated }) {
  const [form, setForm] = useState({ name: "", category: "house", purchase_value: "0", current_value: "0", visibility: "SHARED", notes: "" });
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await api.post("/assets", {
        name: form.name.trim(),
        category: form.category,
        purchase_value: Number(String(form.purchase_value).replace(/\D/g, "")) || 0,
        current_value: Number(String(form.current_value).replace(/\D/g, "")) || 0,
        visibility: form.visibility,
        notes: form.notes || undefined,
      });
      onCreated(data);
      onOpenChange(false);
      setForm({ name: "", category: "house", purchase_value: "0", current_value: "0", visibility: "SHARED", notes: "" });
      toast.success("Aset ditambahkan");
    } catch (err) { toast.error(formatApiError(err)); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#141414] border-white/10 text-white max-w-lg" data-testid="asset-dialog">
        <DialogHeader><DialogTitle className="font-display text-2xl">Aset Baru</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-[#A1A1AA]">Nama Aset</Label>
            <Input data-testid="asset-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="mis. Rumah Bandung" className="bg-white/[0.03] border-white/10 h-11" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[#A1A1AA]">Kategori</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger data-testid="asset-category" className="bg-white/[0.03] border-white/10 h-11"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(CATS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[#A1A1AA]">Visibilitas</Label>
              <Select value={form.visibility} onValueChange={(v) => setForm({ ...form, visibility: v })}>
                <SelectTrigger data-testid="asset-visibility" className="bg-white/[0.03] border-white/10 h-11"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="PRIVATE">Pribadi</SelectItem><SelectItem value="SHARED">Bersama</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[#A1A1AA]">Harga Beli (IDR)</Label>
              <Input data-testid="asset-purchase" inputMode="numeric" value={form.purchase_value}
                onChange={(e) => setForm({ ...form, purchase_value: e.target.value })}
                className="bg-white/[0.03] border-white/10 h-11 tabular" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[#A1A1AA]">Nilai Sekarang (IDR)</Label>
              <Input data-testid="asset-current" inputMode="numeric" value={form.current_value}
                onChange={(e) => setForm({ ...form, current_value: e.target.value })}
                className="bg-white/[0.03] border-white/10 h-11 tabular" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[#A1A1AA]">Catatan</Label>
            <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="bg-white/[0.03] border-white/10 resize-none" />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Batal</Button>
            <Button type="submit" disabled={saving} data-testid="asset-save" className="rounded-full font-semibold"
              style={{ background: "linear-gradient(180deg, #C5A880, #8b7454)", color: "#0a0a0a" }}>{saving ? "…" : "Simpan"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ValuationDialog({ asset, open, onOpenChange, onSaved }) {
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open && asset) setValue(String(asset.current_value || 0)); }, [open, asset]);
  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await api.post(`/assets/${asset.id}/valuation`, {
        value: Number(String(value).replace(/\D/g, "")) || 0, note: note || undefined,
      });
      onSaved(data);
      onOpenChange(false);
      toast.success("Valuasi diperbarui");
    } catch (err) { toast.error(formatApiError(err)); }
    finally { setSaving(false); }
  };
  if (!asset) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#141414] border-white/10 text-white">
        <DialogHeader><DialogTitle className="font-display text-2xl">Update Valuasi</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="text-sm text-[#A1A1AA]">{asset.name}</div>
          <div className="space-y-1.5">
            <Label className="text-[#A1A1AA]">Nilai Baru (IDR)</Label>
            <Input inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)}
              className="bg-white/[0.03] border-white/10 h-11 tabular font-display text-xl" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[#A1A1AA]">Catatan</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Alasan perubahan"
              className="bg-white/[0.03] border-white/10 h-11" />
          </div>
          {asset.valuation_history?.length > 0 && (
            <div className="max-h-40 overflow-auto border border-white/10 rounded-lg divide-y divide-white/5">
              {[...asset.valuation_history].reverse().slice(0, 5).map((h, i) => (
                <div key={i} className="px-3 py-2 flex justify-between text-xs">
                  <span className="text-[#71717A]">{formatDateShort(h.date)}</span>
                  <span className="tabular text-white">{formatIDR(h.value)}</span>
                </div>
              ))}
            </div>
          )}
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

export default function Assets() {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [valDialog, setValDialog] = useState(null);

  const load = () => api.get("/assets").then((r) => setAssets(r.data)).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const del = async (id) => {
    try { await api.delete(`/assets/${id}`); setAssets((xs) => xs.filter((x) => x.id !== id)); toast.success("Aset dihapus"); }
    catch (err) { toast.error(formatApiError(err)); }
  };

  const totalValue = assets.reduce((s, a) => s + (a.current_value || 0), 0);
  const totalPurchase = assets.reduce((s, a) => s + (a.purchase_value || 0), 0);
  const totalGain = totalValue - totalPurchase;

  return (
    <div className="space-y-6" data-testid="assets-page">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-4xl">Aset</h1>
          <p className="text-sm text-[#71717A] mt-1">Rumah, tanah, kendaraan, emas & lainnya.</p>
        </div>
        <Button data-testid="new-asset-btn" onClick={() => setDialogOpen(true)} className="rounded-full font-semibold h-10"
          style={{ background: "linear-gradient(180deg, #C5A880, #8b7454)", color: "#0a0a0a" }}>
          <Plus className="w-4 h-4 mr-1" /> Aset Baru
        </Button>
      </div>

      {assets.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <Card className="card-solid bg-transparent border-white/10 p-5">
            <div className="text-xs uppercase tracking-widest text-[#71717A]">Total Nilai</div>
            <div className="font-display text-2xl tabular mt-2">{formatIDR(totalValue)}</div>
          </Card>
          <Card className="card-solid bg-transparent border-white/10 p-5">
            <div className="text-xs uppercase tracking-widest text-[#71717A]">Harga Beli</div>
            <div className="font-display text-2xl tabular mt-2 text-[#A1A1AA]">{formatIDR(totalPurchase)}</div>
          </Card>
          <Card className="card-solid bg-transparent border-white/10 p-5">
            <div className="text-xs uppercase tracking-widest text-[#71717A]">Gain / Loss</div>
            <div className={`font-display text-2xl tabular mt-2 ${totalGain >= 0 ? "text-[#10B981]" : "text-[#F43F5E]"}`}>
              {totalGain >= 0 ? "+" : ""}{formatIDR(totalGain)}
            </div>
          </Card>
        </div>
      )}

      {loading ? <div className="text-[#71717A]">…</div> : assets.length === 0 ? (
        <Card className="card-solid bg-transparent border-white/10 border-dashed p-12 text-center">
          <Package className="w-8 h-8 text-[#C5A880] mx-auto mb-3" />
          <div className="text-[#A1A1AA] mb-4">Belum ada aset. Mulai catat rumah, kendaraan, atau emas Anda.</div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {assets.map((a) => {
            const meta = CATS[a.category] || CATS.other;
            const Icon = meta.icon;
            const gain = (a.current_value || 0) - (a.purchase_value || 0);
            return (
              <Card key={a.id} data-testid={`asset-${a.id}`} className="card-solid bg-transparent border-white/10 p-5 group hover:bg-white/[0.02] transition-colors">
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: meta.color + "22", color: meta.color }}><Icon className="w-5 h-5" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="font-medium truncate">{a.name}</div>
                      {a.visibility === "PRIVATE" ? <Lock className="w-3.5 h-3.5 text-[#71717A]" /> : <Users className="w-3.5 h-3.5 text-[#C5A880]" />}
                    </div>
                    <div className="text-xs text-[#71717A] mt-0.5">{meta.label}</div>
                  </div>
                  <button data-testid={`asset-del-${a.id}`} onClick={() => del(a.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-[#71717A] hover:text-[#F43F5E] p-1"><Trash2 className="w-4 h-4" /></button>
                </div>
                <div className="mt-5 flex items-end justify-between">
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-[#71717A]">Nilai Sekarang</div>
                    <div className="font-display text-2xl tabular">{formatIDR(a.current_value)}</div>
                    <div className={`text-xs tabular mt-1 ${gain >= 0 ? "text-[#10B981]" : "text-[#F43F5E]"}`}>
                      {gain >= 0 ? "+" : ""}{formatIDR(gain)} dari harga beli
                    </div>
                  </div>
                  <Button data-testid={`asset-reval-${a.id}`} size="sm" variant="ghost" onClick={() => setValDialog(a)}
                    className="text-[#C5A880] hover:bg-[#C5A880]/10 rounded-full h-8">
                    <TrendingUp className="w-3.5 h-3.5 mr-1" /> Revaluasi
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <AssetDialog open={dialogOpen} onOpenChange={setDialogOpen} onCreated={(a) => setAssets((xs) => [a, ...xs])} />
      <ValuationDialog asset={valDialog} open={!!valDialog} onOpenChange={(o) => !o && setValDialog(null)}
        onSaved={(a) => setAssets((xs) => xs.map((x) => x.id === a.id ? a : x))} />
    </div>
  );
}
