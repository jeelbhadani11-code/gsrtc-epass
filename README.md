# 🚌 GSRTC E-Pass — Backend API

Full REST API backend for the GSRTC E-Pass portal.
**Stack:** Node.js · Express · PostgreSQL · JWT · Multer · Puppeteer · Nodemailer

---

## 📁 Project Structure

```
gsrtc-backend/
├── src/
│   ├── server.js                   ← Entry point
│   ├── config/
│   │   └── db.js                   ← PostgreSQL connection pool
│   ├── routes/
│   │   ├── auth.routes.js          ← User auth routes
│   │   ├── admin.routes.js         ← Admin auth routes
│   │   ├── applications.routes.js  ← Application + pass routes
│   │   └── config.routes.js        ← Pass types / validity config
│   ├── controllers/
│   │   ├── auth.controller.js      ← Register, login, profile
│   │   ├── admin.controller.js     ← Admin login, audit logs
│   │   ├── applications.controller.js ← Apply, track, review, stats
│   │   ├── passTypes.controller.js ← Pass type / validity CRUD
│   │   └── pass.controller.js      ← PDF / HTML pass download
│   ├── middleware/
│   │   ├── auth.js                 ← JWT verify, role guards, audit
│   │   ├── validators.js           ← express-validator rules
│   │   └── upload.js               ← Multer file uploads
│   └── utils/
│       ├── jwt.js                  ← Token generate / verify
│       ├── response.js             ← Standardised API responses
│       ├── helpers.js              ← App ID, amount calc, pagination
│       ├── email.js                ← Nodemailer email templates
│       ├── migrate.js              ← Run DB migrations (npm run db:migrate)
│       └── seed.js                 ← Seed default data (npm run db:seed)
├── uploads/                        ← User-uploaded files (git-ignored)
│   ├── photos/
│   └── documents/
├── .env.example                    ← Copy to .env and fill in values
└── package.json
```

---

## ⚡ Quick Start

### 1. Prerequisites
- Node.js 18+
- PostgreSQL 14+

### 2. Install dependencies
```bash
npm install
```

### 3. Configure environment
```bash
cp .env.example .env
# Edit .env with your DB credentials and JWT secrets
```

### 4. Create the database
```sql
-- In psql or pgAdmin:
CREATE DATABASE gsrtc_epass;
```

### 5. Run migrations
```bash
npm run db:migrate
```

### 6. Seed default data
```bash
npm run db:seed
# Seeds: pass types, validity options, admin user, demo users + applications
```

### 7. Start the server
```bash
# Development (auto-restart)
npm run dev

# Production
npm start
```

Server runs at **http://localhost:5000**

---

## 🔐 Default Credentials (after seed)

| Role  | Username / Mobile | Password    |
|-------|-------------------|-------------|
| Admin | `admin`           | `gsrtc@2025`|
| User  | `9876543210`      | `rahul123`  |
| User  | `9812345678`      | `priya123`  |
| User  | `9988776655`      | `kiran123`  |

---

## 📋 Complete API Reference

**Base URL:** `http://localhost:5000`

All protected routes require header:
```
Authorization: Bearer <accessToken>
```

---

### ❤️ Health

| Method | Endpoint  | Auth | Description        |
|--------|-----------|------|--------------------|
| GET    | `/health` | ❌   | Server + DB status |

---

### 👤 User Auth  `/api/auth`

| Method | Endpoint             | Auth       | Description                      |
|--------|----------------------|------------|----------------------------------|
| POST   | `/register`          | ❌         | Create new user account          |
| POST   | `/login`             | ❌         | Login with mobile + password     |
| POST   | `/refresh`           | ❌         | Refresh access token             |
| POST   | `/logout`            | ✅ User    | Logout (revoke refresh token)    |
| GET    | `/profile`           | ✅ User    | Get own profile                  |
| PUT    | `/profile`           | ✅ User    | Update name / email / photo      |
| PUT    | `/change-password`   | ✅ User    | Change password                  |

#### POST /api/auth/register
```json
{
  "name": "Rahul Sharma",
  "mobile": "9876543210",
  "email": "rahul@example.com",
  "aadhaar": "123456789012",
  "password": "rahul123"
}
```

#### POST /api/auth/login
```json
{ "mobile": "9876543210", "password": "rahul123" }
```

#### Response (login / register)
```json
{
  "success": true,
  "data": {
    "user": { "id": "...", "name": "Rahul Sharma", "mobile": "9876543210", ... },
    "accessToken": "eyJ...",
    "refreshToken": "eyJ..."
  }
}
```

---

### 🛡️ Admin Auth  `/api/admin`

| Method | Endpoint      | Auth        | Description               |
|--------|---------------|-------------|---------------------------|
| POST   | `/login`      | ❌          | Admin login               |
| POST   | `/logout`     | ✅ Admin    | Admin logout              |
| POST   | `/refresh`    | ❌          | Refresh admin token       |
| GET    | `/audit-logs` | ✅ Admin    | Paginated audit log       |

