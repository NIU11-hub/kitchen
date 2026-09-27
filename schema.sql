-- 子俊的厨房账本：Supabase 表结构
-- 不登录，任何人用网址都能读写（子俊自己决定的）。唯一保护是：网页删不了数据，每天自动备份一份。

create table if not exists public.docs (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.recipes (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.backups (
  id bigint generated always as identity primary key,
  day date not null unique,
  data jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.docs enable row level security;
alter table public.recipes enable row level security;
alter table public.backups enable row level security;

-- 网页（anon）能读、能加、能改，但不能删
create policy "docs read" on public.docs for select to anon using (true);
create policy "docs insert" on public.docs for insert to anon with check (true);
create policy "docs update" on public.docs for update to anon using (true) with check (true);
create policy "recipes read" on public.recipes for select to anon using (true);
create policy "recipes insert" on public.recipes for insert to anon with check (true);
create policy "recipes update" on public.recipes for update to anon using (true) with check (true);
-- 备份只能加、不能改也不能删
create policy "backups read" on public.backups for select to anon using (true);
create policy "backups insert" on public.backups for insert to anon with check (true);

grant select, insert, update on public.docs, public.recipes to anon;
grant select, insert on public.backups to anon;

-- 手机电脑实时同步
alter publication supabase_realtime add table public.docs;
alter publication supabase_realtime add table public.recipes;
