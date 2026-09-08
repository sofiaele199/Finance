-- Run this once in Supabase: SQL Editor -> New query -> paste -> Run.

create table if not exists public.ledger (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  payload    jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.ledger enable row level security;

-- Each policy compares the row's user_id to the id of whoever is signed in,
-- so one account can never read or write another account's row.
drop policy if exists "own row read"   on public.ledger;
drop policy if exists "own row insert" on public.ledger;
drop policy if exists "own row update" on public.ledger;

create policy "own row read"   on public.ledger for select using (auth.uid() = user_id);
create policy "own row insert" on public.ledger for insert with check (auth.uid() = user_id);
create policy "own row update" on public.ledger for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
