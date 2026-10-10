export type GradeReportRow = {
  name: string;
  cc?: number | null;
  first: number | null;
  second: number | null;
  exam: number | null;
  general: number | null;
};

export type GradeReport = {
  schoolName: string;
  teacherName: string;
  className: string;
  trimesterName: string;
  ccSeparate?: boolean;
  rows: GradeReportRow[];
};

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
const formatGrade = (value: number | null) => value === null ? "—" : value.toLocaleString("ar-DZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Browser-only export: browser shaping preserves Arabic and mixed-direction names. */
export async function downloadGradeReport(report: GradeReport) {
  if (!report.rows.length) throw new Error("No students to export");
  const theme = getComputedStyle(document.documentElement);
  const tokens = ["report-paper", "report-ink", "report-muted", "report-accent", "report-highlight", "report-line", "report-soft"]
    .map((token) => `--${token}:${theme.getPropertyValue(`--${token}`)};`).join("");
  const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap">
    <style>
      :root { ${tokens} }
      * { box-sizing: border-box; }
      body { margin: 0; font-family: Cairo, sans-serif; color: var(--report-ink); background: var(--report-paper); letter-spacing: 0; }
      .report-page { width: 794px; height: 1123px; padding: 42px 44px; position: relative; background: var(--report-paper); }
      header { border-top: 7px solid var(--report-accent); padding: 20px 0 18px; border-bottom: 2px solid var(--report-highlight); }
      .school { font-size: 17px; font-weight: 700; overflow-wrap: anywhere; }
      h1 { font-size: 32px; color: var(--report-accent); margin: 12px 0 16px; }
      .details { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 24px; font-size: 14px; }
      .details span { color: var(--report-muted); margin-left: 6px; }
      .details div { overflow-wrap: anywhere; }
      .caption { font-size: 12px; color: var(--report-muted); margin: 18px 0 10px; }
      table { border-collapse: collapse; width: 100%; table-layout: fixed; font-size: 13px; }
      th { background: var(--report-accent); color: var(--report-paper); font-size: 12px; font-weight: 700; padding: 13px 5px; }
      th:first-child { width: 36%; text-align: right; padding-right: 12px; }
      td { padding: 11px 8px; border-bottom: 1px solid var(--report-line); text-align: center; }
      td:first-child { text-align: right; font-weight: 600; overflow-wrap: anywhere; }
      tbody tr:nth-child(even) { background: var(--report-soft); }
      td:last-child { font-weight: 700; color: var(--report-accent); background: var(--report-soft); }
      footer { position: absolute; bottom: 40px; right: 44px; left: 44px; border-top: 1px solid var(--report-line); padding-top: 12px; display: flex; justify-content: space-between; color: var(--report-muted); font-size: 11px; }
    </style></head><body><section class="report-page">
      <header><div class="school">${escapeHtml(report.schoolName)}</div><h1>كشف النقاط</h1>
      <div class="details"><div><span>القسم:</span>${escapeHtml(report.className)}</div><div><span>الفترة:</span>${escapeHtml(report.trimesterName)}</div>
      <div><span>الأستاذ(ة):</span>${escapeHtml(report.teacherName)}</div></div></header>
      <p class="caption">عدد التلاميذ: ${report.rows.length.toLocaleString("ar-DZ")} · العلامات من ٢٠</p>
      <table><thead><tr><th>التلميذ</th>${report.ccSeparate ? "<th>المراقبة المستمرة</th>" : ""}<th>الفرض الأول</th><th>الفرض الثاني</th><th>الامتحان</th><th>المعدل العام</th></tr></thead><tbody>
      ${report.rows.map((row) => `<tr><td dir="auto">${escapeHtml(row.name)}</td>${[...(report.ccSeparate ? [row.cc ?? null] : []), row.first, row.second, row.exam, row.general].map((grade) => `<td>${formatGrade(grade)}</td>`).join("")}</tr>`).join("")}
      </tbody></table><footer><span>إمضاء الأستاذ(ة)</span><span class="page-number"></span></footer>
    </section></body></html>`;

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.className = "grade-report-frame";
  document.body.appendChild(iframe);
  try {
    const doc = iframe.contentDocument;
    if (!doc) throw new Error("PDF document unavailable");
    doc.open();
    doc.write(html);
    doc.close();
    const stylesheet = doc.querySelector<HTMLLinkElement>('link[rel="stylesheet"]');
    if (stylesheet && !stylesheet.sheet) {
      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error("PDF font loading timed out")), 15000);
        stylesheet.onload = () => { window.clearTimeout(timeout); resolve(); };
        stylesheet.onerror = () => { window.clearTimeout(timeout); reject(new Error("PDF fonts unavailable")); };
      });
    }
    await Promise.all([400, 600, 700].map((weight) => doc.fonts.load(`${weight} 14px Cairo`)));
    await doc.fonts.ready;
    const template = doc.querySelector<HTMLElement>(".report-page");
    if (!template) throw new Error("PDF page unavailable");
    const pendingRows = Array.from(template.querySelectorAll("tbody tr"));
    const blankPage = template.cloneNode(true) as HTMLElement;
    blankPage.querySelector("tbody")?.replaceChildren();
    doc.body.replaceChildren();
    let page = blankPage.cloneNode(true) as HTMLElement;
    doc.body.appendChild(page);
    for (const row of pendingRows) {
      let tbody = page.querySelector("tbody");
      const footer = page.querySelector("footer");
      if (!tbody || !footer) throw new Error("PDF table unavailable");
      tbody.appendChild(row);
      if (row.getBoundingClientRect().bottom > footer.getBoundingClientRect().top - 24) {
        row.remove();
        if (!tbody.children.length) throw new Error("PDF row too tall");
        page = blankPage.cloneNode(true) as HTMLElement;
        doc.body.appendChild(page);
        tbody = page.querySelector("tbody");
        tbody?.appendChild(row);
        const nextFooter = page.querySelector("footer");
        if (!nextFooter || row.getBoundingClientRect().bottom > nextFooter.getBoundingClientRect().top - 24) throw new Error("PDF row too tall");
      }
    }
    const pages = Array.from(doc.querySelectorAll<HTMLElement>(".report-page"));
    pages.forEach((item, index) => {
      const number = item.querySelector(".page-number");
      if (number) number.textContent = `الصفحة ${(index + 1).toLocaleString("ar-DZ")} / ${pages.length.toLocaleString("ar-DZ")}`;
    });
    const [{ toCanvas, getFontEmbedCSS }, { jsPDF }] = await Promise.all([import("html-to-image"), import("jspdf")]);
    const fontEmbedCSS = await getFontEmbedCSS(doc.body);
    const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
    for (const [index, item] of pages.entries()) {
      const canvas = await toCanvas(item, { pixelRatio: 2, fontEmbedCSS });
      if (index > 0) pdf.addPage();
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, 210, 297);
    }
    const filename = `كشف النقاط-${report.className}-${report.trimesterName}`.replace(/[\\/:*?"<>|]/g, "-");
    pdf.save(`${filename}.pdf`);
  } finally {
    iframe.remove();
  }
}
