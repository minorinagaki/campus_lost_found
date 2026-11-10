# 프로그래머 상태 — 오른쪽 창

관리 담당: 오른쪽 Codex 창
마지막 업데이트: 2026-11-10 14:38 KST

## 역할

- 작업 전 [status.md](status.md)의 공통 규칙과 [planner.md](planner.md)의 목표·완료 기준을 확인합니다.
- 합의된 계획에 따라 앱 코드를 구현합니다.
- 계획 변경이나 막힘이 있으면 공통 작업 기록에 상황과 대응을 남깁니다.
- 완료 때 이 문서에 구현 요약, 수정 파일, 확인 방법과 결과, 남은 일을 기록합니다.

## 현재 작업

- 사용자가 요청한 캠퍼스 분실물 서비스 기능을 구현하고 Supabase 신규 프로젝트에 연결했습니다. 프론트엔드는 로컬 3000번 포트에서 실행 중입니다.

## 구현 요약

- 프론트엔드 변경: `frontend/index.html`, `frontend/style.css`, `frontend/app.js`, `frontend/supabase-config.js`.
- 데이터베이스 파일: `supabase/backend_features.sql`. 초기 테이블·Auth 정책은 `supabase/schema.sql`에 있습니다.
- 문서: 실행과 Supabase 설정을 [README.md](README.md)에 정리했습니다.
- 이메일 회원가입/로그인/로그아웃, Auth 프로필 표시, 로그인 필수 게시물 등록, Supabase Storage 사진 업로드, 게시물 상세 조회, 소유자 편집·삭제, 진행 중/반환 완료 변경, 제목·설명·종류·장소 검색과 내 게시물을 연결했습니다.
- `user_id`는 인증 세션에서 가져오고 수정·삭제 쿼리에도 현재 사용자 ID를 조건으로 넣습니다. RLS가 DB 수준에서 소유권을 재확인합니다. service_role 키는 사용하지 않았습니다.
- 원격 Supabase 프로젝트 `campus_lost_found` (ref: `mjilpewyfesgdgcmsuna`)에 세 SQL 파일을 적용했습니다. `items.status`는 `item_type`으로 보존하고 처리 상태를 `open`/`returned`로 분리했습니다. `campus-item-images` 공개 버킷은 JPEG/PNG/WEBP, 5 MiB 제한이며 업로드·수정·삭제 정책은 사용자 UUID 폴더와 파일 소유권을 검사합니다.
- 화면은 메모리 샘플 대신 Supabase 게시물을 표시합니다. 로그인/상세/내 게시물은 기존 색상과 필드 스타일을 사용한 대화상자로 열립니다.

## 확인 결과와 남은 일

- 통과: `node --check frontend/app.js frontend/supabase-config.js`, `git diff --check`, HTML 파싱 및 ID 중복 검사(45개 ID 고유).
- 통과: Supabase 공개 `items` 조회와 Auth 설정 조회 HTTP 200, 이메일 가입 허용 상태. localhost:3000에서 페이지·설정·앱 스크립트 HTTP 200.
- 제한: Orca가 접근성 권한 오류를 내 브라우저 UI 검증을 진행하지 못했습니다. Supabase MCP에도 Auth 테스트 사용자 생성·삭제 기능이 없어 별도 계정과 이메일 인증을 만들지 않았습니다. 따라서 회원가입 확인 메일, 인증 로그인, 이미지 업로드·수정·삭제의 사용자 시나리오는 끝까지 실행하지 않았습니다.
- 배포 전 실제 도메인을 Supabase Auth Redirect URLs에 추가해야 합니다. 로컬 실행 주소는 `http://localhost:3000`입니다. 공통 상태와 작업 이력은 [status.md](status.md)에 있습니다.

## 추가 요청 기능 진행 상태

