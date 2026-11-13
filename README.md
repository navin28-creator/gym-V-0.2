# Flex & Flow — Gym Management System

Flex & Flow is a local-first Windows gym management desktop application with offline SQLite storage, external payment tracking in Indian Rupees (₹), reversible activity audit log, automated AES-256-GCM encrypted backups, private Tailscale Android Expo connection, and 12-month analytics.

---

## 🚀 Quick Start Guide (Run on Your PC)

### Prerequisites
- **Node.js**: Version 18, 20, or newer (download from [nodejs.org](https://nodejs.org))
- **npm**: Comes bundled with Node.js

### 1. Extract and Install
Extract the downloaded ZIP file into a folder on your PC (e.g. `C:\FlexAndFlow` or `~/flex-and-flow`).

Open your terminal (Command Prompt, PowerShell, or Terminal) in that folder and run:

```bash
npm install
```

### 2. Start the Application
Run the local development server:

```bash
npm run dev
```

The app will start on port **3000**:
```text
  VITE v8.3.0  ready in 240 ms

  ➜  Local:   http://localhost:3000/
  ➜  Network: use --host to expose
```

Open your browser and navigate to:
👉 **[http://localhost:3000](http://localhost:3000)**

---

## 🔑 Default Accounts (Pre-configured)

| Role | Full Name | Username | Password | Recovery Email | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Super Admin** | Vikram Joshi (Super Admin) | `superadmin` | `superAdminSecure2026` | `superadmin@flexflowgym.in` | Unrestricted root access (`16/16`), top bar, role assignment, 16 permission gates, upgrade modules |
| **Operations Admin** | Anjali Deshmukh | `gym_admin` | `adminSecure2026` | `anjali.admin@flexflowgym.in` | Operations & ledger (`9/16` active by default; additional features gated by Super Admin) |
| **Gym Owner** | Vikram Joshi (Gym Owner) | `owner_admin` | `flexflowOwnerSecure10` | `vikram.joshi.gym@gmail.com` | Operations, voiding, analytics & audit view (`10/16` default; backups/export/undo gated by Super Admin) |
| **Branch Manager** | Arjun Nair | `branch_mgr` | `managerSecure2026` | `arjun.manager@flexflowgym.in` | Floor operations, plans, billing & analytics (`8/16` default; configurable by Super Admin) |
| **Finance Manager** | Meera Kulkarni | `finance_mgr` | `financeSecure2026` | `meera.finance@flexflowgym.in` | Billing, receipts, reminders, analytics & audit log (`5/16` default; configurable by Super Admin) |
| **Head Trainer (Staff)** | Priya Sharma | `priya_coach` | `trainerPassphrase2026` | `priya.sharma@gmail.com` | Basic member & payment entry (`3/16` default; PII/receipts/undo gated by Super Admin) |
| **Front Desk** | Maya Kapoor | `frontdesk_maya` | `frontdeskPass2026` | `maya.desk@flexflowgym.in` | Member intake, contact PII, payments & receipts (`4/16` default; configurable by Super Admin) |

> *Recovery Testing:* One-time email verification test codes are `492817` and `123456`. You can also change passwords, create new accounts, or invoke local desktop recovery under **Account & Security** or on the Sign-In screen.

---

## ✨ Application Features

1. **Local-First SQLite Storage**:
   - Stores data locally in `%APPDATA%\Flex & Flow\gym.sqlite` (or `desktop/data/gym.sqlite`).
   - Works 100% offline without requiring internet.

2. **12-Month Analytics (Recharts)**:
   - Monthly gross revenue progression (₹) with target budget benchmarks and MoM growth %.
   - Collections distribution across UPI (GPay/PhonePe), Cash, and Bank Transfer / POS Card.
   - New member signup velocity and cumulative active lifters.
   - Monthly churn rate % against gym health benchmarks (&lt; 6.0%) and exit survey cause breakdowns.

3. **External Payments Ledger & Indian Rupee (₹)**:
   - Handles external transactions outside the app (UPI QR, Cash, Bank Transfer, POS Card).
   - Generates printable and shareable receipt vouchers with GSTIN and reference numbers.
   - Formats currency in INR (`₹`) and timestamps in `Asia/Kolkata` (IST).

4. **1-Click WhatsApp & SMS Payment Reminders**:
   - Generates pre-filled WhatsApp click-to-chat links (`wa.me`) and SMS drafts with pending balance and gym UPI ID.

5. **Reversible Audit Log & Safe Undo**:
   - Implements safe undo rules: keeps the original event and logs a linked reversal record.
   - Payments are voided with a reason rather than deleted; voided payments no longer count toward member balances.
   - Prevents deletion of members with active history.

6. **Automated Encrypted Backups (AES-256-GCM)**:
   - Downloads unencrypted `.sqlite` snapshots for manual backup.
   - Automated email backups encrypted with 32-byte Base64 key (`BACKUP_ENCRYPTION_KEY`).
   - Built-in In-App Decrypt & Restore tool matching `node scripts/decrypt-backup.js`.

7. **Tailscale & Android Expo Client Emulator**:
   - Simulates `tailscale serve --bg 3000` proxying `127.0.0.1:3000` to `https://flexflow-gym.ts.net`.
   - Includes interactive smartphone mockup running the Expo mobile app with SecureStore bearer sessions.

---

## 📦 Building for Production

To create an optimized production build:

```bash
npm run build
npm run preview
```

The output will be generated in `dist/`.
