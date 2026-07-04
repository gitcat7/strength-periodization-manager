create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  event_name text not null,
  properties jsonb not null default '{}'::jsonb,
  page_path text,
  created_at timestamptz not null default now()
);

alter table public.analytics_events enable row level security;

drop policy if exists "Users create own analytics events" on public.analytics_events;
create policy "Users create own analytics events"
on public.analytics_events for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users read own analytics events" on public.analytics_events;
create policy "Users read own analytics events"
on public.analytics_events for select
to authenticated
using (auth.uid() = user_id);
