-- Diagnose employees still missing auth_user_id after bulk create.
-- Run each block in Supabase SQL Editor.

-- 1) Which employees are not linked?
SELECT employee_no, username, full_name, auth_user_id
FROM employees
WHERE auth_user_id IS NULL
ORDER BY username;

-- 2) Do auth users exist for those usernames?
SELECT e.username, e.full_name, u.id AS auth_id, u.email, u.created_at
FROM employees e
LEFT JOIN auth.users u ON lower(u.email) = lower(e.username || '@jsvalve.com')
WHERE e.auth_user_id IS NULL
ORDER BY e.username;

-- 3) Pre-created accounts (cbelden / cbustos) — any email variant?
SELECT id, email, created_at, last_sign_in_at
FROM auth.users
WHERE lower(email) LIKE 'cbelden%' OR lower(email) LIKE 'cbustos%'
   OR lower(email) LIKE '%belden%' OR lower(email) LIKE '%bustos%'
ORDER BY email;

-- 4) Link when auth user exists (any email matching username@jsvalve.com)
UPDATE employees e
SET auth_user_id = u.id
FROM auth.users u
WHERE e.auth_user_id IS NULL
  AND lower(u.email) = lower(e.username || '@jsvalve.com');

-- 5) If auth exists under a different email, link manually — example:
-- UPDATE employees SET auth_user_id = '<paste-auth-user-uuid>'
-- WHERE username = 'cbelden';

-- 6) Re-verify
SELECT
  COUNT(*) FILTER (WHERE auth_user_id IS NOT NULL) AS employees_linked,
  COUNT(*) FILTER (WHERE auth_user_id IS NULL)     AS employees_not_linked
FROM employees;
