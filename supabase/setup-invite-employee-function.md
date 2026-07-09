# Deploy `invite-employee` Edge Function

Inviting employees requires the Supabase **service role** key. The browser calls this edge function; it never exposes the service role to the client.

## Prerequisites

Run `supabase/migration-employees.sql` in the Supabase SQL Editor first (creates `employees`, `profiles`, seeds 67 staff, and `lookup_employee_by_initials`).

## Deploy

```bash
supabase functions deploy invite-employee
```

Optional: set `EMPLOYEE_LOGIN_EMAIL_DOMAIN=jsvalve.com` in function secrets if you use a non-default domain.

## Login format

| What employees see | What Supabase stores |
|--------------------|----------------------|
| Username `ghensley` | Auth email `ghensley@jsvalve.com` |

The login page resolves `employees.username` → auth email automatically.

## Actions

| Action | Body | Purpose |
|--------|------|---------|
| `invite` | `{ employee_id, full_name, email? }` | Send invite (email defaults to `username@jsvalve.com`) |
| `resend` | `{ employee_id, full_name, email? }` | Resend invite for linked account |
| `status` | `{ employee_ids: string[] }` | Auth email / last sign-in for admin table |

All requests require an authenticated user JWT (`supabase.functions.invoke` adds this automatically).

## After deploy

1. Open **Admin → Employees** (`/admin/employees`)
2. Send invites — login email pre-fills as `username@jsvalve.com`
3. New users get `profiles.role = 'admin'` via the database trigger
