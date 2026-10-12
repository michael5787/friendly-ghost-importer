import { CalendarPlus, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { trimesterOf } from "@/lib/trimesters";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { CATEGORY_LABEL, useResourceList } from "@/components/resources/useResources";
import { AgendaCalendar, formatDayLabelAr } from "./AgendaCalendar";
import { LessonLog } from "./LessonLog";
import { AgendaCard, useAgendaCounts, useAttachedResources } from "./agendaShared";
import {
  AGENDA_KIND_LABEL,
  DEFAULT_EXAMS,
  TRIMESTER_LABEL,
  toDateKey,
  useAgenda,
  useFirstPendingDay,
  useUndatedAgenda,
  type AgendaKind,
  type AgendaRow,
} from "./useAgenda";

type ClassRow = Database["public"]["Tables"]["classes"]["Row"];

export function TeacherAgenda({
  client,
  teacherId,
  classes,
}: {
  client: SupabaseClient<Database>;
  teacherId: string;
  classes: ClassRow[];
}) {
  // Always start on today; jump once to the first future homework (see below).
  const [dateKey, setDateKey] = useState(() => toDateKey(new Date()));
  const [classId, setClassId] = useState<string>("");
  const autoJumpDone = useRef(false);
  const { day: pendingDay, ready: pendingReady } = useFirstPendingDay(client, {
    role: "teacher",
    teacherId,
    ...(classId === "" ? {} : { classId }),
  });

  useEffect(() => {
    if (autoJumpDone.current || !pendingReady) return;
    autoJumpDone.current = true;
    if (pendingDay) setDateKey(pendingDay);
  }, [pendingDay, pendingReady]);

  // Any manual navigation disables the automatic jump for good.
  const navigate = useCallback((key: string) => {
    autoJumpDone.current = true;
    setDateKey(key);
  }, []);
  const filter = { teacherId, ...(classId === "" ? {} : { classId }) };
  const { rows, loading, error, setError, reload } = useAgenda(client, filter, dateKey);
  // Section « غير المبرمجة » : filtres propres (classe + trimestre), indépendants du filtre du haut.
  const undated = useUndatedAgenda(client, { teacherId });
  const [undatedTri, setUndatedTri] = useState<string>(() => trimesterOf(toDateKey(new Date())));
  const [undatedClass, setUndatedClass] = useState<string>("");
  // Fenêtre « إنشاء الفروض الافتراضية ».
  const [createOpen, setCreateOpen] = useState(false);
  const [createClass, setCreateClass] = useState("");
  const [createTri, setCreateTri] = useState<"1" | "2" | "3">(() => trimesterOf(toDateKey(new Date())));
  const [createMsg, setCreateMsg] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const counts = useAgendaCounts(client, filter, dateKey, version);
  const resources = useAttachedResources(client, rows);
  const { rows: myResources } = useResourceList(client, null, [teacherId]);

  const [kind, setKind] = useState<AgendaKind>("homework");
  const [formClassId, setFormClassId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [resourceId, setResourceId] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [editing, setEditing] = useState<AgendaRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [showUndated, setShowUndated] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const reset = () => {
    setEditing(null);
    setTitle("");
    setDescription("");
    setResourceId("");
    setLinkUrl("");
    setKind("homework");
  };

  const startEdit = (row: AgendaRow) => {
    setShowForm(true);
    setEditing(row);
    setKind(row.kind);
    setFormClassId(row.class_id);
    setTitle(row.title);
    setDescription(row.description ?? "");
    setResourceId(row.resource_id ?? "");
    setLinkUrl(row.link_url ?? "");
  };

  const refresh = async () => {
    await reload();
    setVersion((v) => v + 1);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const targetClass = formClassId || classes[0]?.id || "";
    if (!targetClass) {
      setError("لا يوجد قسم مسند إليك.");
      return;
    }
    if (title.trim() === "") {
      setError("أدخل عنواناً.");
      return;
    }
    setBusy(true);
    const payload = {
      kind,
      class_id: targetClass,
      title: title.trim(),
      description: description.trim() === "" ? null : description.trim(),
      resource_id: resourceId === "" ? null : resourceId,
      link_url: linkUrl.trim() === "" ? null : linkUrl.trim(),
      event_date: dateKey,
    };

    const { error: err } = editing
      ? await client.from("agenda_events").update(payload).eq("id", editing.id)
      : await client.from("agenda_events").insert({ ...payload, teacher_id: teacherId });

    if (err) setError("تعذّر حفظ العنصر.");
    else {
      if (!editing) await notifyClass(targetClass, payload.title, payload.kind);
      reset();
      await refresh();
    }
    setBusy(false);
  };

  /** Prévient chaque élève de la classe qu'un nouvel élément d'agenda est programmé. */
  const notifyClass = async (targetClass: string, eventTitle: string, eventKind: AgendaKind) => {
    const { data: students } = await client
      .from("profiles")
      .select("id")
      .eq("class_id", targetClass)
      .eq("space", "talameed")
      .eq("status", "approved");
    if (!students || students.length === 0) return;
    const className = classes.find((c) => c.id === targetClass)?.name ?? "";
    await client.from("notifications").insert(
      students.map((s) => ({
        user_id: s.id,
        actor_id: teacherId,
        kind: "agenda",
        title: `${AGENDA_KIND_LABEL[eventKind]} جديد في المفكرة`,
        body: `«${eventTitle}» ${className ? `— ${className} ` : ""}ليوم ${formatDayLabelAr(dateKey)}`,
      })),
    );
  };


  /**
   * Crée les 3 évaluations par défaut (sans date) d'un trimestre pour une classe,
   * en sautant celles qui existent déjà (datées ou non) → aucun doublon.
   */
  const createDefaults = async () => {
    setCreateMsg(null);
    if (!createClass) {
      setCreateMsg("اختر القسم.");
      return;
    }
    setBusy(true);
    const { data: existing, error: readErr } = await client
      .from("agenda_events")
      .select("title")
      .eq("teacher_id", teacherId)
      .eq("class_id", createClass)
      .eq("kind", "evaluation")
      .eq("trimester", createTri);
    if (readErr) {
      setBusy(false);
      setCreateMsg("تعذّر التحقق من الفروض الموجودة.");
      return;
    }
    const have = new Set((existing ?? []).map((e) => e.title));
    const missing = DEFAULT_EXAMS.filter((d) => d.trimester === createTri && !have.has(d.title));
    if (missing.length === 0) {
      setBusy(false);
      setCreateMsg("الفروض والامتحان لهذا القسم وهذا الثلاثي موجودة مسبقاً.");
      return;
    }
    const { error: err } = await client.from("agenda_events").insert(
      missing.map((d) => ({
        teacher_id: teacherId,
        class_id: createClass,
        kind: "evaluation" as AgendaKind,
        title: d.title,
        trimester: d.trimester,
        event_date: null,
      })),
    );
    setBusy(false);
    if (err) {
      setCreateMsg("تعذّر إنشاء الفروض والامتحانات الافتراضية.");
      return;
    }
    await undated.reload();
    setUndatedClass(createClass);
    setUndatedTri(createTri);
    setCreateOpen(false);
  };

  /** Assigne la date actuellement sélectionnée → l'élément devient visible aux élèves. */
  const assignDate = async (row: AgendaRow) => {
    setError(null);
    const { error: err } = await client
      .from("agenda_events")
      .update({ event_date: dateKey })
      .eq("id", row.id);
    if (err) setError("تعذّر تعيين التاريخ.");
    else {
      await undated.reload();
      await refresh();
    }
  };

  const remove = async (row: AgendaRow) => {
    if (!window.confirm(`حذف «${row.title}»؟`)) return;
    const { error: err } = await client.from("agenda_events").delete().eq("id", row.id);
    if (err) setError("تعذّر الحذف.");
    else {
      await undated.reload();
      await refresh();
    }
  };

  return (
    <section className="text-start">
      <div className="rounded-2xl border border-border bg-gradient-to-l from-brand-green/10 via-card to-brand-red/10 p-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <CalendarPlus size={18} className="text-brand-green" /> المذكرة
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          برمج الواجبات والتقييمات ليوم {formatDayLabelAr(dateKey)} مع نص أو ملف مرفق.
        </p>
      </div>


      <div className="mt-4">
        <AgendaCalendar value={dateKey} onChange={navigate} counts={counts} />
      </div>

      <LessonLog client={client} teacherId={teacherId} classes={classes} dateKey={dateKey} />

      <div className="mt-4">
        <select className="field-input" value={classId} onChange={(e) => setClassId(e.target.value)}>
          <option value="">كل أقسامي</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <Collapsible
        open={showForm}
        onOpenChange={setShowForm}
        className="mt-4 rounded-2xl border border-border bg-card/95 p-4 shadow-sm"
      >
        <h3>
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              className="h-auto w-full justify-between gap-3 whitespace-normal text-start"
            >
              <span className="min-w-0 text-sm font-semibold text-foreground">
                {editing ? "تعديل عنصر" : "إضافة عنصر جديد"}
              </span>
              <ChevronDown
                size={18}
                aria-hidden="true"
                className={`shrink-0 text-muted-foreground motion-safe:transition-transform ${showForm ? "rotate-180" : ""}`}
              />
            </Button>
          </CollapsibleTrigger>
        </h3>
        <CollapsibleContent forceMount hidden={!showForm}>
          <form onSubmit={submit} className="mt-3 grid gap-3 sm:grid-cols-2">
            <select className="field-input" value={kind} onChange={(e) => setKind(e.target.value as AgendaKind)}>
              <option value="homework">{AGENDA_KIND_LABEL.homework}</option>
              <option value="evaluation">{AGENDA_KIND_LABEL.evaluation}</option>
            </select>
            <select className="field-input" value={formClassId} onChange={(e) => setFormClassId(e.target.value)}>
              <option value="">اختر القسم</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <input
              className="field-input sm:col-span-2"
              placeholder="العنوان"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <textarea
              className="field-input sm:col-span-2"
              rows={3}
              placeholder="نص الواجب أو التقييم"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <select className="field-input" value={resourceId} onChange={(e) => setResourceId(e.target.value)}>
              <option value="">بدون ملف مرفق</option>
              {myResources.map((r) => (
                <option key={r.id} value={r.id}>
                  {CATEGORY_LABEL[r.category]} — {r.title}
                </option>
              ))}
            </select>
            <input
              className="field-input"
              placeholder="رابط (اختياري)"
              dir="ltr"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
            />
            <div className="flex gap-2 sm:col-span-2">
              <button type="submit" className="btn-primary" disabled={busy}>
                {editing ? "حفظ التعديل" : "إضافة إلى المذكرة"}
              </button>
              {editing ? (
                <button type="button" className="btn-text" onClick={reset}>
                  إلغاء
                </button>
              ) : null}
            </div>
          </form>
        </CollapsibleContent>
      </Collapsible>

      {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}

      <div className="mt-6 space-y-3">
        {loading ? (
          <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد عناصر في هذا اليوم.</p>
        ) : (
          rows.map((row) => (
            <AgendaCard
              key={row.id}
              client={client}
              row={row}
              className={classes.find((c) => c.id === row.class_id)?.name}
              {...(row.resource_id && resources[row.resource_id]
                ? { resource: resources[row.resource_id] }
                : {})}
              onError={setError}
              actions={
                <span className="flex gap-2">
                  <button type="button" className="btn-text" onClick={() => startEdit(row)}>
                    تعديل
                  </button>
                  <button type="button" className="btn-text" onClick={() => void remove(row)}>
                    حذف
                  </button>
                </span>
              }
            />
          ))
        )}
      </div>
      {/* الفروض والامتحانات الافتراضية بدون تاريخ — في أسفل الصفحة وقابلة للطي */}
      <Collapsible
        open={showUndated}
        onOpenChange={setShowUndated}
        className="mt-4 rounded-2xl border border-border bg-card/95 p-4 shadow-sm"
      >
        <h3>
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              className="h-auto w-full justify-between gap-3 whitespace-normal text-start"
            >
              <span className="min-w-0 text-sm font-semibold text-foreground">
                الفروض والامتحانات غير المبرمجة
              </span>
              <ChevronDown
                size={18}
                aria-hidden="true"
                className={`shrink-0 text-muted-foreground motion-safe:transition-transform ${showUndated ? "rotate-180" : ""}`}
              />
            </Button>
          </CollapsibleTrigger>
        </h3>
        <CollapsibleContent>
          <p className="mt-1 text-xs text-muted-foreground">
            لا يراها التلاميذ. اختر اليوم المطلوب في المذكرة ثم اضغط «تعيين التاريخ» لبرمجة أي منها.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <select
              className="field-input w-auto"
              aria-label="القسم"
              value={undatedClass}
              onChange={(e) => setUndatedClass(e.target.value)}
            >
              <option value="">كل الأقسام</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              className="field-input w-auto"
              aria-label="الثلاثي"
              value={undatedTri}
              onChange={(e) => setUndatedTri(e.target.value)}
            >
              <option value="">كل الثلاثيات</option>
              {(["1", "2", "3"] as const).map((tri) => (
                <option key={tri} value={tri}>
                  {TRIMESTER_LABEL[tri]}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn-primary ms-auto text-xs"
              disabled={busy || classes.length === 0}
              onClick={() => {
                setCreateMsg(null);
                setCreateClass(undatedClass || classes[0]?.id || "");
                setCreateTri((undatedTri || trimesterOf(toDateKey(new Date()))) as "1" | "2" | "3");
                setCreateOpen(true);
              }}
            >
              إنشاء افتراضية
            </button>
          </div>
          {undated.loading ? (
            <p className="mt-3 text-sm text-muted-foreground">جارٍ التحميل…</p>
          ) : undated.rows.filter((r) => undatedClass === "" || r.class_id === undatedClass).length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">لا توجد عناصر غير مبرمجة.</p>
          ) : (
            <div className="mt-3 space-y-4">
              {(["1", "2", "3"] as const)
                .filter((tri) => undatedTri === "" || tri === undatedTri)
                .map((tri) => {
                const triRows = undated.rows.filter(
                  (r) => r.trimester === tri && (undatedClass === "" || r.class_id === undatedClass),
                );
                if (triRows.length === 0) return null;
                return (
                  <div key={tri}>
                    <h4 className="mb-2 text-xs font-semibold text-muted-foreground">{TRIMESTER_LABEL[tri]}</h4>
                    <ul className="space-y-2">
                      {triRows.map((row) => (
                        <li
                          key={row.id}
                          className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-3 py-2 text-sm"
                        >
                          <span className="font-semibold text-foreground">{row.title}</span>
                          <span className="text-xs text-muted-foreground">
                            {classes.find((c) => c.id === row.class_id)?.name ?? ""}
                          </span>
                          <span className="ms-auto flex gap-2">
                            <button type="button" className="btn-text text-xs" onClick={() => void assignDate(row)}>
                              تعيين التاريخ ({formatDayLabelAr(dateKey)})
                            </button>
                            <button type="button" className="btn-text text-xs" onClick={() => startEdit(row)}>
                              تعديل
                            </button>
                            <button type="button" className="btn-text text-xs" onClick={() => void remove(row)}>
                              حذف
                            </button>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent dir="rtl" className="text-start">
          <DialogHeader>
            <DialogTitle>إنشاء الفروض والامتحان الافتراضية</DialogTitle>
            <DialogDescription>
              تُنشأ الفروض (الفرض الأول، الفرض الثاني، الامتحان) بدون تاريخ، ولا يُعاد إنشاء ما هو موجود.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <select
              className="field-input"
              aria-label="القسم"
              value={createClass}
              onChange={(e) => setCreateClass(e.target.value)}
            >
              <option value="">اختر القسم</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              className="field-input"
              aria-label="الثلاثي"
              value={createTri}
              onChange={(e) => setCreateTri(e.target.value as "1" | "2" | "3")}
            >
              {(["1", "2", "3"] as const).map((tri) => (
                <option key={tri} value={tri}>
                  {TRIMESTER_LABEL[tri]}
                </option>
              ))}
            </select>
            {createMsg ? <p className="text-sm text-destructive">{createMsg}</p> : null}
          </div>
          <DialogFooter className="gap-2">
            <button type="button" className="btn-text" onClick={() => setCreateOpen(false)}>
              إلغاء
            </button>
            <button type="button" className="btn-primary" disabled={busy} onClick={() => void createDefaults()}>
              {busy ? "جارٍ الإنشاء…" : "إنشاء"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
