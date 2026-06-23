# Shop login setup (Supabase Edge Function)

Browser clients cannot create or reset passwords with the Supabase **service role**. The `shop-auth` edge function does that securely for admins/managers.

## One-time deploy

1. Install [Supabase CLI](https://supabase.com/docs/guides/cli) and log in: `supabase login`
2. Link your project (from repo root):

   ```bash
   supabase link --project-ref YOUR_PROJECT_REF
   ```

3. Deploy the function:

   ```bash
   supabase functions deploy shop-auth
   ```

4. The function automatically receives `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`.

## Fix a user who cannot sign in (e.g. jfuller)

1. Deploy `shop-auth` (above), **or** create the user manually in Supabase Dashboard (below).
2. As admin, open **Technicians** → find the person → **Reset password** → enter `Jsvalves` (or your chosen password).
3. They sign in at https://jsjobboard.vercel.app/login with **username** `jfuller` (not email).

## Manual user create (no edge function)

In **Supabase Dashboard → Authentication → Users → Add user**:

| Field | Value |
|--------|--------|
| Email | `jfuller@users.jsvalve.local` |
| Password | `Jsvalves` |
| Auto Confirm User | Yes |
| User metadata | `{ "role": "manager", "name": "Jim Fuller" }` |

Then in **SQL Editor**, link the auth user to the technician row:

```sql
update public.technicians t
set user_id = u.id
from auth.users u
where lower(t.login_username) = 'jfuller'
  and lower(u.email) = lower(t.login_email);
```

Verify:

```sql
select name, login_username, login_email, user_id, role
from public.technicians
where lower(login_username) = 'jfuller';
```

`user_id` must not be null for login to work reliably.
