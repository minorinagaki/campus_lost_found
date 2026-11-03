-- CAMPUS BOARD 프론트엔드 연동을 위한 게시물 상태와 이미지 접근 정책입니다.
-- 초기 supabase/schema.sql을 적용한 프로젝트에서 한 번 실행합니다.

begin;

-- 분실/습득 유형과 처리 상태를 별도 필드로 관리합니다.
alter table public.items
  rename column status to item_type;

alter table public.items
  rename constraint items_status_check to items_item_type_check;

alter table public.items
  add column status text not null default 'open'
    check (status in ('open', 'returned'));

create index items_status_date_idx
  on public.items (status, item_date desc);

-- Storage 버킷은 Public URL로 게시물 이미지를 읽을 수 있지만,
-- 업로드와 삭제는 로그인한 사용자의 폴더로 제한합니다.
drop policy if exists "CAMPUS BOARD 이미지 본인 폴더 업로드" on storage.objects;
create policy "CAMPUS BOARD 이미지 본인 폴더 업로드"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'campus-item-images'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "CAMPUS BOARD 이미지 본인 파일 수정" on storage.objects;
create policy "CAMPUS BOARD 이미지 본인 파일 수정"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'campus-item-images'
    and owner_id = (select auth.uid()::text)
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  )
  with check (
    bucket_id = 'campus-item-images'
    and owner_id = (select auth.uid()::text)
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "CAMPUS BOARD 이미지 본인 파일 삭제" on storage.objects;
create policy "CAMPUS BOARD 이미지 본인 파일 삭제"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'campus-item-images'
    and owner_id = (select auth.uid()::text)
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

commit;
