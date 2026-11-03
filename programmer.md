# 프로그래머 상태 — 오른쪽 창

관리 담당: 오른쪽 Codex 창
마지막 업데이트: 2026-11-03 16:18 KST

## 역할

- 작업 전 [status.md](status.md)의 공통 규칙과 [planner.md](planner.md)의 목표·완료 기준을 확인합니다.
- 합의된 계획에 따라 앱 코드를 구현합니다.
- 계획 변경이나 막힘이 있으면 공통 작업 기록에 상황과 대응을 남깁니다.
- 완료 때 이 문서에 구현 요약, 수정 파일, 확인 방법과 결과, 남은 일을 기록합니다.

## 현재 작업

- CAMPUS BOARD Supabase 연동 구현 완료. 기존 페이지의 색상·폰트·여백·카드 배치는 유지하고 계정 메뉴와 대화상자만 추가했습니다.

## 구현 요약

- 프론트엔드 변경: `frontend/index.html`, `frontend/style.css`, `frontend/app.js`, `frontend/supabase-config.js`.
- 데이터베이스 파일: `supabase/backend_features.sql`. 초기 테이블·Auth 정책은 `supabase/schema.sql`에 있습니다.
- 문서: 실행과 Supabase 설정을 [README.md](README.md)에 정리했습니다.
- 이메일 회원가입/로그인/로그아웃, Auth 프로필 표시, 로그인 필수 게시물 등록, Supabase Storage 사진 업로드, 게시물 상세 조회, 소유자 편집·삭제, 진행 중/반환 완료 변경, 제목·설명·종류·장소 검색과 내 게시물을 연결했습니다.
- `user_id`는 인증 세션에서 가져오고 수정·삭제 쿼리에도 현재 사용자 ID를 조건으로 넣습니다. RLS가 DB 수준에서 소유권을 재확인합니다. service_role 키는 사용하지 않았습니다.
- 원격 Supabase 변경: 기존 `items.status`를 `item_type`으로 보존하고 처리 상태를 `open`/`returned`로 분리했습니다. `campus-item-images` 공개 버킷은 JPEG/PNG/WEBP, 5 MiB 제한이며 업로드·수정·삭제 정책은 사용자 UUID 폴더와 파일 소유권을 검사합니다.
- 화면은 메모리 샘플 대신 Supabase 게시물을 표시합니다. 로그인/상세/내 게시물은 기존 색상과 필드 스타일을 사용한 대화상자로 열립니다.

## 확인 결과와 남은 일

- 통과: `node --check frontend/app.js frontend/supabase-config.js`, `git diff --check`, HTML 파싱 및 ID 중복 검사(45개 ID 고유).
- 통과: Supabase 공개 `items` 조회와 Auth 설정 조회 HTTP 200, 이메일 가입 허용 상태. localhost:3000에서 페이지·설정·앱 스크립트 HTTP 200.
- 제한: Orca가 접근성 권한 오류를 내 브라우저 UI 검증을 진행하지 못했습니다. Supabase MCP에도 Auth 테스트 사용자 생성·삭제 기능이 없어 별도 계정과 이메일 인증을 만들지 않았습니다. 따라서 회원가입 확인 메일, 인증 로그인, 이미지 업로드·수정·삭제의 사용자 시나리오는 끝까지 실행하지 않았습니다.
- 배포 전 실제 도메인을 Supabase Auth Redirect URLs에 추가해야 합니다. 로컬 실행 주소는 `http://localhost:3000`입니다. 공통 상태와 작업 이력은 [status.md](status.md)에 있습니다.

## 최근 수정

- `frontend/index.html`: 사용자가 지정한 첫 화면 제목, 캠퍼스명, 검색 제목, 브랜드명을 바꿨습니다. 브라우저 탭 제목과 접근성용 브랜드 이름도 새 문구에 맞췄습니다. 두 브랜드 마크의 `ㄷ` 글자만 제거하고 원형 마크의 크기와 스타일은 유지했습니다.
- `frontend/app.js`: 공유 문구에 새 브랜드명과 첫 화면 제목을 반영했습니다.
- 확인: `node --check frontend/app.js`, `git diff --check` 통과. 이전 문구와 `ㄷ`이 프론트엔드 파일에 남지 않음을 검색했습니다. 브라우저 실행 파일이 없어 실제 화면 렌더링은 확인하지 못했습니다.
- `frontend/index.html`: 공유 안내 제목을 “잃어버린 물건이 주인을 찾을 수 있도록.”으로 바꿨습니다. 기존 줄바꿈과 강조 태그는 유지했습니다.
