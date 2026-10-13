import { ChevronDown, Download, FileText, Trash2, Upload } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useChapters, useLevels } from "@/components/resources/useResources";

type CourseFile = {
  id: string;
  teacher_id: string;
  level_id: string;
  chapter_id: string | null;
  title: string;
  file_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
};

const BUCKET = "course-files";
const ACCEPT =
  ".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function formatSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} ك.ب`;
  return `${(bytes / 1024 / 1024).toFixed(1)} م.ب`;
}

function fileKind(name: string) {
  return /\.pdf$/i.test(name) ? "PDF" : "Word";
}

export function CourseFilesPanel({
  client,
  teacherId,
}: {
  client: SupabaseClient<Database>;
  teacherId: string;
}) {
  // La table n'existe pas encore dans les types générés : client non typé localement.
  const db = client as unknown as SupabaseClient;
  const levels = useLevels(client);
  const [open, setOpen] = useState(false);

  // Filtres d'affichage
  const [levelFilter, setLevelFilter] = useState("");
  const [chapterFilter, setChapterFilter] = useState("");
  const filterChapters = useChapters(client, levelFilter || undefined);

  // Formulaire d'envoi
  const [upLevel, setUpLevel] = useState("");
  const [upChapter, setUpChapter] = useState("");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const upChapters = useChapters(client, upLevel || null);

  const [rows, setRows] = useState<CourseFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allChapters = useChapters(client);
  const chapterName = useMemo(() => new Map(allChapters.map((c) => [c.id, c.name])), [allChapters]);
  const levelName = useMemo(() => new Map(levels.map((l) => [l.id, l.name])), [levels]);

  const load = useCallback(async () => {
    setLoading(true);
    let q = db.from("course_files").select("*").order("created_at", { ascending: false });
    if (levelFilter) q = q.eq("level_id", levelFilter);
    if (chapterFilter) q = q.eq("chapter_id", chapterFilter);
    const { data, error: err } = await q;
    if (err) setError("تعذّر تحميل الدروس.");
    else {
      setError(null);
      setRows((data ?? []) as CourseFile[]);
    }
    setLoading(false);
  }, [db, levelFilter, chapterFilter]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const upload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!upLevel || !file) return;
    if (!/\.(pdf|docx?)$/i.test(file.name)) {
      setError("يُقبل فقط ملف PDF أو Word.");
      return;
    }
    setBusy(true);
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "pdf";
    const path = `${teacherId}/${upLevel}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await client.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type || "application/octet-stream" });
    if (upErr) {
      setError("تعذّر رفع الملف.");
      setBusy(false);
      return;
    }
    const { error: insErr } = await db.from("course_files").insert({
      teacher_id: teacherId,
      level_id: upLevel,
      chapter_id: upChapter || null,
      title: title.trim() || file.name.replace(/\.[^.]+$/, ""),
      file_path: path,
      file_name: file.name,
      mime_type: file.type || null,
      size_bytes: file.size,
    });
    if (insErr) {
      await client.storage.from(BUCKET).remove([path]);
      setError("تعذّر حفظ الدرس.");
    } else {
      setError(null);
      setTitle("");
      setFile(null);
      (e.target as HTMLFormElement).reset();
      await load();
    }
    setBusy(false);
  };

  const download = async (row: CourseFile) => {
    const { data, error: err } = await client.storage
      .from(BUCKET)
      .createSignedUrl(row.file_path, 300, { download: row.file_name });
    if (err || !data) return setError("تعذّر تنزيل الملف.");
    window.open(data.signedUrl, "_blank", "noopener");
  };

  const remove = async (row: CourseFile) => {
    if (!window.confirm(`حذف الدرس «${row.title}»؟`)) return;
    await client.storage.from(BUCKET).remove([row.file_path]);
    const { error: err } = await db.from("course_files").delete().eq("id", row.id);
    if (err) setError("تعذّر حذف الدرس.");
    else await load();
  };

  const selectCls =
    "h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground";

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mt-8 rounded-xl border border-border bg-card">
      <CollapsibleTrigger asChild>
        <Button variant="ghost" className="flex h-auto w-full items-center justify-between gap-3 px-4 py-4">
          <span className="flex items-center gap-2 text-base font-semibold text-foreground">
            <FileText className="h-5 w-5 text-primary" />
            الدروس الكاملة حسب المحور والمستوى
          </span>
          <ChevronDown className={`h-5 w-5 transition-transform ${open ? "rotate-180" : ""}`} />
        </Button>
      </CollapsibleTrigger>

      <CollapsibleContent className="space-y-6 border-t border-border p-4">
        {error && <p className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</p>}

        {/* Filtres */}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">المستوى</span>
            <select
              className={selectCls}
              value={levelFilter}
              onChange={(e) => {
                setLevelFilter(e.target.value);
                setChapterFilter("");
              }}
            >
              <option value="">كل المستويات</option>
              {levels.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">البرنامج (المحور)</span>
            <select
              className={selectCls}
              value={chapterFilter}
              onChange={(e) => setChapterFilter(e.target.value)}
              disabled={!levelFilter}
            >
              <option value="">كل المحاور</option>
              {filterChapters.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
        </div>

        {/* Liste */}
        {loading ? (
          <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>
        ) : rows.length === 0 ? (
          <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            لا توجد دروس لهذا الاختيار.
          </p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {rows.map((row) => (
              <li key={row.id} className="flex items-start gap-3 rounded-lg border border-border bg-background p-3">
                <span className="rounded-md bg-primary/10 px-2 py-1 text-xs font-bold text-primary">
                  {fileKind(row.file_name)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-foreground">{row.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {levelName.get(row.level_id) ?? "—"}
                    {row.chapter_id ? ` · ${chapterName.get(row.chapter_id) ?? ""}` : ""}
                    {row.size_bytes ? ` · ${formatSize(row.size_bytes)}` : ""}
                  </p>
                </div>
                <Button size="icon" variant="outline" onClick={() => void download(row)} aria-label="تنزيل">
                  <Download className="h-4 w-4" />
                </Button>
                {row.teacher_id === teacherId && (
                  <Button size="icon" variant="ghost" onClick={() => void remove(row)} aria-label="حذف">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        {/* Envoi */}
        <form onSubmit={upload} className="space-y-3 rounded-lg bg-muted/50 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Upload className="h-4 w-4" /> رفع درس كامل (PDF أو Word)
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <select
              className={selectCls}
              value={upLevel}
              required
              onChange={(e) => {
                setUpLevel(e.target.value);
                setUpChapter("");
              }}
            >
              <option value="">اختر المستوى</option>
              {levels.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
            <select
              className={selectCls}
              value={upChapter}
              onChange={(e) => setUpChapter(e.target.value)}
              disabled={!upLevel}
            >
              <option value="">اختر المحور</option>
              {upChapters.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <input
              className={selectCls}
              placeholder="عنوان الدرس (اختياري)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <input
              type="file"
              accept={ACCEPT}
              required
              className="text-sm text-foreground file:me-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-primary-foreground"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <Button type="submit" disabled={busy || !upLevel || !file}>
            {busy ? "جارٍ الرفع…" : "رفع الملف"}
          </Button>
        </form>
      </CollapsibleContent>
    </Collapsible>
  );
}
