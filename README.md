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
- 원격 프로젝트 `campus_lost_found` (`https://mjilpewyfesgdgcmsuna.supabase.co`, 도쿄 리전)에 `supabase/schema.sql`, `supabase/backend_features.sql`, `supabase/ewha_features.sql`을 적용했습니다.
- 이미지 버킷 `campus-item-images`는 Public, 이미지/JPEG·PNG·WEBP, 파일당 최대 5 MiB로 설정했습니다. 업로드와 수정·삭제는 로그인 사용자 본인의 폴더에 제한됩니다.
- Supabase Auth의 **Authentication → URL Configuration**에서 Site URL을 실제 배포 주소로 설정하고, Redirect URLs에 `http://localhost:3000/**`와 배포 사이트 주소를 추가하세요. 로컬에서 `file://`로 열면 인증 메일의 링크가 파일 경로로 돌아갈 수 있으므로 `http://localhost:3000/`으로 접속합니다. 인증 메일을 클릭할 때까지 로컬 서버를 켜 두세요.

## 기능

- 이메일 회원가입, 로그인, 로그아웃 및 Auth 프로필 연결
- 분실·습득 게시물의 Supabase 저장, 상세 보기 및 공유
- 로그인 사용자 사진 업로드, 본인 게시물 수정·삭제, 진행 중/반환 완료 상태 변경
- 제목·설명·종류·장소 검색과 게시물 필터
- 게시물 공개 조회, 작성자 본인 변경 권한을 RLS로 제한
- 제목, 장소, 설명, 확인 질문과 정답의 한국어 음성 입력 (브라우저 인식 또는 Whisper 대체 모델)

## 기존 Flask 시제품

`app.py`와 `templates/`는 이전 SQLite 연습용 시제품으로 남아 있습니다. 현재 CAMPUS BOARD의 Supabase 기능을 사용하려면 위의 정적 서버로 `frontend/`를 실행하세요. `python app.py`는 이전 SQLite 화면을 실행하며 Supabase 프론트엔드와 연결되어 있지 않습니다.

기존 Flask 시제품을 WSGI 서버로 실행하는 경우에도 SQLite 테이블이 준비되도록 앱 모듈을 불러올 때 스키마를 초기화합니다. 배포할 때는 `FLASK_SECRET_KEY` 환경 변수를 설정하세요. 정적 CAMPUS BOARD를 배포하려면 `frontend/` 폴더를 정적 사이트로 게시해야 하며, Flask 앱으로 실행하면 현재 Supabase 화면이 나오지 않습니다.

## 이메일 제한·사진 블러·위치·물건 확인 기능

- `supabase/ewha_features.sql`은 `schema.sql`, `backend_features.sql` 다음에 적용하는 추가 마이그레이션이며 현재 원격 프로젝트에도 적용되어 있습니다. 신규 가입을 `ewha.ac.kr`, `ewhain.net`으로 제한하고, 확인 답변은 bcrypt 해시로 저장합니다. 답변 확인은 계정당 게시물별 15분에 5회로 제한하며 정답인 경우에만 게시자 이메일을 보여줍니다.
- 모바일 사진 입력은 카메라를 열 수 있습니다. 분실·습득 구분 없이 모든 사진을 브라우저에서 블러와 흑백 처리한 뒤에만 업로드합니다. 원본은 저장하지 않습니다.
- GPS 위치는 사용자가 누를 때 가져옵니다. 조회가 늦거나 정확도 부족으로 실패하면 설정을 바꿔 한 번 더 시도하고, 브라우저 권한·기기 위치 서비스·시간 초과를 구분해 안내합니다. Photon/OpenStreetMap 역지오코딩에 좌표를 보내 건물명을 찾고, 게시물에는 장소명만 저장합니다. 정확한 좌표는 데이터베이스에 저장하지 않습니다. 장소는 직접 입력할 수도 있습니다.
- 음성 입력은 브라우저 음성 인식을 우선 사용합니다. 해당 API가 없으면 Transformers.js와 Whisper tiny 모델을 브라우저에서 실행해 한국어를 인식합니다. 대체 모드는 처음 쓸 때 모델을 내려받으며, 녹음 음성은 서버로 전송하지 않습니다. 인식된 문장은 지정한 입력란에 들어가며, 게시물은 사용자가 직접 등록 버튼을 눌러야 저장됩니다.
