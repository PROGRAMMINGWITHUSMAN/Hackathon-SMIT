import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sanitizeAuditDetails, validateAnnouncementInput } from "./communications-rules.mjs";

const NOTIFICATION_COLUMNS =
  "id, title, body, read_at, created_at, dedupe_key";
const ANNOUNCEMENT_COLUMNS =
  "id, title, message, audience_roles, status, published_at, created_at, updated_at, creator_id";

export async function recordAudit({
  organizationId,
  actorId,
  action,
  entity,
  entityId,
  details = {},
}) {
  const admin = createAdminClient();
  const { error } = await admin.from("audit_logs").insert({
    organization_id: organizationId,
    actor_id: actorId,
    action,
    entity,
    entity_id: entityId,
    details: sanitizeAuditDetails(action, details),
  });
  if (!error) return null;
  console.error("Required audit write failed:", action, error.message);
  return "The change succeeded, but its audit record could not be saved. Contact an administrator.";
}

export async function sendNotification({
  organizationId,
  userIds,
  title,
  body,
  dedupeKey,
}) {
  if (
    typeof title !== "string" ||
    title.trim().length < 1 ||
    title.length > 120 ||
    typeof body !== "string" ||
    body.trim().length < 1 ||
    body.length > 500
  ) {
    throw new Error("Invalid notification content.");
  }

  const uniqueIds = [...new Set(userIds)];
  if (uniqueIds.length === 0) return null;

  const admin = createAdminClient();
  const { data: recipients, error: recipientError } = await admin
    .from("profiles")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .in("id", uniqueIds);
  if (recipientError) {
    console.error("Notification recipient validation failed:", recipientError.message);
    return "The action succeeded, but notifications could not be delivered.";
  }

  const validIds = (recipients ?? []).map((row) => row.id);
  if (validIds.length === 0) return null;

  const rows = validIds.map((userId) => ({
    organization_id: organizationId,
    user_id: userId,
    title: title.trim(),
    body: body.trim(),
    dedupe_key: dedupeKey ? `${dedupeKey}:${userId}` : null,
  }));
  const { error } = await admin.from("notifications").upsert(rows, {
    onConflict: "dedupe_key",
    ignoreDuplicates: true,
  });
  if (!error) return null;
  console.error("Notification write failed:", error.message);
  return "The action succeeded, but notifications could not be delivered.";
}

export async function activeProfiles(organizationId, roles) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("id, role, status")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .in("role", roles);
  if (!error) return { profiles: data ?? [], warning: null };
  console.error("Active recipient lookup failed:", error.message);
  return { profiles: [], warning: "The action succeeded, but notifications could not be delivered." };
}

export async function listNotifications(profile, { limit = 20, offset = 0 } = {}) {
  const admin = createAdminClient();
  const [
    { data: rows, count: total, error },
    { count: unread, error: countError },
  ] = await Promise.all([
    admin
      .from("notifications")
      .select(NOTIFICATION_COLUMNS, { count: "exact" })
      .eq("organization_id", profile.organization_id)
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1),
    admin
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", profile.organization_id)
      .eq("user_id", profile.id)
      .is("read_at", null),
  ]);
  if (error) throw error;
  if (countError) throw countError;
  return {
    notifications: rows ?? [],
    unread_count: unread ?? 0,
    total: total ?? 0,
  };
}

export async function markNotificationRead(profile, notificationId) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("organization_id", profile.organization_id)
    .eq("user_id", profile.id)
    .eq("id", notificationId)
    .is("read_at", null)
    .select("id");
  if (error) throw error;
  return { updated: (data ?? []).length > 0 };
}

export async function markAllNotificationsRead(profile) {
  const admin = createAdminClient();
  const { error } = await admin
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("organization_id", profile.organization_id)
    .eq("user_id", profile.id)
    .is("read_at", null);
  if (error) throw error;
}

