# MTC WiFi Registration System
**Mutare Teachers College – Campus WiFi Portal**

---

## Quick Setup (Deploy in 5 minutes)

### 1. Install Python dependencies
```bash
pip install -r requirements.txt
```

### 2. Create the PostgreSQL database
```sql
-- Run in psql as postgres user:
CREATE DATABASE mtc_wifi;
```

### 3. Configure your database password
Open `app.py` and find this section near the top:

```python
DB_CONFIG = {
    "host":     "localhost",
    "port":     "5432",
    "database": "mtc_wifi",
    "user":     "postgres",
    "password": "your_password_here",   # ← change this
}
```

Or set environment variables instead:
```bash
export DB_HOST=localhost
export DB_NAME=mtc_wifi
export DB_USER=postgres
export DB_PASSWORD=your_actual_password
export ADMIN_USER=admin
export ADMIN_PASS=mtcadmin2026
```

### 4. Start the server
```bash
python app.py
```

The app will be available at: **http://localhost:5000**  
On the network (other PCs): **http://YOUR_IP:5000**

---

## Admin Login
- Default username: `admin`
- Default password: `mtcadmin2026`
- **Change these in app.py or via environment variables before going live.**

---

## Features
- Student WiFi registration form (name, surname, student number, national ID, balance screenshot)
- Duplicate registration prevention
- Status check by student number (public)
- Admin dashboard: approve / reject applications
- Export approved registrations as CSV (with optional date filter)
- All data stored in PostgreSQL

---

## File Structure
```
mtc_wifi/
├── app.py                  ← Flask backend (all API routes)
├── requirements.txt
├── templates/
│   └── index.html          ← Single-page frontend
└── static/
    ├── css/styles.css
    └── js/app.js
```

---

## Running in production (optional)
```bash
pip install gunicorn
gunicorn -w 2 -b 0.0.0.0:5000 app:app
```
