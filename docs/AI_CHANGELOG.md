# HCM Lite — AI Change Log

Disclosure of AI-assisted changes, kept per change. Human owner reviews and approves every phase before it lands.

## 2026-10-24 — Phase 1: Foundation (IN REVIEW)

**Changed files**
| File | Action | Notes |
|---|---|---|
| `package.json`, `package-lock.json` | modified (npm) | added `@supabase/supabase-js@2.118.0` |
| `.env.local` | created | variable NAMES + placeholders only; no real credentials anywhere |
| `supabase/schema.sql` | created | 10 tables, constraints, RLS enable, leave_types seed — REVIEW FILE, not applied to Supabase |
| `docs/` (8 files) | created | documentation skeleton |
| `src/app/page.js` | rewritten | scaffold welcome page → simple HCM Lite landing (old file was unmodified create-next-app default) |
| `src/app/layout.js` | edited | title/description → HCM Lite; removed `next/font/google` imports (build-time font download caused an intermittent build failure — now offline-safe); in-file comment explains |
| `src/app/globals.css` | edited | removed `--font-sans`/`--font-mono` overrides that pointed at the removed Geist font variables; Tailwind's default system font stack now applies |

**Explicitly NOT done**
- No SQL applied to Supabase · no credentials created or assumed · no auth, setup, or feature code · no files deleted or renamed

**Checks run (actual results)**
- `npm install @supabase/supabase-js` → ok, 0 vulnerabilities (one npm warning: transitive package `unrs-resolver` postinstall blocked by npm allowScripts policy)
- `npm run lint` → see TEST_CHECKLIST for the recorded result
- `npm run build` → see TEST_CHECKLIST for the recorded result
- `git check-ignore .env.local` → confirms env file cannot be committed
