
# Supabase Setup (ENUM + Policies, mit korrekten ENUM-Vergleichen)

```sql
-- RESET
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();
drop table if exists public.profiles cascade;
drop table if exists public.seasons cascade;
drop type if exists user_role cascade;

-- ENUM
create type user_role as enum ('player','coach','admin');

-- PROFILES
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  role user_role default 'player',
  created_at timestamp with time zone default now()
);

-- Trigger
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'player'::user_role)
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- RLS
alter table public.profiles enable row level security;

-- Policies (ENUM korrekt casten)
create policy "read own profile"
on public.profiles for select
using (auth.uid() = id);

create policy "coach admin read"
on public.profiles for select
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = any (array['coach','admin']::user_role[])
  )
);

create policy "admin update"
on public.profiles for update
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'::user_role
  )
);

-- SEASONS
create table if not exists public.seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_date date,
  end_date date,
  created_at timestamp with time zone default now()
);

alter table public.seasons enable row level security;

create policy "players read seasons"
on public.seasons for select
using (true);

create policy "coaches update seasons"
on public.seasons for update
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = any (array['coach','admin']::user_role[])
  )
);

create policy "admins delete seasons"
on public.seasons for delete
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'::user_role
  )
);

create policy "admins insert seasons"
on public.seasons for insert
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'::user_role
  )
);
```
