-- CAMPUS BOARD: Ewha email signup, private location coordinates, and
-- item verification before revealing the poster's email.
-- Apply after schema.sql and backend_features.sql.

begin;

create extension if not exists pgcrypto with schema extensions;

-- Reject non-Ewha email addresses at the Auth database boundary, including
-- direct Auth API calls that bypass frontend validation.
create or replace function public.enforce_ewha_email_domain()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is null
     or lower(split_part(new.email, '@', 2)) not in ('ewha.ac.kr', 'ewhain.net') then
    raise exception using
      errcode = '23514',
      message = 'Use an @ewha.ac.kr or @ewhain.net email address.';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_ewha_email_domain() from public, anon, authenticated;
drop trigger if exists enforce_ewha_email_domain on auth.users;
create trigger enforce_ewha_email_domain
  before insert or update of email on auth.users
  for each row execute function public.enforce_ewha_email_domain();

create or replace function public.is_ewha_user()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (auth.jwt() ->> 'email') ~* '^[^@]+@(ewha\.ac\.kr|ewhain\.net)$',
    false
  );
$$;

revoke all on function public.is_ewha_user() from public, anon;
grant execute on function public.is_ewha_user() to authenticated;

-- Apply the domain allowlist to database writes as well as the signup form.
drop policy if exists "인증 사용자 본인 게시물 작성" on public.items;
create policy "인증 사용자 본인 게시물 작성"
  on public.items for insert to authenticated
  with check ((select auth.uid()) = user_id and (select public.is_ewha_user()));

drop policy if exists "작성자 본인 게시물 수정" on public.items;
create policy "작성자 본인 게시물 수정"
  on public.items for update to authenticated
  using ((select auth.uid()) = user_id and (select public.is_ewha_user()))
  with check ((select auth.uid()) = user_id and (select public.is_ewha_user()));

drop policy if exists "작성자 본인 게시물 삭제" on public.items;
create policy "작성자 본인 게시물 삭제"
  on public.items for delete to authenticated
  using ((select auth.uid()) = user_id and (select public.is_ewha_user()));

drop policy if exists "CAMPUS BOARD 이미지 본인 폴더 업로드" on storage.objects;
create policy "CAMPUS BOARD 이미지 본인 폴더 업로드"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'campus-item-images'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
    and (select public.is_ewha_user())
  );

drop policy if exists "CAMPUS BOARD 이미지 본인 파일 수정" on storage.objects;
create policy "CAMPUS BOARD 이미지 본인 파일 수정"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'campus-item-images'
    and owner_id = (select auth.uid()::text)
    and (storage.foldername(name))[1] = (select auth.uid()::text)
    and (select public.is_ewha_user())
  )
  with check (
    bucket_id = 'campus-item-images'
    and owner_id = (select auth.uid()::text)
    and (storage.foldername(name))[1] = (select auth.uid()::text)
    and (select public.is_ewha_user())
  );

drop policy if exists "CAMPUS BOARD 이미지 본인 파일 삭제" on storage.objects;
create policy "CAMPUS BOARD 이미지 본인 파일 삭제"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'campus-item-images'
    and owner_id = (select auth.uid()::text)
    and (storage.foldername(name))[1] = (select auth.uid()::text)
    and (select public.is_ewha_user())
  );

alter table public.items
  add column if not exists verification_question text,
  add column if not exists verification_answer_hash text;

alter table public.items
  drop constraint if exists items_verification_question_length_check,
  add constraint items_verification_question_length_check
    check (verification_question is null or char_length(btrim(verification_question)) between 5 and 160);