#### POST /api/admin/login
```json
{ "username": "admin", "password": "gsrtc@2025" }
```

---

### 📄 Applications  `/api/applications`

| Method | Endpoint                          | Auth        | Description                         |
|--------|-----------------------------------|-------------|-------------------------------------|
| POST   | `/`                               | ✅ User     | Submit new application              |
| GET    | `/my`                             | ✅ User     | Get own applications (paginated)    |
| GET    | `/downloads`                      | ✅ User     | Get approved passes for download    |
| GET    | `/track/:id`                      | ❌          | Track application by ID (public)    |
| GET    | `/:id`                            | ✅ User     | Get single application (own only)   |
| GET    | `/:appId/download`                | ✅ User/Admin | Download pass as PDF/HTML          |
| GET    | `/admin/all`                      | ✅ Admin    | All applications (filter + paginate)|
| GET    | `/admin/stats`                    | ✅ Admin    | Dashboard statistics                |
| GET    | `/admin/users`                    | ✅ Admin    | All registered users                |
| PATCH  | `/admin/:id/review`               | ✅ Admin    | Approve or reject application       |
| PATCH  | `/admin/users/:userId/toggle`     | ✅ Admin    | Activate / deactivate user          |

#### POST /api/applications  (multipart/form-data)
```
applicantName  : "Rahul Sharma"
passType       : "Student Concession"
mobile         : "9876543210"
email          : "rahul@example.com"   (optional)
collegeOrg     : "Silver Oak University" (optional)
fromCity       : "Ahmedabad"
toCity         : "Gandhinagar"
validity       : "1 Month"
photo          : <file>   (optional, jpg/png/webp, max 5MB)
document       : <file>   (optional, jpg/png/pdf, max 5MB)
```

#### GET /api/applications/my  (query params)
```
?page=1&limit=10&status=Pending
```

#### GET /api/applications/admin/all  (query params)
```
?page=1&limit=15&status=Pending&search=Rahul&passType=Student+Concession&from=2025-01-01&to=2025-12-31
```

#### PATCH /api/applications/admin/:id/review
```json
{ "status": "Approved" }
// or
{ "status": "Rejected", "rejectionReason": "Incomplete documentation" }
```

---

### ⚙️ Config  `/api/config`

| Method | Endpoint               | Auth        | Description                      |
|--------|------------------------|-------------|----------------------------------|
| GET    | `/pass-types`          | ❌          | All active pass types            |
| GET    | `/validity-options`    | ❌          | All validity options             |
| GET    | `/calculate-amount`    | ❌          | Calculate pass amount            |
| POST   | `/pass-types`          | ✅ Admin    | Create a new pass type           |
| PUT    | `/pass-types/:id`      | ✅ Admin    | Update a pass type               |

#### GET /api/config/calculate-amount
```
?passType=Student+Concession&validity=3+Months
```
Response:
```json
{
  "success": true,
  "data": { "passType": "Student Concession", "validity": "3 Months", "baseAmount": 150, "multiplier": 2.75, "amount": 412.50 }
}
```

---

## 📊 Database Schema

### `users`
| Column        | Type         | Notes                     |
|---------------|--------------|---------------------------|
| id            | UUID (PK)    | Auto-generated            |
| name          | VARCHAR(120) |                           |
| mobile        | VARCHAR(10)  | Unique, used for login    |
| email         | VARCHAR(255) | Unique, optional          |
| aadhaar       | VARCHAR(12)  | Stored plain (mask on read)|
| password_hash | VARCHAR(255) | bcrypt hash               |
| photo_url     | VARCHAR(500) | Path to uploaded photo    |
| is_active     | BOOLEAN      | Soft disable              |
| created_at    | TIMESTAMPTZ  |                           |

### `applications`
| Column           | Type         | Notes                             |
|------------------|--------------|-----------------------------------|
| id               | VARCHAR(30)  | e.g. GP-2025-08432                |
| user_id          | UUID (FK)    | → users.id                        |
| applicant_name   | VARCHAR(120) |                                   |
| pass_type        | VARCHAR(100) |                                   |
| mobile           | VARCHAR(10)  |                                   |
| email            | VARCHAR(255) |                                   |
| college_org      | VARCHAR(200) |                                   |
| from_city        | VARCHAR(100) |                                   |
| to_city          | VARCHAR(100) |                                   |
| validity         | VARCHAR(50)  | 1 Month / 3 Months / 6 Months / Annual |
| amount           | NUMERIC      |                                   |
| status           | VARCHAR(20)  | Pending / Approved / Rejected     |
| rejection_reason | TEXT         | Filled when rejected              |
| reviewed_by      | UUID (FK)    | → admins.id                       |
| reviewed_at      | TIMESTAMPTZ  |                                   |
| valid_from       | DATE         | Set when approved                 |
| valid_until      | DATE         | Set when approved                 |
| photo_url        | VARCHAR(500) |                                   |
| document_url     | VARCHAR(500) |                                   |
| submitted_at     | TIMESTAMPTZ  |                                   |

