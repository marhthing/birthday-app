-- Birthday App schema (run in Supabase SQL editor)

create table if not exists public.birthday_settings (
  id bigint primary key default 1,
  enabled boolean not null default true,
  interval_minutes int not null default 60,
  last_run_at timestamptz null,
  last_run_sent int not null default 0,
  last_run_failed int not null default 0,
  updated_at timestamptz not null default now()
);

insert into public.birthday_settings (id)
values (1)
on conflict (id) do nothing;

create table if not exists public.birthday_runs (
  id bigserial primary key,
  ran_at timestamptz not null default now(),
  completed_at timestamptz null,
  date text not null,
  birthday_count int not null default 0,
  sent_count int not null default 0,
  failed_count int not null default 0,
  status text not null default 'running'
);

create table if not exists public.birthday_email_logs (
  id bigserial primary key,
  run_id bigint null references public.birthday_runs (id) on delete set null,
  date text not null,
  reg_number text not null,
  student_name text not null,
  recipient_email text not null,
  status text not null check (status in ('pending', 'sent', 'failed')),
  provider_message_id text null,
  error text null,
  created_at timestamptz not null default now()
);

-- Prevent duplicates per day
create unique index if not exists uniq_birthday_email_logs_dedupe
  on public.birthday_email_logs (date, reg_number, recipient_email);

-- Student birthday source data (synced from the portal).
create table if not exists public.birthday_students (
  reg_number text primary key,
  name text not null,
  class text not null default '',
  birth_day int not null,
  birth_month int not null,
  birth_year int null,
  parent_email text null,
  parent_email_alt text null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_birthday_students_birth
  on public.birthday_students (birth_month, birth_day);

alter table public.birthday_settings enable row level security;
alter table public.birthday_runs enable row level security;
alter table public.birthday_email_logs enable row level security;
alter table public.birthday_students enable row level security;

-- Dashboard: authenticated users can read
drop policy if exists "birthday_settings_read" on public.birthday_settings;
create policy "birthday_settings_read"
  on public.birthday_settings for select
  to authenticated
  using (true);

drop policy if exists "birthday_runs_read" on public.birthday_runs;
create policy "birthday_runs_read"
  on public.birthday_runs for select
  to authenticated
  using (true);

drop policy if exists "birthday_logs_read" on public.birthday_email_logs;
create policy "birthday_logs_read"
  on public.birthday_email_logs for select
  to authenticated
  using (true);

-- Dashboard: authenticated users can update settings
drop policy if exists "birthday_settings_update" on public.birthday_settings;
create policy "birthday_settings_update"
  on public.birthday_settings for update
  to authenticated
  using (true)
  with check (true);
