-- Birthday App schema (run in Supabase SQL editor)

create table if not exists public.birthday_settings (
  id bigint primary key default 1,
  enabled boolean not null default true,
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
  status text not null check (status in ('queued', 'sent', 'failed')),
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

-- Cron helpers (Edge Function scheduler)
-- Requires extensions: pg_cron (schema cron) and pg_net (schema net).
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

create or replace function public.birthday_sender_cron_get()
returns table (
  jobname text,
  schedule text,
  active boolean
)
language sql
security definer
set search_path = public, cron
as $$
  select j.jobname, j.schedule, j.active
  from cron.job j
  where j.jobname in ('birthday-sender', 'birthday-sender-every-5-min')
  order by (j.jobname = 'birthday-sender') desc
  limit 1;
$$;

create or replace function public.birthday_sender_cron_set(
  p_schedule text,
  p_active boolean,
  p_function_url text
)
returns table (
  jobname text,
  schedule text,
  active boolean
)
language plpgsql
security definer
set search_path = public, cron, net
as $$
declare
  v_jobid bigint;
  v_command text;
begin
  if p_schedule is null or btrim(p_schedule) = '' then
    raise exception 'schedule is required';
  end if;
  if p_function_url is null or btrim(p_function_url) = '' then
    raise exception 'function_url is required';
  end if;

  v_jobid := (
    select j.jobid
    from cron.job j
    where j.jobname in ('birthday-sender', 'birthday-sender-every-5-min')
    order by (j.jobname = 'birthday-sender') desc
    limit 1
  );

  v_command := format(
    'select net.http_post(url:=%L, headers:=''{}''::jsonb, body:=''{}''::jsonb);',
    p_function_url
  );

  if v_jobid is null then
    v_jobid := cron.schedule('birthday-sender', p_schedule, v_command);
  else
    perform cron.alter_job(v_jobid, p_schedule, v_command, null, null, p_active);
  end if;

  return query
  select j.jobname, j.schedule, j.active
  from cron.job j
  where j.jobid = v_jobid;
end;
$$;
