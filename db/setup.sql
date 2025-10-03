-- COMPLETE Supabase setup (idempotent) for PWA roles

-- 1) Table: public.profiles
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  role_type  text not null default 'player',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles add column if not exists email      text;
alter table public.profiles add column if not exists role_type  text;
alter table public.profiles add column if not exists created_at timestamptz;
alter table public.profiles add column if not exists updated_at timestamptz;
update public.profiles set role_type = 'player' where role_type is null;
alter table public.profiles alter column role_type set default 'player';
alter table public.profiles alter column role_type set not null;
update public.profiles set created_at = now() where created_at is null;
alter table public.profiles alter column created_at set default now();
update public.profiles set updated_at = now() where updated_at is null;
alter table public.profiles alter column updated_at set default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_role_type_check') then
    alter table public.profiles
      add constraint profiles_role_type_check
      check (lower(role_type) in ('player','coach','admin'));
  end if;
end$$;

create index if not exists profiles_role_type_idx on public.profiles (role_type);

-- 2) Triggers
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, role_type)
  values (new.id, new.email, 'player')
  on conflict (id) do update
    set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.touch_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute procedure public.touch_profiles_updated_at();

-- 3) RLS + Policies
alter table public.profiles enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
for select using (auth.uid() = id);

drop policy if exists profiles_read_coach_admin on public.profiles;
create policy profiles_read_coach_admin on public.profiles
for select using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and lower(p.role_type) in ('coach','admin')
  )
);

drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin on public.profiles
for update using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and lower(p.role_type) = 'admin'
  )
) with check (true);

-- 4) RPC for robust role fetch
create or replace function public.get_my_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select lower(role_type)::text
  from public.profiles
  where id = auth.uid();
$$;

grant usage on schema public to anon, authenticated;
grant execute on function public.get_my_role() to anon, authenticated;

-- Optional tests:
-- select * from public.profiles where id = auth.uid();
-- select public.get_my_role();