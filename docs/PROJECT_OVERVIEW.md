# HCM Lite — Project Overview

A lightweight HR Management System built for the Saylani Hackathon (12-hour build).

## Stack
- **Next.js 16 (App Router)** + JavaScript — pages in `src/app/`, APIs in `src/app/api/**/route.js`
- **Tailwind CSS v4** for styling
- **Supabase** — PostgreSQL database, Supabase Auth for login, Row Level Security as a data backstop
- Plain `fetch` on the client; no extra state/data libraries unless a feature truly needs one

## Modules (from the challenge brief)
1. Authentication + RBAC (Admin / HR / Employee)
2. Organization setup (one-time, first run)
3. Employee management
4. Attendance
5. Leave management
6. Payroll / payslips
7. Dashboard / analytics
8. AI assistant (Phase 9; provider deferred)
9. Notifications + audit logs

## Running locally
```bash
npm install
npm run dev        # http://localhost:3000
```
Requires a `.env.local` file (see `.env.local` template in the repo root; values
come from your Supabase Dashboard → Project Settings → API).

## Current status
- **Phase 2 (authentication & roles): in review.** Login page, server-side session/role checking, middleware route gating, and sign-out are built and lint/build-verified. **Login is untested** — blocked on the one-time admin bootstrap (`supabase/bootstrap-admin.sql`, manual Supabase Dashboard step).
- Phase plan and live status: see [FEATURE_OWNERSHIP.md](./FEATURE_OWNERSHIP.md)
- Business rules: see [BUSINESS_RULES.md](./BUSINESS_RULES.md)
