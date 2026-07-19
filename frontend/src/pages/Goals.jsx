import { useEffect, useState } from "react";
import { api, formatApiError } from "../lib/api";
import { formatIDR, formatDateShort } from "../lib/format";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card } from "../components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Textarea } from "../components/ui/textarea";
import { Progress } from "../components/ui/progress";
import { toast } from "sonner";
import { Plus, Target, GraduationCap, Home, Plane, Moon, PiggyBank, Lock, Users, Trash2, TrendingUp } from "lucide-react";

const CAT_META = {
  emergency: { label: "Dana Darurat", icon: PiggyBank, color: "#F43F5E" },
  house: { label: "Rumah", icon: Home, color: "#10B981" },
  education: { label: "Pendidikan", icon: GraduationCap, color: "#8B5CF6" },
  vacation: { label: "Liburan", icon: Plane, color: "#0EA5E9" },
  umrah: { label: "Umrah / Ibadah", icon: Moon, color: "#C5A880" },
  retirement: { label: "Pensiun", icon: Target, color: "#EAB308" },
  other: { label: "Lainnya", icon: Target, color: "#71717A" },
};

function GoalDialog({ open, onOpenChange, onCreated }) {
  const [form, setForm] = useState({ name: "", category: "emergency", target_amount: "", deadline: "", priority: "medium", visibility: "SHARED" });
  const [saving, setSaving] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await api.post("/goals", {
        name: form.name.trim(),
        category: form.category,
        target_amount: Number(String(form.target_amount).replace(/\D/g, "")) || 0,
        deadline: form.deadline ? new Date(form.deadline).toISOString() : undefined,
        priority: form.priority,
        visibility: form.visibility,
      });
      onCreated(data); onOpenChange(false);
      setForm({ name: "", category: "emergency", target_amount: "", deadline: "", priority: "medium", visibility: "SHARED" });
      toast.success("Target dibuat");
    } catch (err) { toast.error(formatApiError(err)); }
    finally { setSaving(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#141414] border-white/10 text-white" data-testid="goal-dialog">
        <DialogHeader><DialogTitle className="font-display text-2xl">Target Baru</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-[#A1A1AA]">Nama Target</Label>
            <Input data-testid="goal-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="mis. Dana Darurat 6 bulan" className="bg-white/[0.03] border-white/10 h-11" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[#A1A1AA]">Kategori</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger data-testid="goal-category" className="bg-white/[0.03] border-white/10 h-11"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(CAT_META).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[#A1A1AA]">Prioritas</Label>
              <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                <SelectTrigger className="bg-white/[0.03] border-white/10 h-11"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="high">Tinggi</SelectItem><SelectItem value="medium">Sedang</SelectItem><SelectItem value="low">Rendah</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[#A1A1AA]">Target Jumlah (IDR)</Label>
              <Input data-testid="goal-target" required inputMode="numeric" value={form.target_amount}
                onChange={(e) => setForm({ ...form, target_amount: e.target.value })}
                className="bg-white/[0.03] border-white/10 h-11 tabular" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[#A1A1AA]">Deadline (opsional)</Label>
              <Input type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })}
                className="bg-white/[0.03] border-white/10 h-11" />
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
            <Button type="submit" disabled={saving} data-testid="goal-save" className="rounded-full font-semibold"
              style={{ background: "linear-gradient(180deg, #C5A880, #8b7454)", color: "#0a0a0a" }}>{saving ? "…" : "Simpan"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ContributeDialog({ goal, accounts, open, onOpenChange, onSaved }) {
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) { setAmount(""); setAccountId(""); setNote(""); } }, [open]);
  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await api.post(`/goals/${goal.id}/contribute`, {
        amount: Number(String(amount).replace(/\D/g, "")) || 0,
        account_id: accountId || undefined,
        note: note || undefined,
      });
      onSaved(data); onOpenChange(false);
      toast.success("Kontribusi ditambahkan");
    } catch (err) { toast.error(formatApiError(err)); }
    finally { setSaving(false); }
  };
  if (!goal) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#141414] border-white/10 text-white">
        <DialogHeader><DialogTitle className="font-display text-2xl">Kontribusi ke {goal.name}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-[#A1A1AA]">Jumlah (IDR)</Label>
            <Input data-testid="contrib-amount" required inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)}
              className="bg-white/[0.03] border-white/10 h-12 tabular font-display text-2xl" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[#A1A1AA]">Bayar dari Akun (opsional)</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger className="bg-white/[0.03] border-white/10 h-11"><SelectValue placeholder="— Tanpa akun —" /></SelectTrigger>
              <SelectContent>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name} · {formatIDR(a.current_balance)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[#A1A1AA]">Catatan</Label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)}
              className="bg-white/[0.03] border-white/10 resize-none" />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Batal</Button>
            <Button type="submit" disabled={saving} className="rounded-full font-semibold"
              style={{ background: "linear-gradient(180deg, #C5A880, #8b7454)", color: "#0a0a0a" }}>{saving ? "…" : "Tambah"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Goals() {
  const [goals, setGoals] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [contribGoal, setContribGoal] = useState(null);

  const load = async () => {
    const [g, a] = await Promise.all([api.get("/goals"), api.get("/accounts")]);
    setGoals(g.data); setAccounts(a.data);
  };
  useEffect(() => { load().finally(() => setLoading(false)); }, []);

  const del = async (id) => {
    if (!window.confirm("Arsipkan target ini?")) return;
    try { await api.delete(`/goals/${id}`); setGoals((xs) => xs.filter((x) => x.id !== id)); toast.success("Target diarsip"); }
    catch (err) { toast.error(formatApiError(err)); }
  };

  return (
    <div className="space-y-6" data-testid="goals-page">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-4xl">Target Tabungan</h1>
          <p className="text-sm text-[#71717A] mt-1">Dana darurat, rumah, pendidikan, umrah, pensiun.</p>
        </div>
        <Button data-testid="new-goal-btn" onClick={() => setDialogOpen(true)} className="rounded-full font-semibold h-10"
          style={{ background: "linear-gradient(180deg, #C5A880, #8b7454)", color: "#0a0a0a" }}>
          <Plus className="w-4 h-4 mr-1" /> Target Baru
        </Button>
      </div>

      {loading ? <div className="text-[#71717A]">…</div> : goals.length === 0 ? (
        <Card className="card-solid bg-transparent border-white/10 border-dashed p-12 text-center">
          <Target className="w-8 h-8 text-[#C5A880] mx-auto mb-3" />
          <div className="text-[#A1A1AA]">Belum ada target. Mulai dengan Dana Darurat — target klasik keluarga sehat.</div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {goals.map((g) => {
            const meta = CAT_META[g.category] || CAT_META.other;
            const Icon = meta.icon;
            const remaining = Math.max(0, (g.target_amount || 0) - (g.current_amount || 0));
            return (
              <Card key={g.id} data-testid={`goal-${g.id}`} className="card-solid bg-transparent border-white/10 p-5 group hover:bg-white/[0.02] transition-colors">
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: meta.color + "22", color: meta.color }}><Icon className="w-5 h-5" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="font-medium truncate">{g.name}</div>
                      {g.visibility === "PRIVATE" ? <Lock className="w-3.5 h-3.5 text-[#71717A]" /> : <Users className="w-3.5 h-3.5 text-[#C5A880]" />}
                    </div>
                    <div className="text-xs text-[#71717A] mt-0.5">{meta.label}{g.deadline ? ` · Deadline ${formatDateShort(g.deadline)}` : ""}</div>
                  </div>
                  <button data-testid={`goal-del-${g.id}`} onClick={() => del(g.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-[#71717A] hover:text-[#F43F5E] p-1"><Trash2 className="w-4 h-4" /></button>
                </div>
                <div className="mt-4 space-y-2">
                  <div className="flex items-baseline justify-between">
                    <div className="font-display text-2xl tabular">{formatIDR(g.current_amount)}</div>
                    <div className="text-sm text-[#71717A] tabular">/ {formatIDR(g.target_amount)}</div>
                  </div>
                  <Progress value={g.progress} className="h-1.5 bg-white/5" />
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#C5A880] font-medium">{g.progress}%</span>
                    <span className="text-[#71717A]">Sisa {formatIDR(remaining)}</span>
                  </div>
                </div>
                <Button data-testid={`goal-contrib-${g.id}`} onClick={() => setContribGoal(g)}
                  className="w-full mt-4 rounded-full font-semibold h-9"
                  style={{ background: "linear-gradient(180deg, #C5A880, #8b7454)", color: "#0a0a0a" }}>
                  <TrendingUp className="w-3.5 h-3.5 mr-1" /> Tambah Kontribusi
                </Button>
              </Card>
            );
          })}
        </div>
      )}

      <GoalDialog open={dialogOpen} onOpenChange={setDialogOpen} onCreated={(g) => setGoals((xs) => [g, ...xs])} />
      <ContributeDialog goal={contribGoal} accounts={accounts}
        open={!!contribGoal} onOpenChange={(o) => !o && setContribGoal(null)}
        onSaved={(g) => setGoals((xs) => xs.map((x) => x.id === g.id ? g : x))} />
    </div>
  );
}