- `frontend/index.html`, `frontend/app.js`, `frontend/features.css`: 이화여대 이메일 회원가입, 모바일 카메라 촬영, 업로드 전 사진 블러, GPS 역지오코딩, 확인 질문·정답 검증 후 등록자 이메일 공개, 제목·장소·설명·질문·정답의 한국어 음성 입력을 연결했습니다.
- `supabase/ewha_features.sql`: Auth DB 도메인 트리거, 확인 답변 해시, 15분당 5회 제한, 정답일 때 이메일을 반환하는 RPC를 추가했습니다.
- GPS 역지오코딩은 사용자가 버튼을 눌렀을 때만 요청합니다. 좌표는 Photon/OpenStreetMap으로 전송되지만 데이터베이스에는 저장하지 않고, 찾은 장소명만 게시물에 저장합니다. 건물명을 찾지 못하면 직접 입력할 수 있습니다.
- 이메일 가입의 `emailRedirectTo`는 HTTP 사이트 주소를 사용하고, `file://`로 열린 경우 `http://localhost:3000/`으로 돌아오게 했습니다. Supabase MCP에는 Auth URL Configuration을 변경하는 도구가 없고 Orca GUI 접근성 권한도 없어 대시보드의 Site URL/Redirect URLs는 직접 변경하지 못했습니다. 해당 설정에는 배포 주소와 `http://localhost:3000/**`를 등록해야 합니다.
- 사용자가 선택한 GPS 표시 방식은 게시 시 위치를 가져와 캠퍼스 건물 단위로 표시하는 것입니다. 사진 공개 범위와 검증 후 연락 방식에 관한 확인 답변은 아직 도착하지 않아 기본안(블러본만 저장, 정답이면 이메일 공개)으로 작성했습니다.

## 2026-11-04 추가 요청

- 회원가입 인증 메일이 사이트로 돌아오지 않는 문제에 대응해 `file://` 주소에서 가입할 때 로컬 HTTP 주소를 사용하도록 수정하고, 안내 문구를 보완했습니다.
- 음성 입력은 Web Speech API를 우선 사용하고, 미지원/서비스 오류 시 MediaRecorder와 Transformers.js의 Whisper tiny 모델로 기기 내 인식을 합니다. 대체 모드는 최초 모델 다운로드가 필요하고 녹음 파일은 앱 서버로 보내지 않습니다. 인식된 글은 사용자가 직접 검토하고 게시합니다.
- 새 로컬 서버 `http://localhost:3000/`에 접속해 HTML이 HTTP 200으로 응답하는 것을 확인했습니다. 실제 이메일 인증 클릭은 사용자 계정이 필요해 진행하지 않았습니다.
- 남은 설정: Supabase Dashboard → Authentication → URL Configuration에서 실제 배포 주소를 Site URL로 지정하고, `http://localhost:3000/**` 및 실제 배포 주소를 Redirect URLs에 추가해야 합니다.

## 최근 수정

- 2026-11-10: “습득물 등록하기” 첫 화면 버튼의 `data-open-form`이 `lost`로 잘못 연결된 것을 `found`로 수정했습니다. 저장 시에도 분실/습득 선택 버튼의 `aria-pressed` 상태에서 `item_type`을 결정하도록 보강했습니다. 이미 잘못 저장된 게시물은 소유자가 편집 폼에서 유형을 수정할 수 있습니다.
- 2026-11-10: GPS 권한 안내가 모든 실패 원인을 “권한 허용”으로 뭉뚱그리던 처리를 고쳤습니다. 브라우저 권한 상태를 확인하고 낮은 정확도 요청 후 필요한 경우 고정밀로 재시도합니다. 권한 거부·위치 정보 없음·시간 초과 및 보안 연결 문제를 구분해 안내합니다.

- 2026-11-10: 음성 입력에서 브라우저 음성 인식이 없거나 서비스를 사용할 수 없는 경우를 위해 MediaRecorder와 Transformers.js Whisper tiny 대체 경로를 추가했습니다. 모델은 첫 사용 시 내려받아 브라우저에서 실행하며 음성 파일은 앱 서버로 보내지 않습니다. `node --check frontend/app.js`, `git diff --check`가 통과했고 모델 라이브러리 CDN은 HTTP 200을 반환했습니다. 마이크/실제 모델 전사는 GUI 접근성 제약으로 브라우저에서 끝까지 확인하지 못했습니다.

- `frontend/index.html`: 사용자가 지정한 첫 화면 제목, 캠퍼스명, 검색 제목, 브랜드명을 바꿨습니다. 브라우저 탭 제목과 접근성용 브랜드 이름도 새 문구에 맞췄습니다. 두 브랜드 마크의 `ㄷ` 글자만 제거하고 원형 마크의 크기와 스타일은 유지했습니다.
- `frontend/app.js`: 공유 문구에 새 브랜드명과 첫 화면 제목을 반영했습니다.
- 확인: `node --check frontend/app.js`, `git diff --check` 통과. 이전 문구와 `ㄷ`이 프론트엔드 파일에 남지 않음을 검색했습니다. 브라우저 실행 파일이 없어 실제 화면 렌더링은 확인하지 못했습니다.
- `frontend/index.html`: 공유 안내 제목을 “잃어버린 물건이 주인을 찾을 수 있도록.”으로 바꿨습니다. 기존 줄바꿈과 강조 태그는 유지했습니다.
