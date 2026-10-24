import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// Employee data layer — SERVER ONLY.
//
// Every function here is called by server code (Route Handlers and Server
// Components) AFTER the caller has been verified with getCurrentUser().
// All queries are scoped by organization_id, and the privileged admin client
// stays inside server files like this one.
//
// Why emails need special handling: `profiles` has no email column. The
// email lives in Supabase Auth's own auth.users table, so we merge it in
// with the admin auth API when listing/fetching.
// ---------------------------------------------------------------------------

const PROFILE_COLUMNS =
  "id, full_name, role, department, designation, basic_salary, joined_at, status, created_at, updated_at";

// Pages of auth users to walk when building the id -> email map.
// NOTE: admin methods live under auth.admin.* in supabase-js v2.
// Errors are thrown (never swallowed) so a real Supabase failure surfaces
// as the directory error state instead of a silently empty list.
async function getEmailMap(admin) {
  const map = {};
  let page = 1;
  while (page <= 10) {
    // safety cap: 10 x 1000 users is far beyond this deployment's scale
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) throw error;
    const users = data?.users ?? [];
    users.forEach((u) => {
      map[u.id] = u.email;
    });
    // Verified against the live API: `totalPages` is not present in this
    // SDK's response, so we detect the end the standard way — a page with
    // fewer users than requested is the last one.
    if (users.length < 1000) break;
    page += 1;
  }
  return map;
}

export async function listEmployeeProfiles(organizationId) {
  const admin = createAdminClient();
  const { data: profiles, error } = await admin
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("organization_id", organizationId)
    .order("full_name", { ascending: true });
  if (error) throw error;

  const emailMap = await getEmailMap(admin);
  return profiles.map((p) => ({ ...p, email: emailMap[p.id] ?? null }));
}

export async function getEmployeeProfile(organizationId, employeeId) {
  const admin = createAdminClient();
  const { data: profile, error } = await admin
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("organization_id", organizationId)
    .eq("id", employeeId)
    .maybeSingle();
  if (error) throw error;
  if (!profile) return null;

  // Email lives in Supabase Auth. If the Auth user is missing or was
  // deleted while the profile row remains, show the profile without an
  // email instead of failing the whole request.
  const { data: userData, error: userError } =
    await admin.auth.admin.getUserById(employeeId);
  if (userError) {
    console.error(
      "getEmployeeProfile: could not load Auth user for profile:",
      userError.message
    );
    return { ...profile, email: null };
  }
  return { ...profile, email: userData?.user?.email ?? null };
}

// How many OTHER active admins exist in the organization? Used to protect
// the last active admin from being demoted or deactivated.
export async function countOtherActiveAdmins(organizationId, excludeId) {
  const admin = createAdminClient();
  const { count, error } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("role", "admin")
    .eq("status", "active")
    .neq("id", excludeId);
  if (error) throw error;
  return count ?? 0;
}

// ---------------------------------------------------------------------------
// CREATE — direct account creation + compensation
//
// 1) admin.auth.admin.createUser creates the Supabase Auth account directly
//    with the Admin/HR-chosen password (Supabase hashes it — we never store
//    or log it). email_confirm is set explicitly because this hackathon
//    setup has no working email verification; only verified Admin/HR callers
//    can reach this code, so it is NOT public signup.
// 2) If the profile insert then fails, we delete ONLY the auth user we just
//    created (compensation), so a failed request leaves no orphan account.
// ---------------------------------------------------------------------------
export async function createEmployee({ organizationId, input }) {
  const admin = createAdminClient();

  const { data: created, error: createError } =
    await admin.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
    });
  if (createError) {
    // Supabase rejects an already-registered email.
    const alreadyRegistered =
      createError.status === 422 || /already/i.test(createError.message);
    if (alreadyRegistered) return { conflict: true };

    // If the project enforces a stronger password policy than our own
    // validation, surface Supabase's reason as a field error.
    if (
      createError.status === 400 &&
      (createError.code === "weak_password" || /password/i.test(createError.message))
    ) {
      return { weakPassword: true, message: createError.message };
    }

    // Free-tier throttling (rare for direct creation — no email is sent).
    const rateLimited =
      createError.status === 429 ||
      createError.code === "over_email_send_rate_limit";
    if (rateLimited) return { rateLimited: true };

    throw createError;
  }

  const newUserId = created?.user?.id;
  if (!newUserId) throw new Error("Account creation did not return a user id");

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .insert({
      id: newUserId,
      organization_id: organizationId,
      full_name: input.full_name,
      role: input.role,
      department: input.department ?? null,
      designation: input.designation ?? null,
      joined_at: input.joined_at ?? null,
      basic_salary: input.basic_salary ?? null,
      status: "active",
    })
    .select(PROFILE_COLUMNS)
    .single();

  if (profileError) {
    // Compensation: remove only the auth user this request just created.
    await admin.auth.admin.deleteUser(newUserId);
    throw profileError;
  }

  return { profile: { ...profile, email: input.email } };
}

