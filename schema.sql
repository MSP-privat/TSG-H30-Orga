-- SCHEMA & SECURITY for TSG Tennis – FULL Supabase

-- 1) Enums
drop type if exists role_type cascade;
create type role_type as enum ('admin','coach','spieler');

drop type if exists assignment_status cascade;
create type assignment_status as enum ('Eingeplant','Ersatz','Gespielt');

-- 2) Profiles (linked to auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  role role_type not null default 'spieler',
  created_at timestamp with time zone default now()
);
alter table public.profiles enable row level security;

-- 3) Seasons
create table if not exists public.seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  year int not null,
  active boolean not null default true,
  created_at timestamptz default now()
);
alter table public.seasons enable row level security;

-- 4) Teams
create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  season_id uuid references public.seasons(id) on delete cascade,
  name text not null,
  lockable boolean not null default true,
  locked boolean not null default false,
  lock_color text,
  created_at timestamptz default now()
);
create index if not exists idx_teams_season on public.teams(season_id);
alter table public.teams enable row level security;

-- 5) Players
create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  season_id uuid references public.seasons(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  lk numeric(5,2) not null default 10.00,
  color text,
  created_at timestamptz default now()
);
create index if not exists idx_players_season on public.players(season_id);
alter table public.players enable row level security;

-- 6) Games
create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  season_id uuid references public.seasons(id) on delete cascade,
  date date not null,
  time time,
  location text,
  team_id uuid references public.teams(id) on delete set null,
  created_at timestamptz default now()
);
create index if not exists idx_games_season on public.games(season_id);
create index if not exists idx_games_date on public.games(date);
alter table public.games enable row level security;

-- 7) Assignments
create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  season_id uuid references public.seasons(id) on delete cascade,
  game_id uuid references public.games(id) on delete cascade,
  team_id uuid references public.teams(id) on delete cascade,
  player_id uuid references public.players(id) on delete cascade,
  status assignment_status not null default 'Eingeplant',
  finalized boolean not null default false,
  date date not null,
  created_at timestamptz default now()
);
create index if not exists idx_assignments_season on public.assignments(season_id);
create index if not exists idx_assignments_date on public.assignments(date);
create index if not exists idx_assignments_player_date on public.assignments(player_id,date);
alter table public.assignments enable row level security;

-- 8) Helper: view to join games with teams for calendar
create or replace view public.games_with_teams as
  select g.*, t.name as team_name from public.games g
  left join public.teams t on t.id=g.team_id;

-- 9) RLS Policies

-- profiles
create policy "select own profile or any for auth users"
  on public.profiles for select
  using ( auth.role() = 'authenticated' );

create policy "update own profile"
  on public.profiles for update
  using ( auth.uid() = id )
  with check ( auth.uid() = id );

create policy "admin coach manage profiles"
  on public.profiles for all
  using ( exists (select 1 from public.profiles p where p.id=auth.uid() and p.role in ('admin','coach')) )
  with check ( exists (select 1 from public.profiles p where p.id=auth.uid() and p.role in ('admin','coach')) );

-- seasons
create policy "seasons read" on public.seasons for select using ( auth.role()='authenticated' );
create policy "seasons write" on public.seasons for all
  using ( exists (select 1 from public.profiles p where p.id=auth.uid() and p.role in ('admin','coach')) )
  with check ( exists (select 1 from public.profiles p where p.id=auth.uid() and p.role in ('admin','coach')) );

-- teams
create policy "teams read" on public.teams for select using ( auth.role()='authenticated' );
create policy "teams write" on public.teams for all
  using ( exists (select 1 from public.profiles p where p.id=auth.uid() and p.role in ('admin','coach')) )
  with check ( exists (select 1 from public.profiles p where p.id=auth.uid() and p.role in ('admin','coach')) );

-- players
create policy "players read" on public.players for select using ( auth.role()='authenticated' );
create policy "players write" on public.players for all
  using ( exists (select 1 from public.profiles p where p.id=auth.uid() and p.role in ('admin','coach')) )
  with check ( exists (select 1 from public.profiles p where p.id=auth.uid() and p.role in ('admin','coach')) );

-- games
create policy "games read" on public.games for select using ( auth.role()='authenticated' );
create policy "games write" on public.games for all
  using ( exists (select 1 from public.profiles p where p.id=auth.uid() and p.role in ('admin','coach')) )
  with check ( exists (select 1 from public.profiles p where p.id=auth.uid() and p.role in ('admin','coach')) );

-- assignments
create policy "assignments read" on public.assignments for select using ( auth.role()='authenticated' );
create policy "assignments write" on public.assignments for all
  using ( exists (select 1 from public.profiles p where p.id=auth.uid() and p.role in ('admin','coach')) )
  with check ( exists (select 1 from public.profiles p where p.id=auth.uid() and p.role in ('admin','coach')) );

-- 10) Trigger: create profile on user signup
drop function if exists public.handle_new_user() cascade;
create or replace function public.handle_new_user() returns trigger as $$
begin
  insert into public.profiles(id,email,role) values (new.id, new.email, 'spieler');
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 11) Helper function: ensure exactly one active season
drop function if exists public.ensure_single_active_season() cascade;
create or replace function public.ensure_single_active_season() returns trigger as $$
begin
  if new.active then
    update public.seasons set active=false where id<>new.id;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists season_single_active on public.seasons;
create trigger season_single_active before insert or update on public.seasons
  for each row execute procedure public.ensure_single_active_season();

-- 12) Seed initial season (optional)
insert into public.seasons (name, year, active) values ('Saison Demo', extract(year from now())::int, true)
on conflict do nothing;
