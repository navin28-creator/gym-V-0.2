# Flex & Flow — Gym Management System Accounts & Guide

This reference lists every default user account, username, password, recovery email, and Super Admin–gated permission configured in **Flex & Flow**.

---

## Default User Accounts & Credentials

| Role | Full Name | Username | Password | Recovery Email | Email Verified |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Super Admin** | Vikram Joshi (Super Admin) | `superadmin` | `superAdminSecure2026` | `superadmin@flexflowgym.in` | Yes |
| **Operations Admin** | Anjali Deshmukh (Operations Admin) | `gym_admin` | `adminSecure2026` | `anjali.admin@flexflowgym.in` | Yes |
| **Gym Owner** | Vikram Joshi (Gym Owner) | `owner_admin` | `flexflowOwnerSecure10` | `vikram.joshi.gym@gmail.com` | Yes |
| **Branch Manager** | Arjun Nair (Branch Manager) | `branch_mgr` | `managerSecure2026` | `arjun.manager@flexflowgym.in` | Yes |
| **Finance Manager** | Meera Kulkarni (Finance Manager) | `finance_mgr` | `financeSecure2026` | `meera.finance@flexflowgym.in` | Yes |
| **Head Trainer (Staff)** | Priya Sharma (Head Trainer) | `priya_coach` | `trainerPassphrase2026` | `priya.sharma@gmail.com` | No |
| **Front Desk** | Maya Kapoor (Front Desk) | `frontdesk_maya` | `frontdeskPass2026` | `maya.desk@flexflowgym.in` | No |

---

## Role Authority & Super Admin Governance

Only the **Super Admin** sees the top desktop environment bar (`WindowsTitleBar`) and the **Super Admin Governance → Admin Permissions** console. All other accounts run inside a clean, distraction-free workspace with Sign Out in the sidebar footer, and can only access gated features after Super Admin enables them.

1. **Super Admin (`superadmin` / `superAdminSecure2026`)**
   - Unrestricted `16 / 16` root access across the entire system.
   - Assigns roles (`admin`, `owner`, `manager`, `accountant`, `staff`, `receptionist`) and grants/revokes all 16 granular permissions across 5 domains.
   - Controls Future Upgrade Modules (Multi-Branch Sync, GST Invoicing, Biometric Gate, Trainer Payroll).

2. **Gym Owner (`owner_admin` / `flexflowOwnerSecure10`)**
   - Starts with `10 / 16` operational, billing, analytics, and audit-view capabilities.
   - `Delete Members`, `Export Data`, `Undo Actions`, `AES-256 Backups & Restore`, `Manage Staff Accounts`, `Tailscale Hub`, and `Android Expo Mobile` remain locked until Super Admin enables them.

3. **Operations Admin (`gym_admin` / `adminSecure2026`)**
   - Starts with `9 / 16` daily operations & ledger capabilities.
   - Destructive deletes, void/delete payments, data export, undo reversals, backups, team management, Tailscale hub, and Expo mobile remain locked until Super Admin enables them.

4. **Branch Manager (`branch_mgr` / `managerSecure2026`)**
   - Starts with `8 / 16` floor & roster management permissions (members, PII, plans, payments, receipts, reminders, analytics).

5. **Finance Manager (`finance_mgr` / `financeSecure2026`)**
   - Starts with `5 / 16` billing-focused permissions (`Record Payments`, `Print Receipts`, `WhatsApp Reminders`, `View Analytics`, `View Full Audit Log`).

6. **Head Trainer (Staff) (`priya_coach` / `trainerPassphrase2026`)**
   - Starts with `3 / 16` permissions (`Manage Member Profiles`, `Record External Payments`, `Send WhatsApp Reminders`). Contact PII, receipts, analytics, undo, and exports require Super Admin approval.

7. **Front Desk (`frontdesk_maya` / `frontdeskPass2026`)**
   - Starts with `4 / 16` desk intake permissions (`Manage Member Profiles`, `View Contact PII`, `Record Payments`, `Print Receipts`).

---

## Password Recovery Codes (Local Testing)

- **One-Time Email Recovery Verification Codes**: `492817` or `123456`
- **Desktop Local Emergency Recovery**: Available on the Sign-In page (**Forgot password / Recovery? → Desktop Local Recovery Fallback**) and under **Account & Security**.

---

## Quick Start

```bash
npm install
npm run dev
```

App runs on `http://localhost:3000`.
