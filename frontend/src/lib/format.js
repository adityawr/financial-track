// IDR formatter: Rp 1.500.000 (period thousand separator, no decimals)
export function formatIDR(value, opts = {}) {
  const n = Number(value || 0);
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  const withRp = opts.withSymbol !== false;
  const formatted = new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(abs);
  return `${sign}${withRp ? "Rp " : ""}${formatted}`;
}

export function formatDateShort(iso, locale = "id-ID") {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(iso, locale = "id-ID") {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleString(locale, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
