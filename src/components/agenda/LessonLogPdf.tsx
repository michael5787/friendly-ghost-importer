import { FileDown } from "lucide-react";
import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type ClassRow = Database["public"]["Tables"]["classes"]["Row"];
type LogRow = Database["public"]["Tables"]["lesson_logs"]["Row"];

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const short = (t: string) => t.slice(0, 5);
const fmtDay = (d: string) =>
  new Date(`${d}T12:00:00`).toLocaleDateString("ar-DZ", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

function monthBounds(dateKey: string) {
  const [y, m] = dateKey.split("-").map(Number);
  const last = new Date(y!, m!, 0).getDate();
  const mm = String(m).padStart(2, "0");
  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(last).padStart(2, "0")}` };
}

function buildHtml(rows: LogRow[], classes: ClassRow[], from: string, to: string, teacherName: string) {
  const byDay = new Map<string, LogRow[]>();
  rows.forEach((r) => byDay.set(r.log_date, [...(byDay.get(r.log_date) ?? []), r]));
  const cls = (id: string) => classes.find((c) => c.id === id)?.name ?? "—";
  const hours = rows.reduce((s, r) => {
    const m = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
    return s + (m(r.end_time) - m(r.start_time)) / 60;
  }, 0);
  const days = [...byDay.entries()]
    .map(
      ([d, list]) => `
    <section class="day">
      <h2><span class="dot"></span>${esc(fmtDay(d))}</h2>
      ${list
        .map(
          (r) => `
        <article class="entry">
          <div class="time"><b>${short(r.start_time)}</b><span>${short(r.end_time)}</span></div>
          <div class="body"><span class="tag">${esc(cls(r.class_id))}</span><p>${esc(r.content)}</p></div>
        </article>`,
        )
        .join("")}
    </section>`,
    )
    .join("");
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<title>دفتر الدروس ${from} — ${to}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Cairo:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 14mm 12mm 16mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: Cairo, sans-serif; color: #1f2a24; margin: 0; font-size: 11.5pt; }
  header { border-radius: 14px; padding: 22px 26px; color: #fff;
    background: linear-gradient(135deg, #14532d 0%, #1f7a4a 60%, #c9a227 140%); position: relative; overflow: hidden; }
  header::after { content: ""; position: absolute; left: -40px; top: -40px; width: 180px; height: 180px;
    border-radius: 50%; border: 18px solid rgba(255,255,255,.08); }
  header h1 { font-family: Amiri, serif; font-size: 28pt; margin: 0 0 4px; }
  header p { margin: 0; opacity: .9; }
  .stats { display: flex; gap: 10px; margin: 14px 0 18px; }
  .stat { flex: 1; border: 1px solid #e3e8e4; border-radius: 10px; padding: 10px 14px; background: #f7faf8; }
  .stat b { display: block; font-size: 16pt; color: #14532d; }
  .stat span { font-size: 9pt; color: #6b7a71; }
  .day { margin-bottom: 14px; break-inside: avoid-page; }
  .day h2 { font-size: 12.5pt; color: #14532d; margin: 0 0 8px; padding-bottom: 5px;
    border-bottom: 2px solid #c9a227; display: flex; align-items: center; gap: 8px; }
  .dot { width: 9px; height: 9px; border-radius: 50%; background: #c9a227; display: inline-block; }
  .entry { display: flex; gap: 12px; margin-bottom: 8px; break-inside: avoid; }
  .time { width: 68px; flex-shrink: 0; text-align: center; border-radius: 8px; background: #e8f3ec;
    color: #14532d; padding: 8px 4px; direction: ltr; }
  .time b { display: block; font-size: 12pt; } .time span { font-size: 9pt; }
  .body { flex: 1; border: 1px solid #e3e8e4; border-right: 4px solid #1f7a4a; border-radius: 8px; padding: 8px 12px; }
  .tag { font-size: 8.5pt; font-weight: 700; background: #fbf4dc; color: #8a6d12; padding: 2px 10px; border-radius: 99px; }
  .body p { margin: 6px 0 0; white-space: pre-wrap; line-height: 1.7; }
  .empty { text-align: center; color: #6b7a71; padding: 40px; }
  footer { margin-top: 24px; display: flex; justify-content: space-between; font-size: 9pt; color: #6b7a71;
    border-top: 1px solid #e3e8e4; padding-top: 8px; }
  .sign { margin-top: 30px; display: flex; justify-content: space-between; font-size: 10pt; }
  .sign div { width: 40%; border-top: 1px dashed #9aa79f; padding-top: 6px; text-align: center; }
</style></head><body>
<header><h1>دفتر الدروس</h1><p>متابعة العمل المنجز${teacherName ? ` — الأستاذ(ة): ${esc(teacherName)}` : ""}</p>
<p>الفترة: من ${esc(fmtDay(from))} إلى ${esc(fmtDay(to))}</p></header>
<div class="stats">
  <div class="stat"><b>${rows.length}</b><span>حصة مسجلة</span></div>
  <div class="stat"><b>${hours}</b><span>ساعة</span></div>
  <div class="stat"><b>${byDay.size}</b><span>يوم عمل</span></div>
  <div class="stat"><b>${new Set(rows.map((r) => r.class_id)).size}</b><span>قسم</span></div>
</div>
${days || `<p class="empty">لا توجد حصص مسجلة في هذه الفترة.</p>`}
<div class="sign"><div>إمضاء الأستاذ(ة)</div><div>إمضاء وختم المدير(ة)</div></div>
<footer><span>Madauros</span><span>أُنشئ في ${esc(new Date().toLocaleDateString("ar-DZ"))}</span></footer>
<script>document.fonts.ready.then(()=>setTimeout(()=>print(),300));</script>
</body></html>`;
}

export function LessonLogPdfButton({
  client,
  teacherId,
  classes,
  dateKey,
  teacherName = "",
}: {
  client: SupabaseClient<Database>;
  teacherId: string;
  classes: ClassRow[];
  dateKey: string;
  teacherName?: string;
}) {
  const init = monthBounds(dateKey);
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(init.from);
  const [to, setTo] = useState(init.to);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    if (from > to) return setError("تاريخ البداية بعد تاريخ النهاية.");
    setError(null);
    const win = window.open("", "_blank");
    if (!win) return setError("اسمح بالنوافذ المنبثقة لتنزيل الملف.");
    setBusy(true);
    const { data, error: err } = await client
      .from("lesson_logs")
      .select("*")
      .eq("teacher_id", teacherId)
      .gte("log_date", from)
      .lte("log_date", to)
      .order("log_date")
      .order("start_time");
    setBusy(false);
    if (err) {
      win.close();
      return setError("تعذّر تحميل الحصص.");
    }
    win.document.open();
    win.document.write(buildHtml(data ?? [], classes, from, to, teacherName));
    win.document.close();
  };

  return (
    <div className="inline-flex flex-col gap-2">
      <button type="button" className="btn-text inline-flex items-center gap-1" onClick={() => setOpen((o) => !o)}>
        <FileDown size={16} /> تنزيل PDF
      </button>
      {open ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-background/70 p-2 text-sm">
          <label className="flex items-center gap-1">من <input type="date" className="field-input" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="flex items-center gap-1">إلى <input type="date" className="field-input" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          <button type="button" className="btn-primary" disabled={busy} onClick={() => void generate()}>
            {busy ? "…" : "إنشاء"}
          </button>
          {error ? <span className="w-full text-destructive">{error}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
