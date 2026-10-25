alter table public.notifications
  add column if not exists dedupe_key text;

create unique index if not exists notifications_dedupe_key_idx
  on public.notifications (dedupe_key);

create index if not exists notifications_user_idx
  on public.notifications (organization_id, user_id, created_at desc);

create table if not exists public.announcements (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  creator_id      uuid not null references public.profiles (id),
  title           varchar(120) not null check (char_length(trim(title)) between 3 and 120),
  message         text not null check (char_length(trim(message)) between 1 and 5000),
  audience_roles  text[] not null default array['admin', 'hr', 'employee'],
  status          text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  published_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (cardinality(audience_roles) between 1 and 3),
  check (audience_roles <@ array['admin', 'hr', 'employee']::text[]),
  check (status <> 'published' or published_at is not null)
);

create index if not exists announcements_audience_idx
  on public.announcements (organization_id, status, published_at desc);

create table if not exists public.announcement_reads (
  announcement_id uuid not null references public.announcements (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  read_at         timestamptz not null default now(),
  primary key (announcement_id, user_id)
);

create index if not exists announcement_reads_user_idx
  on public.announcement_reads (user_id, read_at desc);

alter table public.announcements enable row level security;
alter table public.announcement_reads enable row level security;