create or replace function public.prepare_item_verification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.verification_question is null
     or char_length(btrim(new.verification_question)) not between 5 and 160 then
    raise exception using errcode = '23514', message = 'Add a verification question of 5–160 characters.';
  end if;

  if tg_op = 'INSERT' then
    if new.verification_answer_hash is null
       or char_length(btrim(new.verification_answer_hash)) not between 2 and 120 then
      raise exception using errcode = '23514', message = 'Add a verification answer of 2–120 characters.';
    end if;
    new.verification_answer_hash := extensions.crypt(
      lower(btrim(new.verification_answer_hash)), extensions.gen_salt('bf')
    );
  elsif new.verification_question is distinct from old.verification_question
        and new.verification_answer_hash is not distinct from old.verification_answer_hash then
    raise exception using errcode = '23514', message = 'Changing the question also requires a new answer.';
  elsif new.verification_answer_hash is distinct from old.verification_answer_hash then
    if new.verification_answer_hash is null
       or char_length(btrim(new.verification_answer_hash)) not between 2 and 120 then
      raise exception using errcode = '23514', message = 'Add a verification answer of 2–120 characters.';
    end if;
    new.verification_answer_hash := extensions.crypt(
      lower(btrim(new.verification_answer_hash)), extensions.gen_salt('bf')
    );
  end if;
  return new;
end;
$$;

revoke all on function public.prepare_item_verification() from public, anon, authenticated;
drop trigger if exists prepare_item_verification on public.items;
create trigger prepare_item_verification
  before insert or update of verification_question, verification_answer_hash on public.items
  for each row execute function public.prepare_item_verification();

-- The browser uses GPS only for reverse geocoding. Exact coordinates are not
-- stored; only the building/place name is saved in public.items.location.
revoke select on public.items from anon, authenticated;
grant select (
  id, user_id, item_type, status, title, description, category, location,
  item_date, image_url, created_at, verification_question
) on public.items to anon, authenticated;

create table if not exists public.item_verification_attempts (
  item_id uuid not null references public.items(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  window_started_at timestamptz not null default now(),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  primary key (item_id, user_id)
);

alter table public.item_verification_attempts enable row level security;
revoke all on public.item_verification_attempts from public, anon, authenticated;

create or replace function public.verify_item_answer(p_item_id uuid, p_answer text)
returns table (is_match boolean, contact_email text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_owner_id uuid;
  v_answer_hash text;
  v_status text;
  v_started_at timestamptz;
  v_attempt_count integer;
  v_email text;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Sign in to verify this item.';
  end if;

  if not public.is_ewha_user() then
    return query select false, null::text;
    return;
  end if;

  select i.user_id, i.verification_answer_hash, i.status
    into v_owner_id, v_answer_hash, v_status
    from public.items as i
    where i.id = p_item_id;

  if not found or v_status <> 'open' or v_user_id = v_owner_id or v_answer_hash is null then
    return query select false, null::text;
    return;
  end if;

  insert into public.item_verification_attempts (item_id, user_id)
    values (p_item_id, v_user_id)
    on conflict (item_id, user_id) do nothing;

  select a.window_started_at, a.attempt_count
    into v_started_at, v_attempt_count
    from public.item_verification_attempts as a
    where a.item_id = p_item_id and a.user_id = v_user_id
    for update;

  if v_started_at < now() - interval '15 minutes' then
    update public.item_verification_attempts
      set window_started_at = now(), attempt_count = 0
      where item_id = p_item_id and user_id = v_user_id;
    v_attempt_count := 0;
  elsif v_attempt_count >= 5 then
    return query select false, null::text;
    return;
  end if;

  if p_answer is not null
     and extensions.crypt(lower(btrim(p_answer)), v_answer_hash) = v_answer_hash then
    update public.item_verification_attempts
      set attempt_count = 0
      where item_id = p_item_id and user_id = v_user_id;
    select u.email into v_email from auth.users as u where u.id = v_owner_id;
    return query select true, v_email;
    return;
  end if;

  update public.item_verification_attempts
    set attempt_count = attempt_count + 1
    where item_id = p_item_id and user_id = v_user_id;
  return query select false, null::text;
end;
$$;

revoke all on function public.verify_item_answer(uuid, text) from public, anon;
grant execute on function public.verify_item_answer(uuid, text) to authenticated;

commit;
