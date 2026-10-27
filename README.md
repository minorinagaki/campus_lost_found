# 교내 분실물 찾기

## 1. PyCharm에서 실행하기

1. Python 3.10 이상을 설치합니다.
2. PyCharm에서 이 폴더를 프로젝트로 엽니다.
3. PyCharm 터미널에서 가상 환경을 만듭니다.

```bash
python -m venv .venv
```

macOS에서:

```bash
source .venv/bin/activate
```

Windows에서:

```powershell
.venv\Scripts\activate
```

4. Flask를 설치합니다.

```bash
pip install -r requirements.txt
```

5. `app.py`를 실행합니다.
6. 터미널에 표시되는 주소(보통 `http://127.0.0.1:5000`)를 브라우저에서 엽니다.

## 2. 포함된 기능

- 분실물 등록 및 목록 보기
- 키워드 검색
- 종류·장소·상태별 필터
- 게시물 상태 변경 및 삭제
- SQLite 데이터베이스에 정보 저장

## 3. 안내

이 코드는 로컬 실습용 시제품입니다. 로그인, 사용자 인증, 관리자 권한, 사진 업로드, 신고 기능은 아직 구현하지 않았습니다.

공개하기 전에 인증과 접근 제어, 입력값 검증, 개인정보 보호, 백업 기능을 추가하세요. 공개 환경에서는 Flask 디버그 모드를 꺼야 합니다.

별도의 프론트엔드 데모는 [화면 열기](frontend/index.html)에서 확인할 수 있습니다. 이 데모는 브라우저 메모리에서만 동작하며, 새로고침하면 예시 게시물로 돌아갑니다.
