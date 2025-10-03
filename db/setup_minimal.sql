-- Minimal role plumbing for the PWA (idempotent)

-- Profiles table (role stored as text for simplicity)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role_type text not null default 'player',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Allow users to read their own profile (optional; RPC below is security definer)
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='self-read'
  ) then
    create policy "self-read" on public.profiles for select using (auth.uid() = id);
  end if;
end $$;

-- Upsert profile on new user signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (id, email, role_type)
  values (new.id, new.email, 'player')
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- RPC: current user's role as text
create or replace function public.get_my_role()
returns text
language sql
security definer
stable
as $$
  select coalesce((select role_type from public.profiles where id = auth.uid()), 'player');
$$;

grant execute on function public.get_my_role() to anon, authenticated;
