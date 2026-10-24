# HCM Lite — Interview Prep

Simple-language explanations of every technical decision, so any choice can be defended in the interview.

## Why Supabase Auth instead of our own password table?
Supabase Auth salts and hashes passwords (bcrypt) and manages sessions for us.
Storing passwords ourselves — even hashed — is a liability we don't need. Our
`profiles` table links to `auth.users` by id and adds app data (role, department,
salary). Identity lives in one place; app data in another.

## What is Row Level Security (RLS) and why enable it with NO policies?
RLS is database-level permission checking: every query arrives tagged with a role
(anon / authenticated / service_role). With RLS enabled and zero policies, the
default is DENY — someone opening the browser console with the public anon key
can read and write nothing. Our server code will use the service-role key from
Phase 2 onward, which bypasses RLS. So the public key is harmless by design, and the dangerous key
never reaches the browser.

## Why is the service-role key server-only?
It bypasses RLS — it is full database access. In Next.js, anything imported into a
client component is shipped to the browser, and any variable named `NEXT_PUBLIC_*`
is inlined into the browser bundle. Our key has no such prefix and lives only in
files used by Route Handlers (server). A past-measurable check: grep the built
`.next` folder for the key — zero matches.

## How does "one-time setup" stay one-time under race conditions?
Application-level "if setup not done" checks can both pass when two requests
arrive simultaneously (a race condition). So the real lock is in the database:
`organizations` has a `singleton` column that is unique — PostgreSQL physically
refuses a second row. The loser of the race gets a constraint error we translate
into HTTP 403.

## Why does duplicate check-in return 409 from the DATABASE?
`attendance` has `unique(employee_id, work_date)`. A second same-day insert fails
at the database no matter how many requests race. The handler catches that
specific error and returns 409 Conflict. The rule can't be bypassed by any client.

## Why copy pay figures onto payslips instead of computing on read?
A payroll run gets locked. If we computed pay at view time, editing someone's
salary later would silently change historical locked payslips. Copying figures at
generation (snapshot) makes "locked" actually mean immutable.

## Where is authorization enforced?
In every Route Handler, before touching data: verify the session server-side,
load the caller's profile, check the role, and scope every query by
`organization_id`. The frontend hides buttons for usability only — hiding is not
security because anyone can call the API directly with curl.

## One-line summaries
- **Transaction**: a group of database writes that all succeed or all fail together.
- **RLS**: per-row permission rules evaluated inside PostgreSQL.
- **Service role**: a key that skips RLS — server-only by convention.
- **Race condition**: two requests reading the same state and both acting on it,
  producing a duplicate the code checked to prevent.
