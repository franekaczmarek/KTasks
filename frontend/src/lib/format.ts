const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" });
const dateTimeFmt = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
});

export const fmtDate = (v: string | null | undefined) => (v ? dateFmt.format(new Date(v)) : "—");
export const fmtDateTime = (v: string | null | undefined) => (v ? dateTimeFmt.format(new Date(v)) : "—");
export const fmtDays = (v: number | null | undefined) => (v == null ? "—" : `${v.toFixed(1)} bd`);
export const issueKey = (id: number) => `KT-${id}`;

export function timeAgo(v: string) {
  const s = (Date.now() - new Date(v).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`;
  return fmtDate(v);
}

export function fmtBytes(n: number | null) {
  if (n == null) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
