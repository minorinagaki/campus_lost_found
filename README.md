# CAMPUS BOARD

이화여대 캠퍼스 분실물·습득물 공유 웹사이트입니다. `frontend/`의 기존 화면 디자인을 유지하면서 Supabase Auth, Postgres, Storage를 사용합니다.

## CAMPUS BOARD 실행

프로젝트 루트에서 정적 서버를 실행합니다.

```bash
python3 -m http.server 3000 --directory frontend
```

브라우저에서 <http://localhost:3000>을 엽니다. 이 주소는 Supabase Auth의 기본 로컬 Site URL과 맞춰 둔 개발 주소입니다. `file://` 주소로 HTML을 직접 열면 Supabase 요청이 브라우저 보안 정책에 막힐 수 있습니다.

### Vercel 배포

저장소 루트의 `vercel.json`이 Framework를 Other로 지정하고 `frontend/`만 정적 배포 결과로 사용합니다. GitHub의 `main`에 변경 사항을 푸시하면 Vercel이 새 배포를 빌드합니다. 배포 프로젝트의 Root Directory는 저장소 루트로 두세요.

## Supabase 연결

- 설정 파일: `frontend/supabase-config.js`
- 이 파일에는 브라우저 공개용 Supabase URL과 `sb_publishable_` 키만 있습니다. 공개 키는 프론트엔드에 포함해도 되며, 접근 제어는 RLS 정책이 담당합니다.
- `service_role`/secret 키는 프론트엔드나 Git에 넣지 않습니다.
- 원격 프로젝트 `minorinagaki's Project`에는 `supabase/schema.sql`과 `supabase/backend_features.sql`을 적용했습니다.
- 이미지 버킷 `campus-item-images`는 Public, 이미지/JPEG·PNG·WEBP, 파일당 최대 5 MiB로 설정했습니다. 업로드와 수정·삭제는 로그인 사용자 본인의 폴더에 제한됩니다.
- 프로젝트의 Site URL이 기본값과 다르면 Supabase Dashboard의 **Authentication → URL Configuration**에서 `http://localhost:3000`을 허용 Redirect URL로 추가해야 합니다. 배포 시 실제 사이트 주소도 추가합니다.

## 기능

- 이메일 회원가입, 로그인, 로그아웃 및 Auth 프로필 연결
- 분실·습득 게시물의 Supabase 저장, 상세 보기 및 공유
- 로그인 사용자 사진 업로드, 본인 게시물 수정·삭제, 진행 중/반환 완료 상태 변경
- 제목·설명·종류·장소 검색과 게시물 필터
- 게시물 공개 조회, 작성자 본인 변경 권한을 RLS로 제한

## 기존 Flask 시제품

`app.py`와 `templates/`는 이전 SQLite 연습용 시제품으로 남아 있습니다. 현재 CAMPUS BOARD의 Supabase 기능을 사용하려면 위의 정적 서버로 `frontend/`를 실행하세요. `python app.py`는 이전 SQLite 화면을 실행하며 Supabase 프론트엔드와 연결되어 있지 않습니다.

기존 Flask 시제품을 WSGI 서버로 실행하는 경우에도 SQLite 테이블이 준비되도록 앱 모듈을 불러올 때 스키마를 초기화합니다. 배포할 때는 `FLASK_SECRET_KEY` 환경 변수를 설정하세요. 정적 CAMPUS BOARD를 배포하려면 `frontend/` 폴더를 정적 사이트로 게시해야 하며, Flask 앱으로 실행하면 현재 Supabase 화면이 나오지 않습니다.
