import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../lib/i18n";
import { api, formatApiError } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { toast } from "sonner";
import { Wallet, ShieldCheck, Sparkles, UserPlus, Lock, AlertCircle } from "lucide-react";

export default function AuthPage() {
  const { login, register } = useAuth();
  const { t, lang, setLang } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();

  const inviteToken = searchParams.get("invite") || "";
  const modeParam = searchParams.get("mode");

  // When there is an invite, always force register mode.
  const initialMode = inviteToken || modeParam === "register" ? "register" : "login";
  const [mode, setMode] = useState(initialMode);
  const isRegister = mode === "register";

  useEffect(() => {
    if (inviteToken) {
      if (mode !== "register") setMode("register");
      return;
    }
    if (modeParam === "register" && mode !== "register") setMode("register");
    if (!modeParam && mode !== "login") setMode("login");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const switchMode = (next) => {
    if (inviteToken) return; // locked to register when invite present
    setMode(next);
    const p = new URLSearchParams(searchParams);
    if (next === "register") p.set("mode", "register"); else p.delete("mode");
    setSearchParams(p, { replace: true });
  };

  const [form, setForm] = useState({ email: "", password: "", name: "", family_name: "" });
  const [submitting, setSubmitting] = useState(false);
  const [invitePreview, setInvitePreview] = useState(null); // { email, role, family_name, inviter_name } | null
  const [inviteError, setInviteError] = useState(null);
  const [inviteLoading, setInviteLoading] = useState(false);

  // Fetch invite preview
  useEffect(() => {
    if (!inviteToken) {
      setInvitePreview(null);
      setInviteError(null);
      return;
    }
    setInviteLoading(true);
    api.get(`/family/invites/preview?token=${encodeURIComponent(inviteToken)}`)
      .then((r) => {
        setInvitePreview(r.data);
        setForm((s) => ({ ...s, email: r.data.email || "" }));
      })
      .catch((err) => setInviteError(formatApiError(err)))
      .finally(() => setInviteLoading(false));
  }, [inviteToken]);

  const onChange = (k) => (e) => setForm((s) => ({ ...s, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (isRegister) {
        await register({
          email: (invitePreview?.email || form.email).trim(),
          password: form.password,
          name: form.name.trim(),
          family_name: inviteToken ? undefined : (form.family_name.trim() || undefined),
          invite_token: inviteToken || undefined,
        });
      } else {
        await login(form.email.trim(), form.password);
      }
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const headline = inviteToken
    ? (lang === "id" ? "Anda diundang bergabung." : "You've been invited to join.")
    : isRegister
      ? (lang === "id" ? "Bangun kekayaan, bukan sekadar catat." : "Build wealth. Not just track it.")
      : (lang === "id" ? "Ruang keuangan untuk keluarga premium." : "A private space for premium families.");

  return (
    <div className="min-h-screen auth-vignette flex" data-testid="auth-page">
      {/* Left: Marketing */}
      <div className="hidden lg:flex flex-col justify-between w-[42%] p-12 relative overflow-hidden border-r border-white/5">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg, #C5A880, #8b7454)" }}>
            <Wallet className="w-5 h-5 text-black" />
          </div>
          <span className="font-display text-2xl tracking-tight">{t("app.name")}</span>
        </div>
        <div className="relative z-10 space-y-6">
          <h1 className="font-display text-5xl leading-[1.05] tracking-tight text-white">{headline}</h1>
          <p className="text-[#A1A1AA] text-base leading-relaxed max-w-md">{t("app.tagline")}</p>
          <div className="grid grid-cols-1 gap-3 pt-4">
            <div className="flex items-center gap-3 text-sm text-[#A1A1AA]">
              <ShieldCheck className="w-4 h-4 text-[#C5A880]" /> {lang === "id" ? "Privasi per-anggota: PRIBADI atau BERSAMA" : "Per-member privacy: PRIVATE or SHARED"}
            </div>
            <div className="flex items-center gap-3 text-sm text-[#A1A1AA]">
              <Sparkles className="w-4 h-4 text-[#C5A880]" /> {lang === "id" ? "Net worth, arus kas, dan tren dalam satu tampilan" : "Net worth, cash flow, and trends in one view"}
            </div>
          </div>
        </div>
        <div className="text-xs text-[#71717A]">© {new Date().getFullYear()} Family Wealth · IDR</div>
        <div className="absolute -bottom-40 -right-40 w-[500px] h-[500px] rounded-full" style={{ background: "radial-gradient(circle, rgba(197,168,128,0.12), transparent 65%)" }} />
      </div>

      {/* Right: Form */}
      <div className="flex-1 flex items-center justify-center p-6 md:p-12">
        <div className="w-full max-w-md">
          <div className="flex items-center justify-between mb-8">
            <div className="flex lg:hidden items-center gap-2">
              <div className="w-8 h-8 rounded-lg" style={{ background: "linear-gradient(135deg, #C5A880, #8b7454)" }} />
              <span className="font-display text-xl">{t("app.name")}</span>
            </div>
            <div className="ml-auto flex gap-1 text-xs">
              <button data-testid="lang-id" onClick={() => setLang("id")}
                className={`px-2.5 py-1 rounded-full ${lang === "id" ? "bg-white/10 text-white" : "text-[#71717A]"}`}>ID</button>
              <button data-testid="lang-en" onClick={() => setLang("en")}
                className={`px-2.5 py-1 rounded-full ${lang === "en" ? "bg-white/10 text-white" : "text-[#71717A]"}`}>EN</button>
            </div>
          </div>

          {inviteToken && inviteError && (
            <div data-testid="invite-error" className="mb-6 p-4 rounded-lg border border-[#F43F5E]/40 bg-[#F43F5E]/[0.08] flex items-start gap-3">
              <AlertCircle className="w-4 h-4 text-[#F43F5E] mt-0.5" />
              <div className="text-sm">
                <div className="text-[#F43F5E] font-medium">{t("invite.invalid")}</div>
                <div className="text-[#A1A1AA] text-xs mt-1">{inviteError}</div>
              </div>
            </div>
          )}

          {invitePreview && (
            <div data-testid="invite-preview" className="mb-6 p-4 rounded-lg border border-[#C5A880]/30 bg-[#C5A880]/[0.05]">
              <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-[#C5A880] mb-2">
                <UserPlus className="w-3.5 h-3.5" /> {t("invite.joining").replace("{family}", invitePreview.family_name || "")}
              </div>
              <div className="text-sm text-white">{t("invite.invited_by").replace("{name}", invitePreview.inviter_name || "")}</div>
              <div className="text-xs text-[#A1A1AA] mt-1">{t("invite.role_will_be")}: <span className="text-[#C5A880] font-medium">{invitePreview.role}</span></div>
            </div>
          )}

          <h2 className="font-display text-3xl mb-2">
            {invitePreview
              ? (lang === "id" ? "Buat akun Anda" : "Create your account")
              : isRegister ? t("auth.create_family") : t("auth.welcome_back")}
          </h2>
          <p className="text-[#A1A1AA] text-sm mb-8">
            {invitePreview
              ? (lang === "id" ? "Selangkah lagi untuk bergabung dengan keluarga." : "One step away from joining the family.")
              : isRegister ? t("auth.subtitle_register") : t("auth.subtitle_login")}
          </p>

          <form onSubmit={submit} className="space-y-4" data-testid="auth-form">
            {isRegister && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="name" className="text-[#A1A1AA]">{t("auth.name")}</Label>
                  <Input id="name" data-testid="auth-name" value={form.name} onChange={onChange("name")} required
                    className="bg-white/[0.03] border-white/10 h-11" />
                </div>
                {!inviteToken && (
                  <div className="space-y-1.5">
                    <Label htmlFor="family_name" className="text-[#A1A1AA]">{t("auth.family_name")}</Label>
                    <Input id="family_name" data-testid="auth-family-name" placeholder={t("auth.family_name_ph")}
                      value={form.family_name} onChange={onChange("family_name")}
                      className="bg-white/[0.03] border-white/10 h-11" />
                  </div>
                )}
              </>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-[#A1A1AA] flex items-center gap-1.5">
                {t("auth.email")}
                {invitePreview && <Lock className="w-3 h-3 text-[#71717A]" title={t("invite.email_locked")} />}
              </Label>
              <Input id="email" type="email" data-testid="auth-email"
                value={invitePreview ? invitePreview.email : form.email}
                onChange={onChange("email")}
                readOnly={!!invitePreview}
                required
                className={`bg-white/[0.03] border-white/10 h-11 ${invitePreview ? "opacity-70 cursor-not-allowed" : ""}`} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-[#A1A1AA]">{t("auth.password")}</Label>
              <Input id="password" type="password" data-testid="auth-password" value={form.password} onChange={onChange("password")} required minLength={6}
                className="bg-white/[0.03] border-white/10 h-11" />
            </div>

            <Button
              type="submit"
              disabled={submitting || (inviteToken && !invitePreview) || inviteLoading}
              data-testid="auth-submit"
              className="w-full h-11 rounded-full font-semibold"
              style={{ background: "linear-gradient(180deg, #C5A880, #8b7454)", color: "#0a0a0a" }}
            >
              {submitting
                ? "…"
                : invitePreview
                  ? (lang === "id" ? "Bergabung" : "Join Family")
                  : (isRegister ? t("auth.register") : t("auth.login"))}
            </Button>
          </form>

          {!inviteToken && (
            <div className="mt-6 text-sm text-[#A1A1AA]">
              {isRegister ? t("auth.have_account") : t("auth.no_account")}{" "}
              <button
                data-testid="toggle-auth-mode"
                type="button"
                onClick={() => switchMode(isRegister ? "login" : "register")}
                className="text-[#C5A880] hover:underline font-medium cursor-pointer"
              >
                {isRegister ? t("auth.login") : t("auth.register")}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
