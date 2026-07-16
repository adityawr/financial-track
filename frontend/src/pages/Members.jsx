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
import { toast } from "sonner";
import { UserPlus, Copy, Trash2, ShieldCheck, Crown, Link as LinkIcon, Clock } from "lucide-react";
import { formatDateShort } from "../lib/format";

const ROLE_BADGE = {
  Owner: { text: "text-[#C5A880]", bg: "bg-[#C5A880]/12", border: "border-[#C5A880]/40" },
  Editor: { text: "text-[#10B981]", bg: "bg-[#10B981]/10", border: "border-[#10B981]/30" },
  Viewer: { text: "text-[#A1A1AA]", bg: "bg-white/[0.06]", border: "border-white/10" },
  Child: { text: "text-[#F59E0B]", bg: "bg-[#F59E0B]/10", border: "border-[#F59E0B]/30" },
};

function inviteUrl(token) {
  return `${window.location.origin}/auth?invite=${encodeURIComponent(token)}`;
}

function InviteDialog({ open, onOpenChange, onCreated }) {
  const { t } = useI18n();
  const [form, setForm] = useState({ email: "", role: "Editor" });
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { data } = await api.post("/family/invites", { email: form.email.trim(), role: form.role });
      setCreated(data);
      onCreated?.(data);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const copyLink = async (token) => {
    try {
      await navigator.clipboard.writeText(inviteUrl(token));
      toast.success(t("members.link_copied"));
    } catch {
      toast.error("Gagal menyalin");
    }
  };

  const reset = () => {
    setCreated(null);
    setForm({ email: "", role: "Editor" });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="bg-[#141414] border-white/10 text-white" data-testid="invite-dialog">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">{t("members.invite")}</DialogTitle>
        </DialogHeader>
        {!created ? (
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-[#A1A1AA]">Email</Label>
              <Input data-testid="invite-email" type="email" required value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="anggota@keluarga.id"
                className="bg-white/[0.03] border-white/10 h-11" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[#A1A1AA]">{t("members.role")}</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger data-testid="invite-role" className="bg-white/[0.03] border-white/10 h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Editor">Editor — {t("members.role_editor_desc")}</SelectItem>
                  <SelectItem value="Viewer">Viewer — {t("members.role_viewer_desc")}</SelectItem>
                  <SelectItem value="Child">Child — {t("members.role_child_desc")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} data-testid="invite-cancel">{t("action.cancel")}</Button>
              <Button type="submit" disabled={submitting} data-testid="invite-submit"
                className="rounded-full font-semibold"
                style={{ background: "linear-gradient(180deg, #C5A880, #8b7454)", color: "#0a0a0a" }}>
                {submitting ? "…" : t("members.generate_link")}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="space-y-4" data-testid="invite-result">
            <div className="p-4 rounded-lg border border-[#C5A880]/30 bg-[#C5A880]/[0.05]">
              <div className="text-xs uppercase tracking-widest text-[#C5A880] mb-2">{t("members.share_link_title")}</div>
              <div className="text-sm text-[#A1A1AA] mb-3">{t("members.share_link_desc")}</div>
              <div className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-lg p-2 pl-3">
                <LinkIcon className="w-4 h-4 text-[#71717A] flex-shrink-0" />
                <div data-testid="invite-link" className="text-xs text-white truncate flex-1 font-mono">{inviteUrl(created.token)}</div>
                <Button size="sm" onClick={() => copyLink(created.token)} data-testid="invite-copy"
                  className="h-8 rounded-full flex-shrink-0"
                  style={{ background: "linear-gradient(180deg, #C5A880, #8b7454)", color: "#0a0a0a" }}>
                  <Copy className="w-3.5 h-3.5 mr-1" /> {t("action.copy")}
                </Button>
              </div>
              <div className="mt-3 text-xs text-[#71717A]">
                {t("members.for")} <span className="text-white">{created.email}</span> · {t("members.role")}: <span className="text-white">{created.role}</span>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={reset} data-testid="invite-another">{t("members.invite_another")}</Button>
              <Button onClick={() => onOpenChange(false)} data-testid="invite-done"
                className="rounded-full font-semibold"
                style={{ background: "linear-gradient(180deg, #C5A880, #8b7454)", color: "#0a0a0a" }}>
                {t("action.done")}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RoleBadge({ role }) {
  const s = ROLE_BADGE[role] || ROLE_BADGE.Viewer;
  return (
    <span className={`text-[10px] uppercase tracking-widest px-2 py-1 rounded-full border ${s.text} ${s.bg} ${s.border}`}>{role}</span>
  );
}

export default function Members() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [family, setFamily] = useState(null);
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = async () => {
    const [f, i] = await Promise.all([
      api.get("/family/current"),
      api.get("/family/invites"),
    ]);
    setFamily(f.data);
    setInvites(i.data);
  };

  useEffect(() => { load().finally(() => setLoading(false)); }, []);

  const isOwner = user && family && family.owner_id === user.id;

  const copyLink = async (token) => {
    try {
      await navigator.clipboard.writeText(inviteUrl(token));
      toast.success(t("members.link_copied"));
    } catch {
      toast.error("Gagal menyalin");
    }
  };

  const revoke = async (id) => {
    try {
      await api.delete(`/family/invites/${id}`);
      setInvites((xs) => xs.map((x) => (x.id === id ? { ...x, status: "revoked" } : x)));
      toast.success(t("members.invite_revoked"));
    } catch (err) { toast.error(formatApiError(err)); }
  };

  const changeRole = async (uid, role) => {
    try {
      await api.patch(`/family/members/${uid}`, { role });
      await load();
      toast.success(t("members.role_updated"));
    } catch (err) { toast.error(formatApiError(err)); }
  };

  const removeMember = async (uid, name) => {
    if (!window.confirm(t("members.confirm_remove").replace("{name}", name))) return;
    try {
      await api.delete(`/family/members/${uid}`);
      await load();
      toast.success(t("members.member_removed"));
    } catch (err) { toast.error(formatApiError(err)); }
  };

  if (loading) return <div className="text-[#71717A]">…</div>;

  const pendingInvites = invites.filter((i) => i.status === "pending");

  return (
    <div className="space-y-8" data-testid="members-page">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-4xl">{t("members.title")}</h1>
          <p className="text-sm text-[#71717A] mt-1">{family?.name} · {family?.members?.length} {t("members.people")}</p>
        </div>
        {isOwner && (
          <Button data-testid="new-invite-btn" onClick={() => setDialogOpen(true)}
            className="rounded-full font-semibold h-10"
            style={{ background: "linear-gradient(180deg, #C5A880, #8b7454)", color: "#0a0a0a" }}>
            <UserPlus className="w-4 h-4 mr-1.5" /> {t("members.invite")}
          </Button>
        )}
      </div>

      {/* Member list */}
      <Card className="card-solid bg-transparent border-white/10 overflow-hidden divide-y divide-white/5" data-testid="member-list">
        {family?.members?.map((m) => (
          <div key={m.id} className="flex items-center gap-4 px-6 py-4">
            <div className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center border border-white/10 font-semibold text-sm flex-shrink-0">
              {(m.name || "?").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <div className="text-white font-medium truncate">{m.name}</div>
                {m.is_owner && <Crown className="w-3.5 h-3.5 text-[#C5A880]" />}
                {m.id === user.id && <span className="text-[10px] text-[#71717A] uppercase tracking-widest">({t("members.you")})</span>}
              </div>
              <div className="text-xs text-[#71717A] truncate mt-0.5">{m.email}</div>
            </div>
            <RoleBadge role={m.role} />
            {isOwner && !m.is_owner && (
              <div className="flex items-center gap-2">
                <Select value={m.role} onValueChange={(v) => changeRole(m.id, v)}>
                  <SelectTrigger data-testid={`role-select-${m.id}`} className="h-8 w-28 bg-white/[0.03] border-white/10 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Editor">Editor</SelectItem>
                    <SelectItem value="Viewer">Viewer</SelectItem>
                    <SelectItem value="Child">Child</SelectItem>
                  </SelectContent>
                </Select>
                <button
                  data-testid={`remove-member-${m.id}`}
                  onClick={() => removeMember(m.id, m.name)}
                  className="text-[#71717A] hover:text-[#F43F5E] p-1.5 rounded transition-colors"
                  title={t("members.remove")}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        ))}
      </Card>

      {/* Pending invites */}
      {isOwner && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-[#71717A]" />
            <h2 className="text-sm uppercase tracking-widest text-[#71717A]">{t("members.pending")}</h2>
            <span className="text-xs text-[#71717A]">({pendingInvites.length})</span>
          </div>
          {pendingInvites.length === 0 ? (
            <Card className="card-solid bg-transparent border-white/10 border-dashed p-8 text-center text-sm text-[#71717A]">
              {t("members.no_pending")}
            </Card>
          ) : (
            <Card className="card-solid bg-transparent border-white/10 overflow-hidden divide-y divide-white/5" data-testid="pending-invites">
              {pendingInvites.map((inv) => (
                <div key={inv.id} className="flex items-center gap-4 px-6 py-4">
                  <div className="w-10 h-10 rounded-full bg-[#C5A880]/12 border border-[#C5A880]/30 flex items-center justify-center flex-shrink-0">
                    <UserPlus className="w-4 h-4 text-[#C5A880]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-white text-sm truncate">{inv.email}</div>
                    <div className="text-xs text-[#71717A] mt-0.5">
                      {t("members.expires")}: {formatDateShort(inv.expires_at)}
                    </div>
                  </div>
                  <RoleBadge role={inv.role} />
                  <button data-testid={`copy-invite-${inv.id}`} onClick={() => copyLink(inv.token)}
                    className="text-[#A1A1AA] hover:text-white text-xs flex items-center gap-1 border border-white/10 rounded-full px-3 py-1.5 hover:bg-white/[0.04] transition-colors">
                    <Copy className="w-3.5 h-3.5" /> {t("action.copy")}
                  </button>
                  <button data-testid={`revoke-invite-${inv.id}`} onClick={() => revoke(inv.id)}
                    className="text-[#71717A] hover:text-[#F43F5E] p-1.5 rounded transition-colors"
                    title={t("members.revoke")}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </Card>
          )}
        </div>
      )}

      {!isOwner && (
        <div className="text-xs text-[#71717A] flex items-center gap-2">
          <ShieldCheck className="w-3.5 h-3.5" /> {t("members.owner_only_hint")}
        </div>
      )}

      <InviteDialog open={dialogOpen} onOpenChange={setDialogOpen} onCreated={(inv) => setInvites((xs) => [inv, ...xs])} />
    </div>
  );
}
