-- 교내 분실물 공유 사이트의 초기 Supabase 스키마입니다.
-- 프로젝트의 public.profiles와 public.items가 없는지 확인한 뒤 한 번 실행하세요.

begin;

create table public.profiles (
  id uuid primary key
    references auth.users (id) on delete cascade,
  display_name text not null default '새 사용자'
    check (char_length(btrim(display_name)) between 1 and 80),
  created_at timestamptz not null default now()
);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null
    references auth.users (id) on delete cascade,
  title text not null
    check (char_length(btrim(title)) between 1 and 120),
  description text,
  category text not null
    check (char_length(btrim(category)) between 1 and 80),
  location text not null
    check (char_length(btrim(location)) between 1 and 120),
  item_date date not null,
  image_url text
    check (image_url is null or image_url ~* '^https?://[^[:space:]]+$'),
  status text not null
    check (status in ('lost', 'found')),
  created_at timestamptz not null default now()
);

-- 목록 정렬, 분실/습득·날짜 필터, 분류·장소 필터, 작성자별 조회를 지원합니다.
create index items_feed_created_at_idx
  on public.items (created_at desc);

create index items_status_item_date_idx
  on public.items (status, item_date desc);

create index items_category_idx
  on public.items (category);

create index items_location_idx
  on public.items (location);

create index items_user_created_at_idx
  on public.items (user_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.items enable row level security;

-- 기본 권한을 회수하고 각 역할에 필요한 권한만 부여합니다.
revoke all privileges on table public.profiles, public.items
  from public, anon, authenticated;

grant select, update on table public.profiles to authenticated;

grant select on table public.items to anon, authenticated;
grant insert, update, delete on table public.items to authenticated;

-- 프로필은 본인만 읽고 수정할 수 있습니다.
create policy "프로필 본인 조회"
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "프로필 본인 수정"
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- 분실물 게시물은 로그인하지 않은 방문자도 읽을 수 있습니다.
create policy "게시물 공개 조회"
  on public.items
  for select
  to anon, authenticated
  using (true);

-- 로그인한 사용자는 자신의 Auth ID로 게시물을 작성할 수 있습니다.
create policy "인증 사용자 본인 게시물 작성"
  on public.items
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "작성자 본인 게시물 수정"
  on public.items
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "작성자 본인 게시물 삭제"
  on public.items
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- Auth 가입 시 사용자 메타데이터에서 표시 이름을 가져와 프로필을 만듭니다.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
      '새 사용자'
    )
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_user()
  from public, anon, authenticated;

drop trigger if exists on_auth_user_created_profile on auth.users;

create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 이미 가입한 Auth 사용자도 프로필을 갖도록 채웁니다.
insert into public.profiles (id, display_name)
select
  u.id,
  coalesce(
    nullif(btrim(u.raw_user_meta_data ->> 'display_name'), ''),
    '새 사용자'
  )
from auth.users as u
on conflict (id) do nothing;

commit;
