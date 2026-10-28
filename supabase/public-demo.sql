-- 공개 데모 전용: 로그인하지 않은 방문자도 조회·등록할 수 있습니다.
-- Supabase 프로젝트 SQL Editor에서 한 번 실행합니다.
begin;
create table if not exists public.dr_systems (
  system_id text primary key default ('SYS-' || gen_random_uuid()::text),
  config_id text not null,
  system_name text not null,
  dr_type text not null check (dr_type in ('A-A', 'A-S', 'STORAGE', 'NONE', 'PPP')),
  business_type text not null,
  data_spec text not null,
  rpo_target text not null,
  rto_target text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists dr_systems_config_id_unique
  on public.dr_systems (lower(trim(config_id)));
alter table public.dr_systems enable row level security;
grant usage on schema public to anon, authenticated;
grant select, insert on public.dr_systems to anon, authenticated;
drop policy if exists dr_board_demo_read on public.dr_systems;
create policy dr_board_demo_read on public.dr_systems
  for select to anon, authenticated using (true);
drop policy if exists dr_board_demo_insert on public.dr_systems;
create policy dr_board_demo_insert on public.dr_systems
  for insert to anon, authenticated with check (
    length(trim(config_id)) between 1 and 100 and
    length(trim(system_name)) between 1 and 100 and
    length(trim(business_type)) between 1 and 200 and
    length(trim(data_spec)) between 1 and 200 and
    length(trim(rpo_target)) between 1 and 100 and
    length(trim(rto_target)) between 1 and 100
  );
commit;