### `admins`
| Column        | Type        | Notes              |
|---------------|-------------|--------------------|
| id            | UUID (PK)   |                    |
| username      | VARCHAR(60) | Unique             |
| email         | VARCHAR(255)| Unique             |
| password_hash | VARCHAR(255)|                    |
| full_name     | VARCHAR(120)|                    |
| role          | VARCHAR(30) | officer / superadmin|
| last_login    | TIMESTAMPTZ |                    |

### `pass_types`
| Column      | Type          | Notes            |
|-------------|---------------|------------------|
| id          | SERIAL (PK)   |                  |
| name        | VARCHAR(100)  | Unique           |
| description | TEXT          |                  |
| base_amount | NUMERIC(10,2) |                  |
| is_active   | BOOLEAN       |                  |

### `validity_options`
| Column     | Type          | Notes                          |
|------------|---------------|--------------------------------|
| id         | SERIAL (PK)   |                                |
| label      | VARCHAR(50)   | "1 Month", "3 Months", etc.    |
| months     | INTEGER       |                                |
| multiplier | NUMERIC(4,2)  | Applied to base_amount         |

### `refresh_tokens`
| Column     | Type        | Notes                       |
|------------|-------------|-----------------------------|
| id         | UUID (PK)   |                             |
| user_id    | UUID (FK)   | Null if admin token         |
| admin_id   | UUID (FK)   | Null if user token          |
| token      | VARCHAR(512)| JWT string                  |
| expires_at | TIMESTAMPTZ |                             |

### `audit_logs`
| Column      | Type        | Notes                         |
|-------------|-------------|-------------------------------|
| id          | UUID (PK)   |                               |
| actor_type  | VARCHAR(10) | user / admin                  |
| actor_id    | UUID        |                               |
| action      | VARCHAR(100)| e.g. LOGIN, SUBMIT_APPLICATION|
| target_type | VARCHAR(50) | application, user, etc.       |
| target_id   | VARCHAR(100)|                               |
| meta        | JSONB       | Extra context                 |
| ip_address  | INET        |                               |
| created_at  | TIMESTAMPTZ |                               |

---

## 🔌 Frontend Integration

Replace `localStorage` DB calls in the original HTML with these fetch calls:

### Login
```javascript
const res = await fetch('http://localhost:5000/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ mobile, password }),
});
const data = await res.json();
if (data.success) {
  localStorage.setItem('gsrtc_token', data.data.accessToken);
  localStorage.setItem('gsrtc_user', JSON.stringify(data.data.user));
}
```

### Authenticated request helper
```javascript
const apiFetch = (url, options = {}) =>
  fetch(`http://localhost:5000${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem('gsrtc_token')}`,
      ...options.headers,
    },
  }).then(r => r.json());
```

### Submit Application
```javascript
const form = new FormData();
form.append('applicantName', name);
form.append('passType', type);
form.append('mobile', mobile);
form.append('fromCity', from);
form.append('toCity', to);
form.append('validity', validity);
// form.append('photo', fileInput.files[0]);  // optional

const res = await fetch('http://localhost:5000/api/applications', {
  method: 'POST',
  headers: { Authorization: `Bearer ${localStorage.getItem('gsrtc_token')}` },
  body: form,
});
```

### Track Application (no auth)
```javascript
const data = await apiFetch(`/api/applications/track/${appId}`);
```

### Download Pass
```javascript
window.open(`http://localhost:5000/api/applications/${appId}/download?token=${token}`);
```

---

## 📧 Email Configuration

Set SMTP credentials in `.env` to enable transactional emails:
- Welcome email on registration
- Application submitted confirmation
- Approval / rejection notifications

Emails are non-blocking (fire-and-forget). If SMTP is not configured, they are silently skipped with a console log.

---

## 🚀 Production Deployment

### Environment
```env
NODE_ENV=production
DATABASE_URL=postgresql://user:pass@host:5432/gsrtc_epass
JWT_SECRET=<64-char random string>
JWT_REFRESH_SECRET=<64-char random string>
ALLOWED_ORIGINS=https://yourdomain.com
```

### Recommended: Railway / Render / AWS
1. Push to GitHub
2. Connect repo to Railway/Render
3. Add PostgreSQL add-on
4. Set environment variables
5. Build command: `npm install && npm run db:migrate && npm run db:seed`
6. Start command: `npm start`

### PM2 (VPS)
```bash
npm install -g pm2
pm2 start src/server.js --name gsrtc-api
pm2 startup && pm2 save
```

---

## 🔒 Security Features

- **bcrypt** password hashing (cost factor 12)
- **JWT** access tokens (short-lived: 7d) + refresh tokens (30d)
- **Refresh token rotation** — old token invalidated on each refresh
- **Rate limiting** — 10 auth attempts / 15 min; 200 general / 15 min
- **Helmet** HTTP security headers
- **CORS** whitelist
- **Input validation** via express-validator on all routes
- **Audit logging** — every action logged with actor, IP, timestamp
- **SQL injection** — prevented via pg parameterised queries only
- **File upload** validation — type + size enforced by Multer
