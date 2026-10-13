import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Domaine des e-mails fictifs attribués aux élèves créés par un enseignant. */
export const PLACEHOLDER_EMAIL_DOMAIN = "eleves.local";

export function isPlaceholderEmail(email: string | null | undefined) {
  return !!email && email.toLowerCase().endsWith(`@${PLACEHOLDER_EMAIL_DOMAIN}`);
}

function randomToken(bytes: number) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Un enseignant crée un élève sans compte réel (nom + prénom) dans l'une de ses classes.
 * Le compte reste « en attente » avec un e-mail fictif et un mot de passe aléatoire
 * inconnu : personne ne peut s'y connecter tant que l'admin ne l'a pas mis à jour et validé.
 */
export const createPlaceholderStudent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        firstName: z.string().trim().min(1).max(60),
        lastName: z.string().trim().min(1).max(60),
        classId: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // 1. Vérifier que l'appelant est un enseignant validé (ou super admin).
    const { data: me } = await context.supabase
      .from("profiles")
      .select("space, status")
      .eq("id", context.userId)
      .maybeSingle();
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "super_admin",
    });
    const isTeacher = me?.space === "taleem" && me?.status === "approved";
    if (!isTeacher && isAdmin !== true)
      throw new Error("حسابك ليس حساب أستاذ مُفعّل.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 2. L'enseignant doit être affecté à la classe visée.
    if (isAdmin !== true) {
      const { data: link } = await supabaseAdmin
        .from("teacher_classes")
        .select("id")
        .eq("teacher_id", context.userId)
        .eq("class_id", data.classId)
        .maybeSingle();
      if (!link) throw new Error("أنت غير مُسنَد إلى هذا القسم.");
    }
    const { data: cls } = await supabaseAdmin
      .from("classes")
      .select("id, level_id")
      .eq("id", data.classId)
      .maybeSingle();
    if (!cls) throw new Error("القسم غير موجود.");

    // 3. Créer le compte avec e-mail fictif (aucun e-mail n'est envoyé).
    const email = `eleve-${randomToken(6)}@${PLACEHOLDER_EMAIL_DOMAIN}`;
    const fullName = `${data.lastName} ${data.firstName}`.trim();
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: randomToken(24),
      email_confirm: false,
      user_metadata: { space: "talameed", full_name: fullName, created_by_teacher: context.userId },
    });
    if (error || !created.user) throw new Error(error?.message ?? "تعذّر إنشاء الحساب.");

    // 4. Compléter le profil créé par le déclencheur (statut « en attente »).
    const { error: pErr } = await supabaseAdmin
      .from("profiles")
      .update({ full_name: fullName, class_id: cls.id, level_id: cls.level_id, status: "pending" })
      .eq("id", created.user.id);
    if (pErr) {
      await supabaseAdmin.auth.admin.deleteUser(created.user.id);
      throw new Error(pErr.message);
    }
    return { id: created.user.id, email, fullName };
  });
