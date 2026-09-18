import { useEffect, useState } from "react";
import { MessageCircleQuestion, Paperclip, Send } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { Butterfly } from "@/components/Butterfly";
import { checkSubmissionFile, SUBMISSION_ACCEPT } from "@/lib/safeFile";
import { formatDate, notify } from "@/components/resources/useSubmissions";
import { formatSize } from "@/components/resources/useResources";
import {
  openQuestionFile,
  uploadQuestionFile,
  useQuestions,
  type QuestionItem,
} from "./useQuestions";

type Client = SupabaseClient<Database>;
type ClassRow = Database["public"]["Tables"]["classes"]["Row"];

export function QuestionsSpace(props: {
  client: Client;
  userId: string;
  userName: string;
  role: "student" | "teacher";
  classId?: string | null;
  classes?: ClassRow[];
}) {
  const { client, userId, userName, role } = props;
  const [selected, setSelected] = useState<string | null>(
    role === "student" ? props.classId ?? null : props.classes?.[0]?.id ?? null,
  );

  useEffect(() => {
    if (role === "teacher" && !selected && props.classes?.length) {
      setSelected(props.classes[0]!.id);
    }
  }, [role, selected, props.classes]);

  const classId = role === "student" ? props.classId ?? null : selected;
  const { items, loading, error, setError, reload } = useQuestions(client, classId);

  return (
    <section className="text-start">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">الأسئلة والأجوبة</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {role === "student"
              ? "اطرح سؤالك على أستاذ قسمك بملف مرفق، وتابع أسئلة زملائك وأجوبة الأساتذة."
              : "أسئلة تلاميذ أقسامك، مع إمكانية الرد بملف يراه كل تلاميذ القسم."}
          </p>
        </div>
        <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          {items.length} سؤال
        </span>
      </div>

      {role === "teacher" ? (
        <div className="mt-6">
          <select
            className="field-input w-auto min-w-48 text-sm"
            value={selected ?? ""}
            onChange={(e) => setSelected(e.target.value || null)}
            aria-label="اختيار القسم"
          >
            {(props.classes ?? []).length === 0 ? <option value="">لا توجد أقسام</option> : null}
            {(props.classes ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}

      {role === "student" ? (
        classId ? (
          <AskForm
            client={client}
            classId={classId}
            studentId={userId}
            studentName={userName}
            onError={setError}
            onDone={reload}
          />
        ) : (
          <p className="mt-6 rounded-2xl border border-dashed border-border bg-card/60 p-6 text-sm text-muted-foreground">
            لم يتم تعيين قسمك بعد، لذلك لا يمكنك طرح سؤال حالياً.
          </p>
        )
      ) : null}

      {loading ? (
        <p className="mt-6 text-sm text-muted-foreground">جارٍ التحميل…</p>
      ) : items.length === 0 ? (
        <div className="mt-6 flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border bg-card/60 px-6 py-12 text-center">
          <Butterfly />
          <p className="text-sm text-muted-foreground">لا توجد أسئلة في هذا القسم بعد.</p>
        </div>
      ) : (
        <ul className="mt-6 space-y-4">
          {items.map((q) => (
            <QuestionCard
              key={q.id}
              client={client}
              item={q}
              role={role}
              userId={userId}
              userName={userName}
              onError={setError}
              onChanged={reload}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function AskForm({
  client,
  classId,
  studentId,
  studentName,
  onError,
  onDone,
}: {
  client: Client;
  classId: string;
  studentId: string;
  studentName: string;
  onError: (msg: string | null) => void;
  onDone: () => Promise<void> | void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (title.trim() === "") {
      onError("اكتب عنوان السؤال.");
      return;
    }
    setBusy(true);
    onError(null);

    let meta: Record<string, unknown> = {};
    if (file) {
      const check = await checkSubmissionFile(file);
      if (!check.ok) {
        onError(check.reason);
        setBusy(false);
        return;
      }
      const up = await uploadQuestionFile(client, classId, file);
      if (!up.ok) {
        onError(up.reason);
        setBusy(false);
        return;
      }
      meta = up.meta;
    }

    const { error } = await client
      .from("questions")
      .insert({ class_id: classId, student_id: studentId, title: title.trim(), body: body.trim() || null, ...meta });

    if (error) {
      onError(`تعذّر إرسال السؤال: ${error.message}`);
      setBusy(false);
      return;
    }

    const { data: links } = await client.from("teacher_classes").select("teacher_id").eq("class_id", classId);
    for (const link of links ?? []) {
      await notify(client, {
        userId: link.teacher_id,
        actorId: studentId,
        kind: "question",
        title: `سؤال جديد من ${studentName}`,
        body: title.trim(),
      });
    }

    setTitle("");
    setBody("");
    setFile(null);
    setBusy(false);
    await onDone();
  };

  return (
    <div className="mt-6 rounded-2xl border border-border bg-card/70 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-primary">
        <MessageCircleQuestion size={18} />
        اطرح سؤالاً
      </div>
      <input
        className="field-input mt-3 w-full text-sm"
        placeholder="عنوان السؤال…"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <textarea
        className="field-input mt-3 min-h-20 w-full text-sm"
        placeholder="تفاصيل إضافية (اختياري)…"
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <input
          type="file"
          accept={SUBMISSION_ACCEPT}
          className="text-xs"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <button type="button" className="btn-primary" disabled={busy} onClick={submit}>
          {busy ? "…" : "إرسال السؤال"}
        </button>
      </div>
    </div>
  );
}

function FileChip({
  client,
  row,
  onError,
}: {
  client: Client;
  row: { file_path: string | null; file_name: string | null; file_size: number | null };
  onError: (msg: string | null) => void;
}) {
  if (!row.file_path) return null;
  const open = async (download: boolean) => {
    try {
      await openQuestionFile(client, row, download);
    } catch {
      onError("تعذّر فتح الملف.");
    }
  };
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-muted/60 px-3 py-2 text-xs">
      <Paperclip size={14} className="text-primary" />
      <span className="font-semibold text-foreground">{row.file_name}</span>
      {row.file_size ? <span className="text-muted-foreground">{formatSize(row.file_size)}</span> : null}
      <button type="button" className="btn-text" onClick={() => open(false)}>
        عرض
      </button>
      <button type="button" className="btn-text" onClick={() => open(true)}>
        تحميل
      </button>
    </div>
  );
}

function QuestionCard({
  client,
  item,
  role,
  userId,
  userName,
  onError,
  onChanged,
}: {
  client: Client;
  item: QuestionItem;
  role: "student" | "teacher";
  userId: string;
  userName: string;
  onError: (msg: string | null) => void;
  onChanged: () => Promise<void> | void;
}) {
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const answer = async () => {
    if (body.trim() === "" && !file) {
      onError("اكتب رداً أو أرفق ملفاً.");
      return;
    }
    setBusy(true);
    onError(null);

    let meta: Record<string, unknown> = {};
    if (file) {
      const check = await checkSubmissionFile(file);
      if (!check.ok) {
        onError(check.reason);
        setBusy(false);
        return;
      }
      const up = await uploadQuestionFile(client, item.class_id, file);
      if (!up.ok) {
        onError(up.reason);
        setBusy(false);
        return;
      }
      meta = up.meta;
    }

    const { error } = await client
      .from("question_answers")
      .insert({ question_id: item.id, teacher_id: userId, body: body.trim() || null, ...meta });
    if (error) {
      onError(`تعذّر إرسال الرد: ${error.message}`);
      setBusy(false);
      return;
    }

    const { data: students } = await client
      .from("profiles")
      .select("id")
      .eq("class_id", item.class_id)
      .eq("space", "talameed")
      .eq("status", "approved");
    for (const s of students ?? []) {
      await notify(client, {
        userId: s.id,
        actorId: userId,
        kind: "question_answer",
        title: `رد جديد من ${userName} على سؤال «${item.title}»`,
        body: body.trim() || undefined,
      });
    }

    setBody("");
    setFile(null);
    setBusy(false);
    await onChanged();
  };

  const removeQuestion = async () => {
    if (!window.confirm(`حذف سؤالك «${item.title}»؟`)) return;
    const { error } = await client.from("questions").delete().eq("id", item.id);
    if (error) {
      onError("تعذّر الحذف.");
      return;
    }
    if (item.file_path) await client.storage.from("questions").remove([item.file_path]);
    await onChanged();
  };

  return (
    <li className="resource-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-foreground">{item.title}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {item.student_name} • {formatDate(item.created_at)}
          </div>
        </div>
        {role === "student" && item.student_id === userId ? (
          <button type="button" className="btn-text" onClick={removeQuestion}>
            حذف
          </button>
        ) : null}
      </div>

      {item.body ? <p className="mt-2 text-sm text-foreground">{item.body}</p> : null}
      <FileChip client={client} row={item} onError={onError} />

      {item.answers.length > 0 ? (
        <div className="mt-3 space-y-3 rounded-xl bg-primary/5 p-3">
          <p className="text-xs font-semibold text-primary">أجوبة الأساتذة</p>
          {item.answers.map((a) => (
            <div key={a.id} className="rounded-lg bg-card/70 p-3">
              <div className="text-xs text-muted-foreground">
                {a.teacher_name} • {formatDate(a.created_at)}
              </div>
              {a.body ? <p className="mt-1 text-sm text-foreground">{a.body}</p> : null}
              <FileChip client={client} row={a} onError={onError} />
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">في انتظار رد الأستاذ.</p>
      )}

      {role === "teacher" ? (
        <div className="mt-3 space-y-2 rounded-xl border border-dashed border-border p-3">
          <textarea
            className="field-input min-h-16 w-full text-sm"
            placeholder="اكتب ردك…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="file"
              accept={SUBMISSION_ACCEPT}
              className="text-xs"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <button type="button" className="btn-primary inline-flex items-center gap-2" disabled={busy} onClick={answer}>
              <Send size={14} />
              {busy ? "…" : "إرسال الرد"}
            </button>
          </div>
        </div>
      ) : null}
    </li>
  );
}
