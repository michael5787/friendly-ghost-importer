import { useEffect, useMemo, useState } from "react";
import { Search, UserPlus, UsersRound, X } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { createPlaceholderStudent, isPlaceholderEmail } from "@/lib/teacher-students.functions";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { STATUS_LABEL } from "@/lib/spaces";
import { AddGradeButton, BehaviorGradeButton } from "@/components/grades/Grades";
import { HomeworkStatusButton } from "@/components/grades/Homework";
import { AddAbsenceButton } from "@/components/absences/Absences";

type ClassRow = Database["public"]["Tables"]["classes"]["Row"];

type StudentRow = {
  id: string;
  full_name: string | null;
  email: string;
  status: string;
  class_id: string | null;
};

export function ClassStudents({
  client,
  classes,
  isAdmin,
  teacherId,
}: {
  teacherId: string;
  client: SupabaseClient<Database>;
  classes: ClassRow[];
  isAdmin: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [showAdd, setShowAdd] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [addClassId, setAddClassId] = useState("");
  const [adding, setAdding] = useState(false);
  const [addMsg, setAddMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const createStudentFn = useServerFn(createPlaceholderStudent);

  const addStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    const cid = addClassId || selected || "";
    if (!cid || !firstName.trim() || !lastName.trim()) return;
    setAdding(true);
    setAddMsg(null);
    try {
      const res = await createStudentFn({
        data: { firstName: firstName.trim(), lastName: lastName.trim(), classId: cid },
      });
      setAddMsg({ ok: true, text: `تمت إضافة «${res.fullName}». الحساب في انتظار تحديث الإدارة.` });
      setFirstName("");
      setLastName("");
      setReloadKey((k) => k + 1);
    } catch {
      setAddMsg({ ok: false, text: "تعذّر إضافة التلميذ. تحقّق من أنك مُسنَد إلى هذا القسم." });
    }
    setAdding(false);
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    (async () => {
      const classIds = classes.map((c) => c.id);
      if (!isAdmin && classIds.length === 0) {
        if (active) {
          setStudents([]);
          setLoading(false);
        }
        return;
      }
      let query = client
        .from("profiles")
        .select("id, full_name, email, status, class_id")
        .eq("space", "talameed");
      if (!isAdmin) query = query.in("class_id", classIds);
      if (selected) query = query.eq("class_id", selected);   
      const { data, error: err } = await query.order("full_name", {
        ascending: true,
        nullsFirst: false,
      });
      if (!active) return;
      if (err) setError("تعذّر تحميل قائمة التلاميذ.");
      else setStudents(data ?? []);
      if (active) setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [client, isAdmin, selected, reloadKey]);

  const className = (id: string | null) => classes.find((c) => c.id === id)?.name ?? null;

  // Recherche par nom ou e-mail (insensible à la casse et aux espaces superflus).
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return students;
    return students.filter(
      (s) => (s.full_name ?? "").toLowerCase().includes(q) || s.email.toLowerCase().includes(q),
    );
  }, [students, search]);

  const groups = useMemo(() => {
    if (!selected) {
      const byClass = new Map<string, StudentRow[]>();
      for (const s of filtered) {
        const key = s.class_id ?? "";
        if (!byClass.has(key)) byClass.set(key, []);
        byClass.get(key)!.push(s);
      }
      return [...byClass.entries()]
        .map(([cid, rows]) => ({ label: className(cid) || "غير معيّن إلى قسم", rows }))
        .sort((a, b) => a.label.localeCompare(b.label, "ar"));
    }
    return [{ label: className(selected) ?? "", rows: filtered }];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, selected, classes]);

  return (
    <section className="text-start">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <UsersRound size={18} /> قائمة التلاميذ
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {isAdmin ? "جميع تلاميذ المنصة موزعين على الأقسام." : "تلاميذ أقسامك المسندة إليك."}
          </p>
        </div>
        <div className="flex items-center gap-2">
        <button
          type="button"
          className="btn-primary inline-flex items-center gap-2 text-sm"
          onClick={() => {
            setShowAdd((v) => !v);
            setAddMsg(null);
            if (!addClassId) setAddClassId(selected ?? classes[0]?.id ?? "");
          }}
          aria-expanded={showAdd}
        >
          <UserPlus size={16} /> إضافة تلميذ
        </button>
        <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          {search.trim() ? `${filtered.length} / ${students.length}` : students.length} تلميذ
        </span>
        </div>
      </div>

      {showAdd ? (
        <form
          onSubmit={addStudent}
          className="mt-4 space-y-3 rounded-2xl border border-border bg-card p-4"
        >
          <p className="text-sm font-semibold text-foreground">إضافة تلميذ بدون حساب</p>
          <p className="text-xs text-muted-foreground">
            يُنشأ حساب غير مُفعّل ببريد مؤقت. يمكنك تسجيل نقطه وغياباته فورًا، وعلى الإدارة تحديث
            معلوماته وتفعيله إذا أردنا منحه الدخول إلى فضاء التلاميذ.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <input
              className="field-input text-sm"
              placeholder="اللقب (النسب)"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
              maxLength={60}
            />
            <input
              className="field-input text-sm"
              placeholder="الاسم"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              maxLength={60}
            />
            <select
              className="field-input text-sm"
              value={addClassId}
              onChange={(e) => setAddClassId(e.target.value)}
              required
              aria-label="قسم التلميذ"
            >
              <option value="">اختر القسم</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          {addMsg ? (
            <p className={`text-sm ${addMsg.ok ? "text-success" : "text-destructive"}`}>{addMsg.text}</p>
          ) : null}
          <div className="flex gap-2">
            <button type="submit" className="btn-primary text-sm" disabled={adding || !addClassId}>
              {adding ? "جارٍ الإضافة…" : "إضافة"}
            </button>
            <button type="button" className="rounded-md border border-border px-4 py-2 text-sm text-foreground hover:bg-muted" onClick={() => setShowAdd(false)}>
              إغلاق
            </button>
          </div>
        </form>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <Search
            size={16}
            className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            className="field-input w-full ps-9 pe-9 text-sm"
            placeholder="ابحث بالاسم أو البريد الإلكتروني…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="البحث عن تلميذ"
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute end-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-muted"
              aria-label="مسح البحث"
            >
              <X size={14} />
            </button>
          ) : null}
        </div>
        <select
          className="field-input w-auto min-w-48 text-sm"
          value={selected ?? ""}
          onChange={(e) => setSelected(e.target.value || null)}
          aria-label="اختيار القسم"
        >
          <option value="">كل الأقسام</option>
          {!isAdmin && classes.length === 0 ? <option value="">لا توجد أقسام</option> : null}
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}

      {loading ? (
        <p className="mt-6 text-sm text-muted-foreground">جارٍ التحميل…</p>
      ) : students.length > 0 && filtered.length === 0 ? (
        <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card/60 px-6 py-12 text-center">
          <Search size={32} className="text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">لا يوجد تلميذ يطابق «{search.trim()}».</p>
        </div>
      ) : students.length === 0 ? (
        <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card/60 px-6 py-12 text-center">
          <UsersRound size={32} className="text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">لا يوجد تلاميذ في هذا القسم بعد.</p>
        </div>
      ) : (
        <div className="mt-6 space-y-8">
          {groups.map((g) => (
            <div key={g.label}>
              {g.label ? (
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    قسم
                  </span>
                  {g.label}
                </h3>
              ) : null}
              <ul className="space-y-3">
                {g.rows.map((s) => (
                  <li key={s.id} className="resource-card flex flex-wrap items-center gap-4 p-4">
                    <span
                      className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary"
                      aria-hidden="true"
                    >
                      {(s.full_name?.trim()?.[0] ?? "ط").trim()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-foreground">
                        {s.full_name?.trim() || "بدون اسم"}
                      </div>
                      {isPlaceholderEmail(s.email) ? (
                        <div className="mt-0.5 text-xs text-muted-foreground">بدون حساب تلميذ (أُضيف من طرف الأستاذ)</div>
                      ) : (
                        <div className="mt-0.5 truncate text-xs text-muted-foreground" dir="ltr">
                          {s.email}
                        </div>
                      )}
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        s.status === "approved" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {STATUS_LABEL[s.status] ?? s.status}
                    </span>
                    <AddGradeButton client={client} teacherId={teacherId} studentId={s.id} classId={s.class_id} />
                    <BehaviorGradeButton client={client} teacherId={teacherId} studentId={s.id} classId={s.class_id} />
                    <HomeworkStatusButton client={client} teacherId={teacherId} studentId={s.id} classId={s.class_id} />
                    <AddAbsenceButton client={client} teacherId={teacherId} studentId={s.id} classId={s.class_id} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
