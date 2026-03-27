"""
MTC WiFi Registration System
Backend: Flask + PostgreSQL
"""

from flask import Flask, request, jsonify, render_template, send_file
from flask_cors import CORS
import psycopg2
import psycopg2.extras
import os
import csv
import io
from datetime import datetime
from functools import wraps

app = Flask(__name__)
CORS(app)

# ── Database config – edit these or set as environment variables ──────────────
DB_CONFIG = {
    "host":     os.environ.get("DB_HOST",     "localhost"),
    "port":     os.environ.get("DB_PORT",     "5432"),
    "database": os.environ.get("DB_NAME",     "mtc_wifi"),
    "user":     os.environ.get("DB_USER",     "postgres"),
    "password": os.environ.get("DB_PASSWORD", "2002"),
}

# ── Admin credentials (change these!) ─────────────────────────────────────────
ADMIN_USERNAME = os.environ.get("ADMIN_USER", "admin")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASS", "mtcadmin2026")

# ─────────────────────────────────────────────────────────────────────────────

def get_db():
    return psycopg2.connect(**DB_CONFIG)


def init_db():
    """Create tables if they don't exist."""
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS wifi_registrations (
            id               SERIAL PRIMARY KEY,
            name             VARCHAR(100) NOT NULL,
            surname          VARCHAR(100) NOT NULL,
            student_number   VARCHAR(50)  NOT NULL,
            national_id      VARCHAR(50)  NOT NULL,
            balance_image    TEXT,
            status           VARCHAR(20)  DEFAULT 'pending',
            submitted_date   TIMESTAMP    DEFAULT NOW(),
            approved_date    TIMESTAMP
        );
    """)
    conn.commit()
    cur.close()
    conn.close()
    print("✅  Database tables ready.")


# ── Simple session-based admin auth ───────────────────────────────────────────
admin_sessions = set()

def get_token():
    return (request.headers.get("X-Admin-Token") or
            request.args.get("token") or "")

def require_admin(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if get_token() not in admin_sessions:
            return jsonify({"success": False, "error": "Unauthorized"}), 401
        return f(*args, **kwargs)
    return decorated


# ── Routes ────────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/test")
def test():
    return jsonify({"success": True, "message": "MTC WiFi API is running"})


# ── Auth ──────────────────────────────────────────────────────────────────────

@app.route("/api/login", methods=["POST"])
def login():
    data = request.json or {}
    if data.get("username") == ADMIN_USERNAME and data.get("password") == ADMIN_PASSWORD:
        import secrets
        token = secrets.token_hex(32)
        admin_sessions.add(token)
        return jsonify({"success": True, "token": token})
    return jsonify({"success": False, "error": "Invalid credentials"}), 401


@app.route("/api/logout", methods=["POST"])
def logout():
    token = request.headers.get("X-Admin-Token", "")
    admin_sessions.discard(token)
    return jsonify({"success": True})


# ── WiFi Registration ─────────────────────────────────────────────────────────

@app.route("/api/wifi/submit", methods=["POST"])
def wifi_submit():
    data = request.json or {}
    required = ["name", "surname", "student_number", "national_id"]
    missing = [f for f in required if not data.get(f, "").strip()]
    if missing:
        return jsonify({"success": False, "error": f"Missing fields: {', '.join(missing)}"}), 400

    try:
        conn = get_db()
        cur = conn.cursor()

        # Prevent duplicate active registrations
        cur.execute(
            "SELECT id, status FROM wifi_registrations WHERE student_number = %s ORDER BY submitted_date DESC LIMIT 1",
            (data["student_number"].strip(),)
        )
        existing = cur.fetchone()
        if existing and existing[1] in ("pending", "approved"):
            cur.close(); conn.close()
            return jsonify({"success": False, "error": "A registration for this student number already exists."}), 409

        cur.execute(
            """INSERT INTO wifi_registrations (name, surname, student_number, national_id, balance_image)
               VALUES (%s, %s, %s, %s, %s) RETURNING id""",
            (
                data["name"].strip(),
                data["surname"].strip(),
                data["student_number"].strip(),
                data["national_id"].strip(),
                data.get("balance_image", ""),
            )
        )
        new_id = cur.fetchone()[0]
        conn.commit()
        cur.close(); conn.close()
        return jsonify({"success": True, "id": new_id, "message": "Registration submitted successfully."})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/wifi/submissions")
@require_admin
def wifi_submissions():
    try:
        conn = get_db()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT * FROM wifi_registrations ORDER BY submitted_date DESC")
        rows = [dict(r) for r in cur.fetchall()]
        # Convert datetimes
        for r in rows:
            r["submitted_date"] = r["submitted_date"].isoformat() if r["submitted_date"] else None
            r["approved_date"]  = r["approved_date"].isoformat()  if r["approved_date"]  else None
        cur.close(); conn.close()
        return jsonify({"success": True, "submissions": rows})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# ── Status check (public) ─────────────────────────────────────────────────────

@app.route("/api/check-status")
def check_status():
    student_no = request.args.get("student_number", "").strip()
    if not student_no:
        return jsonify({"success": False, "error": "Student number required"}), 400
    try:
        conn = get_db()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            "SELECT id, name, surname, student_number, national_id, status, submitted_date, approved_date FROM wifi_registrations WHERE student_number = %s ORDER BY submitted_date DESC",
            (student_no,)
        )
        rows = [dict(r) for r in cur.fetchall()]
        for r in rows:
            r["submitted_date"] = r["submitted_date"].isoformat() if r["submitted_date"] else None
            r["approved_date"]  = r["approved_date"].isoformat()  if r["approved_date"]  else None
        cur.close(); conn.close()
        return jsonify({"success": True, "data": rows})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# ── Admin: update status ──────────────────────────────────────────────────────

@app.route("/api/update-status", methods=["POST"])
@require_admin
def update_status():
    data = request.json or {}
    reg_id = data.get("id")
    status = data.get("status")
    if not reg_id or status not in ("approved", "rejected"):
        return jsonify({"success": False, "error": "Invalid request"}), 400
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute(
            "UPDATE wifi_registrations SET status = %s, approved_date = %s WHERE id = %s",
            (status, datetime.now() if status == "approved" else None, reg_id)
        )
        conn.commit(); cur.close(); conn.close()
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# ── Admin: stats ──────────────────────────────────────────────────────────────

@app.route("/api/stats")
@require_admin
def stats():
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT status, COUNT(*) FROM wifi_registrations GROUP BY status")
        rows = cur.fetchall()
        cur.close(); conn.close()
        counts = {r[0]: r[1] for r in rows}
        total = sum(counts.values())
        return jsonify({
            "success": True,
            "stats": {
                "total": total,
                "pending":  counts.get("pending",  0),
                "approved": counts.get("approved", 0),
                "rejected": counts.get("rejected", 0),
            }
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# ── Admin: CSV export ─────────────────────────────────────────────────────────

@app.route("/api/export/csv")
@require_admin
def export_csv():
    date_filter = request.args.get("date", "")
    try:
        conn = get_db()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        if date_filter:
            cur.execute(
                "SELECT id, name, surname, student_number, national_id, status, submitted_date, approved_date FROM wifi_registrations WHERE status = 'approved' AND DATE(approved_date) = %s ORDER BY approved_date",
                (date_filter,)
            )
        else:
            cur.execute(
                "SELECT id, name, surname, student_number, national_id, status, submitted_date, approved_date FROM wifi_registrations WHERE status = 'approved' ORDER BY approved_date"
            )
        rows = cur.fetchall()
        cur.close(); conn.close()

        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=["id", "name", "surname", "student_number", "national_id", "status", "submitted_date", "approved_date"])
        writer.writeheader()
        for r in rows:
            r = dict(r)
            r["submitted_date"] = r["submitted_date"].strftime("%Y-%m-%d %H:%M") if r["submitted_date"] else ""
            r["approved_date"]  = r["approved_date"].strftime("%Y-%m-%d %H:%M")  if r["approved_date"]  else ""
            writer.writerow(r)

        output.seek(0)
        filename = f"wifi_approved_{date_filter or datetime.now().strftime('%Y%m%d')}.csv"
        return send_file(
            io.BytesIO(output.getvalue().encode()),
            mimetype="text/csv",
            as_attachment=True,
            download_name=filename
        )
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    init_db()
    print("🚀  Starting MTC WiFi Registration System on http://0.0.0.0:5000")
    app.run(host="0.0.0.0", port=5000, debug=False)
