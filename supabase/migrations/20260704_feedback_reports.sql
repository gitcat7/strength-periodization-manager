create table if not exists public.feedback_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  email text,
  category text not null default 'general' check (category in ('general', 'bug', 'training_plan', 'data', 'login')),
  message text not null check (char_length(message) between 5 and 2000),
  page_path text,
  user_agent text,
  status text not null default 'open' check (status in ('open', 'reviewing', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.feedback_reports enable row level security;

drop policy if exists "Users create feedback reports" on public.feedback_reports;
create policy "Users create feedback reports"
on public.feedback_reports for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users read own feedback reports" on public.feedback_reports;
create policy "Users read own feedback reports"
on public.feedback_reports for select
to authenticated
using (auth.uid() = user_id);
