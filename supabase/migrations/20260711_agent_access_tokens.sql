create table if not exists public.agent_access_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  token_hash text not null unique check (char_length(token_hash) = 64),
  last_used_at timestamptz,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists agent_access_tokens_user_id_idx
on public.agent_access_tokens (user_id, created_at desc);

alter table public.agent_access_tokens enable row level security;

drop policy if exists "Users manage own agent access tokens" on public.agent_access_tokens;
create policy "Users manage own agent access tokens"
on public.agent_access_tokens for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

revoke all on public.agent_access_tokens from anon;
grant select, insert, update, delete on public.agent_access_tokens to authenticated;
