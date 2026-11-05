create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  daily_goal_cents integer not null default 50000 check (daily_goal_cents >= 0)
);

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  cents integer not null check (cents <> 0),
  sold_at timestamptz not null default now()
);

create index sales_user_id_sold_at_idx on public.sales (user_id, sold_at);

alter table public.profiles enable row level security;
alter table public.sales enable row level security;

revoke all on table public.profiles from anon;
revoke all on table public.sales from anon;
grant select, insert, update on table public.profiles to authenticated;
grant select, insert, update, delete on table public.sales to authenticated;

create policy profiles_select_own
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = id);

create policy profiles_insert_own
  on public.profiles
  for insert
  to authenticated
  with check ((select auth.uid()) = id);

create policy profiles_update_own
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy sales_select_own
  on public.sales
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy sales_insert_own
  on public.sales
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy sales_update_own
  on public.sales
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy sales_delete_own
  on public.sales
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id)
  values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function private.handle_new_user();
