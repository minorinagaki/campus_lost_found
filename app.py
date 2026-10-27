from flask import Flask, render_template, request, redirect, url_for, flash
import sqlite3
from pathlib import Path
from datetime import date

app = Flask(__name__)
app.secret_key = "change-this-secret-key"
BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "lost_found.db"

CATEGORIES = ["전자기기", "지갑·카드", "의류·가방", "문구류", "우산", "열쇠", "기타"]
LOCATIONS = ["도서관", "학생회관", "강의실", "실습실", "카페·식당", "기숙사", "기타"]


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with get_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                category TEXT NOT NULL,
                location TEXT NOT NULL,
                found_date TEXT NOT NULL,
                description TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT '보관 중',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        """)


@app.route("/")
def index():
    keyword = request.args.get("q", "").strip()
    category = request.args.get("category", "").strip()
    location = request.args.get("location", "").strip()
    status = request.args.get("status", "").strip()

    sql = "SELECT * FROM items WHERE 1=1"
    params = []

    if keyword:
        sql += " AND (title LIKE ? OR description LIKE ? OR location LIKE ?)"
        term = f"%{keyword}%"
        params.extend([term, term, term])
    if category in CATEGORIES:
        sql += " AND category = ?"
        params.append(category)
    if location in LOCATIONS:
        sql += " AND location = ?"
        params.append(location)
    if status in ["보관 중", "주인 확인 중", "반환 완료"]:
        sql += " AND status = ?"
        params.append(status)

    sql += " ORDER BY created_at DESC, id DESC"

    with get_db() as conn:
        items = conn.execute(sql, params).fetchall()

    return render_template(
        "index.html",
        items=items,
        categories=CATEGORIES,
        locations=LOCATIONS,
        q=keyword,
        selected_category=category,
        selected_location=location,
        selected_status=status
    )


@app.route("/add", methods=["GET", "POST"])
def add_item():
    if request.method == "POST":
        title = request.form.get("title", "").strip()
        category = request.form.get("category", "").strip()
        location = request.form.get("location", "").strip()
        found_date = request.form.get("found_date", "").strip()
        description = request.form.get("description", "").strip()

        if not all([title, category, location, found_date, description]):
            flash("모든 항목을 입력해 주세요.", "error")
            return render_template(
                "add.html",
                categories=CATEGORIES,
                locations=LOCATIONS,
                today=date.today().isoformat(),
                form=request.form
            )

        if category not in CATEGORIES or location not in LOCATIONS:
            flash("목록에서 올바른 종류와 장소를 선택해 주세요.", "error")
            return redirect(url_for("add_item"))

        with get_db() as conn:
            conn.execute(
                """INSERT INTO items
                   (title, category, location, found_date, description, status)
                   VALUES (?, ?, ?, ?, ?, '보관 중')""",
                (title, category, location, found_date, description)
            )

        flash("분실물 정보가 등록되었습니다.", "success")
        return redirect(url_for("index"))

    return render_template(
        "add.html",
        categories=CATEGORIES,
        locations=LOCATIONS,
        today=date.today().isoformat(),
        form={}
    )


@app.route("/item/<int:item_id>/status", methods=["POST"])
def update_status(item_id):
    new_status = request.form.get("status", "")
    allowed = ["보관 중", "주인 확인 중", "반환 완료"]

    if new_status not in allowed:
        flash("올바르지 않은 상태입니다.", "error")
        return redirect(url_for("index"))

    with get_db() as conn:
        conn.execute("UPDATE items SET status = ? WHERE id = ?", (new_status, item_id))

    flash("상태를 변경했습니다.", "success")
    return redirect(request.referrer or url_for("index"))


@app.route("/item/<int:item_id>/delete", methods=["POST"])
def delete_item(item_id):
    # 로컬 프로토타입용입니다. 공개 사이트에서는 관리자 인증을 추가하세요.
    with get_db() as conn:
        conn.execute("DELETE FROM items WHERE id = ?", (item_id,))
    flash("게시글을 삭제했습니다.", "success")
    return redirect(url_for("index"))


if __name__ == "__main__":
    init_db()
    app.run(debug=True)
