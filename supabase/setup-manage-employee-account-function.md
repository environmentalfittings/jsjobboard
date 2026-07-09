# Deploy `manage-employee-account` Edge Function

Employee account create / reset / deactivate requires the Supabase **service role** key. The browser calls this edge function; the service role is never exposed to the client.

## Prerequisites

Run `supabase/migration-employees.sql` in the Supabase SQL Editor first.

## Deploy

```bash
supabase functions deploy manage-employee-account
```

Optional secret: `EMPLOYEE_LOGIN_EMAIL_DOMAIN=jsvalve.com` (default).

## Actions

| Action | Body |
|--------|------|
| `create` | `{ employee_id, username, password, full_name? }` |
| `reset_password` | `{ employee_id, new_password }` |
| `deactivate` | `{ employee_id }` |
| `status` | `{ employee_ids: string[] }` → last sign-in times |

## Login format

Employees sign in with **username + password** only. The app maps `ghensley` → `ghensley@jsvalve.com` internally for Supabase Auth.

## After deploy

1. Open **Admin → Employees** (`/admin/employees`)
2. Create accounts or use **Create All Missing Accounts**
3. Print usernames from **Print usernames** (`/admin/employees/print-usernames`)

## Bulk SQL alternative

To create many accounts at once without the Edge Function, run `supabase/bulk-create-employee-accounts.sql` in the SQL Editor. It creates auth users, links `employees`, and inserts `technicians` rows for login lookup. Safe to re-run (skips existing emails). Default password: `JSValve2026!`
