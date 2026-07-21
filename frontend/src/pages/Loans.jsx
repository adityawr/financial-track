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
import { Plus, Home, Building2, Car, CreditCard, Wallet, Lock, Users, Trash2, ChevronRight, CircleCheck, Clock, TriangleAlert, Pencil } from "lucide-react";

const TYPE_META = {
  mortgage: { label: "KPR / Rumah", icon: Home, color: "#0EA5E9" },
  vehicle: { label: "Kendaraan", icon: Car, color: "#06B6D4" },
  personal: { label: "Personal", icon: Wallet, color: "#8B5CF6" },
  employee: { label: "Employee", icon: Building2, color: "#10B981" },
  credit_card: { label: "Credit Card", icon: CreditCard, color: "#F43F5E" },
};

function LoanDialog({ open, onOpenChange, onSaved, editing }) {
  const isEdit = !!editing;
  const [form, setForm] = useState({
    name: "", type: "mortgage", lender: "", principal: "", interest_rate_annual: "",
    term_months: "12", start_date: new Date().toISOString().slice(0, 10),
    visibility: "SHARED", notes: "",
  });
  const [saving, setSaving] = useState(false);
  const hasPaidInstallment = !!editing && (editing.paid_installments || 0) > 0;

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm({
        name: editing.name || "",
        type: editing.type || "mortgage",
        lender: editing.lender || "",
        principal: String(editing.principal || ""),
        interest_rate_annual: String(editing.interest_rate_annual ?? ""),
        term_months: String(editing.term_months || 12),
        start_date: editing.start_date ? new Date(editing.start_date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
        visibility: editing.visibility || "SHARED",
        notes: editing.notes || "",
      });
    } else {
      setForm({
        name: "", type: "mortgage", lender: "", principal: "", interest_rate_annual: "",
        term_months: "12", start_date: new Date().toISOString().slice(0, 10),
        visibility: "SHARED", notes: "",
      });
    }
  }, [open, editing]);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        lender: form.lender || undefined,
        visibility: form.visibility,
        notes: form.notes || undefined,
      };
      // Include amortization fields only when creating or when no payments made in edit
      if (!isEdit || !hasPaidInstallment) {
        payload.type = form.type;
        payload.principal = Number(String(form.principal).replace(/\D/g, "")) || 0;
        payload.interest_rate_annual = Number(String(form.interest_rate_annual).replace(/[^\d.]/g, "")) || 0;
        payload.term_months = Number(form.term_months) || 12;
        payload.start_date = new Date(form.start_date).toISOString();
      }
      const { data } = isEdit
        ? await api.patch(`/loans/${editing.id}`, payload)
        : await api.post("/loans", payload);
      onSaved(data, isEdit ? "update" : "create");
      onOpenChange(false);
      toast.success(isEdit ? "Pinjaman diperbarui" : "Pinjaman ditambahkan");
    } catch (err) { toast.error(formatApiError(err)); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#141414] border-white/10 text-white max-w-lg" data-testid="loan-dialog">
        <DialogHeader><DialogTitle className="font-display text-2xl">{isEdit ? "Edit Pinjaman" : "Pinjaman Baru"}</DialogTitle></DialogHeader>
        {isEdit && hasPaidInstallment && (
          <div className="text-xs text-[#F59E0B] bg-[#F59E0B]/10 border border-[#F59E0B]/30 rounded-lg p-3">
            {editing.paid_installments} cicilan sudah dibayar — pokok, bunga, tenor, & tgl mulai tidak bisa diubah untuk menjaga integritas jadwal.
          </div>
        )}
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-[#A1A1AA]">Nama</Label>
            <Input data-testid="loan-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="KPR Rumah BSD" className="bg-white/[0.03] border-white/10 h-11" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[#A1A1AA]">Jenis</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })} disabled={isEdit && hasPaidInstallment}>
                <SelectTrigger data-testid="loan-type" className="bg-white/[0.03] border-white/10 h-11"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(TYPE_META).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[#A1A1AA]">Pemberi Pinjaman</Label>
              <Input value={form.lender} onChange={(e) => setForm({ ...form, lender: e.target.value })}
                placeholder="BCA" className="bg-white/[0.03] border-white/10 h-11" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[#A1A1AA]">Pokok (IDR)</Label>
              <Input data-testid="loan-principal" required inputMode="numeric" value={form.principal}
                onChange={(e) => setForm({ ...form, principal: e.target.value })}
                disabled={isEdit && hasPaidInstallment}
                className="bg-white/[0.03] border-white/10 h-11 tabular disabled:opacity-50" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[#A1A1AA]">Bunga (% /tahun)</Label>
              <Input data-testid="loan-rate" required inputMode="decimal" value={form.interest_rate_annual}
                onChange={(e) => setForm({ ...form, interest_rate_annual: e.target.value })}
                disabled={isEdit && hasPaidInstallment}
                placeholder="6" className="bg-white/[0.03] border-white/10 h-11 tabular disabled:opacity-50" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[#A1A1AA]">Tenor (bulan)</Label>
              <Input data-testid="loan-term" required inputMode="numeric" value={form.term_months}
                onChange={(e) => setForm({ ...form, term_months: e.target.value })}
                disabled={isEdit && hasPaidInstallment}
                className="bg-white/[0.03] border-white/10 h-11 tabular disabled:opacity-50" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[#A1A1AA]">Tgl Mulai</Label>
              <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                disabled={isEdit && hasPaidInstallment}
                className="bg-white/[0.03] border-white/10 h-11 disabled:opacity-50" />
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
            <Button type="submit" disabled={saving} data-testid="loan-save" className="rounded-full font-semibold"
              style={{ background: "linear-gradient(180deg, #C5A880, #8b7454)", color: "#0a0a0a" }}>
              {saving ? "…" : (isEdit ? "Simpan Perubahan" : "Buat & Hitung Jadwal")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PayDialog({ loan, installment, accounts, open, onOpenChange, onSaved }) {
  const [accountId, setAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open && installment) {
      setAmount(String(Math.round(installment.installment)));
      setAccountId(accounts[0]?.id || "");
      setNote("");
    }
  }, [open, installment, accounts]);
  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await api.post(`/loans/${loan.id}/pay`, {
        installment_no: installment.no,
        amount: Number(String(amount).replace(/\D/g, "")),
        account_id: accountId || undefined,
        note: note || undefined,
      });
      onSaved(data); onOpenChange(false);
      toast.success(`Cicilan #${installment.no} dibayar`);
    } catch (err) { toast.error(formatApiError(err)); }
    finally { setSaving(false); }
  };
  if (!installment) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#141414] border-white/10 text-white" data-testid="pay-dialog">
        <DialogHeader><DialogTitle className="font-display text-2xl">Bayar Cicilan #{installment.no}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-3 gap-2 p-3 rounded-lg bg-white/[0.03] border border-white/10 text-xs">
            <div><div className="text-[#71717A]">Jatuh Tempo</div><div className="text-white mt-1">{formatDateShort(installment.due_date)}</div></div>
            <div><div className="text-[#71717A]">Pokok</div><div className="text-white mt-1 tabular">{formatIDR(installment.principal)}</div></div>
            <div><div className="text-[#71717A]">Bunga</div><div className="text-white mt-1 tabular">{formatIDR(installment.interest)}</div></div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[#A1A1AA]">Jumlah Bayar (IDR)</Label>
            <Input data-testid="pay-amount" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)}
              className="bg-white/[0.03] border-white/10 h-12 tabular font-display text-2xl" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[#A1A1AA]">Bayar dari Akun (opsional)</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger data-testid="pay-account" className="bg-white/[0.03] border-white/10 h-11"><SelectValue placeholder="— Tanpa akun (tidak potong saldo) —" /></SelectTrigger>
              <SelectContent>
                {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name} · {formatIDR(a.current_balance)}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-[#71717A]">Jika akun dipilih, saldo akan berkurang & transaksi expense otomatis dibuat.</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[#A1A1AA]">Catatan</Label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)}
              className="bg-white/[0.03] border-white/10 resize-none" />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Batal</Button>
            <Button type="submit" disabled={saving} data-testid="pay-submit" className="rounded-full font-semibold"
              style={{ background: "linear-gradient(180deg, #C5A880, #8b7454)", color: "#0a0a0a" }}>{saving ? "…" : "Bayar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function LoanDetail({ loan, accounts, onSaved, onClose }) {
  const [payTarget, setPayTarget] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const schedule = loan.schedule || [];
  const nextIdx = schedule.findIndex((s) => s.status !== "paid");
  const visible = showAll ? schedule : schedule.slice(Math.max(0, nextIdx - 1), nextIdx + 6);
  const meta = TYPE_META[loan.type] || TYPE_META.personal;
  const Icon = meta.icon;
  const progress = loan.total_installments ? (loan.paid_installments / loan.total_installments) * 100 : 0;

  return (
    <Card className="card-solid bg-transparent border-white/10 p-6 space-y-6" data-testid={`loan-detail-${loan.id}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: meta.color + "22", color: meta.color }}><Icon className="w-5 h-5" /></div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-display text-2xl">{loan.name}</h3>
              {loan.visibility === "PRIVATE" ? <Lock className="w-3.5 h-3.5 text-[#71717A]" /> : <Users className="w-3.5 h-3.5 text-[#C5A880]" />}
            </div>
            <div className="text-xs text-[#71717A] mt-1">{meta.label} · {loan.lender || "-"} · {loan.interest_rate_annual}%/thn · {loan.term_months} bulan</div>
          </div>
        </div>
        <button onClick={onClose} className="text-[#71717A] hover:text-white text-sm">Tutup ↑</button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-3 rounded-lg border border-white/10">
          <div className="text-[10px] uppercase tracking-widest text-[#71717A]">Angsuran /bln</div>
          <div className="font-display text-lg tabular mt-1">{formatIDR(loan.monthly_installment)}</div>
        </div>
        <div className="p-3 rounded-lg border border-white/10">
          <div className="text-[10px] uppercase tracking-widest text-[#71717A]">Sisa Pokok</div>
          <div className="font-display text-lg tabular mt-1 text-[#F43F5E]">{formatIDR(loan.principal_outstanding)}</div>
        </div>
        <div className="p-3 rounded-lg border border-white/10">
          <div className="text-[10px] uppercase tracking-widest text-[#71717A]">Sisa Total</div>
          <div className="font-display text-lg tabular mt-1">{formatIDR(loan.outstanding_balance)}</div>
        </div>
        <div className="p-3 rounded-lg border border-white/10">
          <div className="text-[10px] uppercase tracking-widest text-[#71717A]">Progress</div>
          <div className="font-display text-lg tabular mt-1">{loan.paid_installments}/{loan.total_installments}</div>
        </div>
      </div>
      <Progress value={progress} className="h-1.5 bg-white/5" />

      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs uppercase tracking-widest text-[#71717A]">Jadwal Angsuran</div>
          <button onClick={() => setShowAll(!showAll)} className="text-xs text-[#C5A880] hover:underline">
            {showAll ? "Tampilkan sekitar berikutnya" : `Tampilkan semua (${schedule.length})`}
          </button>
        </div>
        <div className="rounded-lg border border-white/10 overflow-hidden divide-y divide-white/5" data-testid="schedule-list">
          {visible.map((s) => {
            const StatusIcon = s.status === "paid" ? CircleCheck : s.status === "overdue" ? TriangleAlert : Clock;
            const cls = s.status === "paid" ? "text-[#10B981]" : s.status === "overdue" ? "text-[#F43F5E]" : "text-[#A1A1AA]";
            return (
              <div key={s.no} className="grid grid-cols-12 gap-2 px-4 py-3 items-center text-sm hover:bg-white/[0.02] transition-colors">
                <div className="col-span-1 text-[#71717A] text-xs">#{s.no}</div>
                <div className="col-span-3 text-white">{formatDateShort(s.due_date)}</div>
                <div className="col-span-2 tabular text-white">{formatIDR(s.installment)}</div>
                <div className="col-span-2 tabular text-[#A1A1AA] text-xs hidden md:block">P:{formatIDR(s.principal)}</div>
                <div className="col-span-2 tabular text-[#71717A] text-xs hidden md:block">B:{formatIDR(s.interest)}</div>
                <div className="col-span-2 flex justify-end items-center gap-2">
                  <StatusIcon className={`w-4 h-4 ${cls}`} />
                  {s.status !== "paid" ? (
                    <Button data-testid={`pay-${loan.id}-${s.no}`} size="sm" onClick={() => setPayTarget(s)}
                      className="h-7 rounded-full font-semibold text-xs"
                      style={{ background: "linear-gradient(180deg, #C5A880, #8b7454)", color: "#0a0a0a" }}>Bayar</Button>
                  ) : (
                    <span className="text-xs text-[#71717A]">{s.paid_date ? formatDateShort(s.paid_date) : "-"}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <PayDialog loan={loan} installment={payTarget} accounts={accounts}
        open={!!payTarget} onOpenChange={(o) => !o && setPayTarget(null)}
        onSaved={onSaved} />
    </Card>
  );
}

export default function Loans() {
  const [loans, setLoans] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [expanded, setExpanded] = useState(null);

  const load = async () => {
    const [l, a] = await Promise.all([api.get("/loans"), api.get("/accounts")]);
    setLoans(l.data); setAccounts(a.data);
  };
  useEffect(() => { load().finally(() => setLoading(false)); }, []);

  const del = async (id) => {
    if (!window.confirm("Tutup pinjaman ini?")) return;
    try { await api.delete(`/loans/${id}`); setLoans((xs) => xs.filter((x) => x.id !== id)); toast.success("Pinjaman ditutup"); }
    catch (err) { toast.error(formatApiError(err)); }
  };

  const handleSaved = (data, mode) => {
    setLoans((xs) => mode === "update" ? xs.map((x) => x.id === data.id ? data : x) : [data, ...xs]);
  };
  const openNew = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (l) => { setEditing(l); setDialogOpen(true); };

  const totalOut = loans.reduce((s, l) => s + (l.principal_outstanding || 0), 0);
  const totalMonthly = loans.reduce((s, l) => s + (l.monthly_installment || 0), 0);

  return (
    <div className="space-y-6" data-testid="loans-page">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-4xl">Pinjaman & Angsuran</h1>
          <p className="text-sm text-[#71717A] mt-1">KPR, kendaraan, personal, dan kartu kredit — dengan jadwal amortisasi otomatis.</p>
        </div>
        <Button data-testid="new-loan-btn" onClick={() => setDialogOpen(true)} className="rounded-full font-semibold h-10"
          style={{ background: "linear-gradient(180deg, #C5A880, #8b7454)", color: "#0a0a0a" }}>
          <Plus className="w-4 h-4 mr-1" /> Pinjaman Baru
        </Button>
      </div>

      {loans.length > 0 && (
        <div className="grid grid-cols-2 gap-4">
          <Card className="card-solid bg-transparent border-white/10 p-5">
            <div className="text-xs uppercase tracking-widest text-[#71717A]">Total Sisa Pokok</div>
            <div className="font-display text-3xl tabular mt-2 text-[#F43F5E]">{formatIDR(totalOut)}</div>
          </Card>
          <Card className="card-solid bg-transparent border-white/10 p-5">
            <div className="text-xs uppercase tracking-widest text-[#71717A]">Angsuran / Bulan</div>
            <div className="font-display text-3xl tabular mt-2">{formatIDR(totalMonthly)}</div>
          </Card>
        </div>
      )}

      {loading ? <div className="text-[#71717A]">…</div> : loans.length === 0 ? (
        <Card className="card-solid bg-transparent border-white/10 border-dashed p-12 text-center">
          <Home className="w-8 h-8 text-[#C5A880] mx-auto mb-3" />
          <div className="text-[#A1A1AA]">Belum ada pinjaman. Tambahkan KPR/kendaraan/personal untuk otomatis dapat jadwal angsuran.</div>
        </Card>
      ) : (
        <div className="space-y-3">
          {loans.map((l) => {
            const meta = TYPE_META[l.type] || TYPE_META.personal;
            const Icon = meta.icon;
            const isOpen = expanded === l.id;
            if (isOpen) {
              return <LoanDetail key={l.id} loan={l} accounts={accounts} onClose={() => setExpanded(null)}
                onSaved={(fresh) => setLoans((xs) => xs.map((x) => x.id === fresh.id ? fresh : x))} />;
            }
            return (
              <Card key={l.id} data-testid={`loan-${l.id}`} className="card-solid bg-transparent border-white/10 p-5 hover:bg-white/[0.02] transition-colors group cursor-pointer"
                onClick={() => setExpanded(l.id)}>
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: meta.color + "22", color: meta.color }}><Icon className="w-5 h-5" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="font-medium truncate">{l.name}</div>
                      {l.visibility === "PRIVATE" ? <Lock className="w-3.5 h-3.5 text-[#71717A]" /> : <Users className="w-3.5 h-3.5 text-[#C5A880]" />}
                    </div>
                    <div className="text-xs text-[#71717A] mt-0.5 truncate">
                      {l.lender || "-"} · {l.interest_rate_annual}%/thn · {l.paid_installments}/{l.total_installments} lunas
                    </div>
                  </div>
                  <div className="text-right hidden sm:block">
                    <div className="text-[10px] uppercase tracking-widest text-[#71717A]">Angsuran</div>
                    <div className="font-medium tabular">{formatIDR(l.monthly_installment)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-widest text-[#71717A]">Sisa Pokok</div>
                    <div className="font-display text-lg tabular text-[#F43F5E]">{formatIDR(l.principal_outstanding)}</div>
                  </div>
                  <button data-testid={`loan-edit-${l.id}`} onClick={(e) => { e.stopPropagation(); openEdit(l); }}
                    className="opacity-0 group-hover:opacity-100 text-[#71717A] hover:text-[#C5A880] p-1 transition-opacity"><Pencil className="w-4 h-4" /></button>
                  <button data-testid={`loan-del-${l.id}`} onClick={(e) => { e.stopPropagation(); del(l.id); }}
                    className="opacity-0 group-hover:opacity-100 text-[#71717A] hover:text-[#F43F5E] p-1 transition-opacity"><Trash2 className="w-4 h-4" /></button>
                  <ChevronRight className="w-4 h-4 text-[#71717A]" />
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <LoanDialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) setEditing(null); }}
        onSaved={handleSaved} editing={editing} />
    </div>
  );
}