// ---------------------------------------------------------------------------
// UPDATE — applies an already-validated, already-authorized changes object.
// The Route Handler decides WHAT may change; this just persists it safely,
// scoped to the organization, and returns the updated row.
// ---------------------------------------------------------------------------
export async function updateEmployeeProfile({
  organizationId,
  employeeId,
  changes,
}) {
  const admin = createAdminClient();
  const { data: updated, error } = await admin
    .from("profiles")
    .update({ ...changes, updated_at: new Date().toISOString() })
    .eq("organization_id", organizationId)
    .eq("id", employeeId)
    .select(PROFILE_COLUMNS)
    .single();
  if (error) throw error;
  return updated;
}

// ---------------------------------------------------------------------------
// VALIDATION — plain JavaScript checks, shared by the create and update
// handlers. Returns { values } on success or { errors } with a message per
// field. Mirrors the database's own constraints (schema.sql `profiles`).
// ---------------------------------------------------------------------------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLES = ["admin", "hr", "employee"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isUuid(value) {
  return UUID_RE.test(value);
}

export function validateEmployeeInput(body, { partial = false } = {}) {
  const errors = {};
  const values = {};

  // --- full name (required, 2-100 chars after trimming) ---
  if ("full_name" in body) {
    const name = String(body.full_name ?? "").trim();
    if (name.length < 2 || name.length > 100) {
      errors.full_name = "Full name must be 2–100 characters.";
    } else {
      values.full_name = name;
    }
  } else if (!partial) {
    errors.full_name = "Full name is required.";
  }

  // --- email (required on create, format-checked, lowercased) ---
  if ("email" in body) {
    const email = String(body.email ?? "").trim().toLowerCase();
    if (!EMAIL_RE.test(email) || email.length > 200) {
      errors.email = "Enter a valid email address.";
    } else {
      values.email = email;
    }
  } else if (!partial) {
    errors.email = "Email is required.";
  }

  // --- password (required on CREATE only; min 8 chars). Never included in
  //     EDIT_FIELDS, so it can never be changed through the employee API —
  //     only Supabase's hashed copy exists; we never log or echo it. ---
  if ("password" in body) {
    const password = String(body.password ?? "");
    if (password.length < 8) {
      errors.password = "Password must be at least 8 characters.";
    } else {
      values.password = password;
    }
  } else if (!partial) {
    errors.password = "Password is required.";
  }

  // --- role (required on create; must be a known role) ---
  if ("role" in body) {
    if (!ROLES.includes(body.role)) {
      errors.role = "Role must be admin, hr, or employee.";
    } else {
      values.role = body.role;
    }
  } else if (!partial) {
    values.role = "employee"; // sensible default when omitted
  }

  // --- department / designation (optional, max 100 chars) ---
  for (const field of ["department", "designation"]) {
    if (field in body) {
      const text = String(body[field] ?? "").trim();
      if (text.length > 100) {
        errors[field] = "Must be 100 characters or fewer.";
      } else {
        values[field] = text === "" ? null : text;
      }
    }
  }

  // --- joining date (optional, YYYY-MM-DD) ---
  if ("joined_at" in body && body.joined_at !== null && body.joined_at !== "") {
    const date = String(body.joined_at);
    if (!DATE_RE.test(date) || Number.isNaN(Date.parse(date))) {
      errors.joined_at = "Use a valid date (YYYY-MM-DD).";
    } else {
      values.joined_at = date;
    }
  } else if ("joined_at" in body) {
    values.joined_at = null;
  }

  // --- basic salary (optional, non-negative number, max 12 digits scale 2) ---
  if ("basic_salary" in body && body.basic_salary !== null && body.basic_salary !== "") {
    const salary = Number(body.basic_salary);
    if (!Number.isFinite(salary) || salary < 0 || salary > 9999999999.99) {
      errors.basic_salary = "Salary must be a number between 0 and 9,999,999,999.";
    } else {
      values.basic_salary = Math.round(salary * 100) / 100;
    }
  } else if ("basic_salary" in body) {
    values.basic_salary = null;
  }

  // --- status (optional; only used on update) ---
  if ("status" in body) {
    if (!["active", "inactive"].includes(body.status)) {
      errors.status = "Status must be active or inactive.";
    } else {
      values.status = body.status;
    }
  }

  if (Object.keys(errors).length > 0) return { errors };
  return { values };
}