export async function listAnnouncements(profile, { manage = false } = {}) {
  const admin = createAdminClient();
  let query = admin
    .from("announcements")
    .select(ANNOUNCEMENT_COLUMNS)
    .eq("organization_id", profile.organization_id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (!manage) {
    query = query
      .eq("status", "published")
      .contains("audience_roles", [profile.role])
      .order("published_at", { ascending: false });
  }

  const { data: rows, error } = await query;
  if (error) throw error;
  const announcements = rows ?? [];
  if (announcements.length === 0) return [];

  const { data: reads, error: readError } = await admin
    .from("announcement_reads")
    .select("announcement_id")
    .eq("user_id", profile.id)
    .in("announcement_id", announcements.map((row) => row.id));
  if (readError) throw readError;
  const readIds = new Set((reads ?? []).map((row) => row.announcement_id));
  return announcements.map((row) => ({ ...row, is_read: readIds.has(row.id) }));
}

async function notifyAnnouncementAudience(admin, profile, announcement) {
  const { data: recipients, error } = await admin
    .from("profiles")
    .select("id")
    .eq("organization_id", profile.organization_id)
    .eq("status", "active")
    .in("role", announcement.audience_roles);
  if (error) {
    console.error("Announcement recipient lookup failed:", error.message);
    return "Announcement published, but notifications could not be delivered.";
  }
  return sendNotification({
    organizationId: profile.organization_id,
    userIds: (recipients ?? []).map((row) => row.id),
    title: "New announcement",
    body: announcement.title,
    dedupeKey: `announcement:${announcement.id}:${announcement.published_at}`,
  });
}

export async function createAnnouncement(profile, input) {
  const validated = validateAnnouncementInput(input);
  if (validated.errors) return validated;
  const values = validated.values;
  if (!values.status) values.status = "draft";
  if (values.status === "published") values.published_at = new Date().toISOString();

  const admin = createAdminClient();
  const { data: announcement, error } = await admin
    .from("announcements")
    .insert({
      ...values,
      organization_id: profile.organization_id,
      creator_id: profile.id,
    })
    .select(ANNOUNCEMENT_COLUMNS)
    .single();
  if (error) throw error;

  const warning = await recordAudit({
    organizationId: profile.organization_id,
    actorId: profile.id,
    action: "announcement.created",
    entity: "announcements",
    entityId: announcement.id,
    details: { status: announcement.status, audience_roles: announcement.audience_roles },
  });
  const notificationWarning =
    announcement.status === "published"
      ? await notifyAnnouncementAudience(admin, profile, announcement)
      : null;
  return { announcement, warnings: [warning, notificationWarning].filter(Boolean) };
}

export async function updateAnnouncement(profile, announcementId, input) {
  const admin = createAdminClient();
  const { data: existing, error: fetchError } = await admin
    .from("announcements")
    .select(ANNOUNCEMENT_COLUMNS)
    .eq("organization_id", profile.organization_id)
    .eq("id", announcementId)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (!existing) return { notFound: true };

  const allowedFields = ["title", "message", "audience_roles", "status"];
  const unknown = Object.keys(input).filter((field) => !allowedFields.includes(field));
  if (unknown.length) return { errors: { request: "Unexpected announcement field." } };

  const complete = {
    title: input.title ?? existing.title,
    message: input.message ?? existing.message,
    audience_roles: input.audience_roles ?? existing.audience_roles,
    ...(input.status === undefined ? {} : { status: input.status }),
  };
  const validated = validateAnnouncementInput(complete, { partial: true });
  if (validated.errors) return validated;
  const changes = { ...validated.values, updated_at: new Date().toISOString() };
  const publishing =
    changes.status === "published" && existing.status !== "published";
  if (publishing) changes.published_at = new Date().toISOString();

  const { data: updated, error } = await admin
    .from("announcements")
    .update(changes)
    .eq("organization_id", profile.organization_id)
    .eq("id", announcementId)
    .select(ANNOUNCEMENT_COLUMNS)
    .single();
  if (error) throw error;

  const changedFields = Object.keys(changes).filter((key) => key !== "updated_at" && key !== "published_at");
  const action =
    updated.status === "archived"
      ? "announcement.archived"
      : publishing
        ? "announcement.published"
        : "announcement.updated";
  const warning = await recordAudit({
    organizationId: profile.organization_id,
    actorId: profile.id,
    action,
    entity: "announcements",
    entityId: announcementId,
    details: {
      changed_fields: changedFields,
      audience_roles: updated.audience_roles,
    },
  });
  const notificationWarning = publishing
    ? await notifyAnnouncementAudience(admin, profile, updated)
    : null;
  return { announcement: updated, warnings: [warning, notificationWarning].filter(Boolean) };
}

export async function markAnnouncementRead(profile, announcementId) {
  const admin = createAdminClient();
  const { data: announcement, error: fetchError } = await admin
    .from("announcements")
    .select("id")
    .eq("organization_id", profile.organization_id)
    .eq("id", announcementId)
    .eq("status", "published")
    .contains("audience_roles", [profile.role])
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (!announcement) return { notFound: true };

  const { error } = await admin.from("announcement_reads").upsert(
    { announcement_id: announcementId, user_id: profile.id },
    { onConflict: "announcement_id,user_id" }
  );
  if (error) throw error;
  return { success: true };
}

export async function listAuditHistory(profile, { limit = 25, offset = 0, action, entity } = {}) {
  const admin = createAdminClient();
  let query = admin
    .from("audit_logs")
    .select("id, actor_id, action, entity, entity_id, details, created_at", { count: "exact" })
    .eq("organization_id", profile.organization_id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + limit - 1);
  if (action) query = query.eq("action", action);
  if (entity) query = query.eq("entity", entity);
  const { data: rows, count, error } = await query;
  if (error) throw error;

  const actorIds = [...new Set((rows ?? []).map((row) => row.actor_id).filter(Boolean))];
  const names = new Map();
  if (actorIds.length) {
    const { data: actors, error: actorError } = await admin
      .from("profiles")
      .select("id, full_name")
      .eq("organization_id", profile.organization_id)
      .in("id", actorIds);
    if (actorError) throw actorError;
    for (const actor of actors ?? []) names.set(actor.id, actor.full_name);
  }
  return {
    entries: (rows ?? []).map((row) => ({
      id: row.id,
      actor_name: row.actor_id ? names.get(row.actor_id) ?? "Unknown user" : "System",
      action: row.action,
      entity: row.entity,
      entity_id: row.entity_id,
      created_at: row.created_at,
      details: sanitizeAuditDetails(row.action, row.details),
    })),
    total: count ?? 0,
  };
}
