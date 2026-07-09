-- Link employees.auth_user_id for accounts created before the bulk script.
-- Run after bulk-create-employee-accounts.sql if verify shows 2 employees_not_linked.

UPDATE employees e
SET auth_user_id = u.id
FROM auth.users u
WHERE e.auth_user_id IS NULL
  AND u.email = e.username || '@jsvalve.com';

-- Ensure technicians rows exist for login lookup
INSERT INTO technicians (name, employee_id, login_username, login_email, user_id, active, role)
SELECT
  e.full_name,
  e.employee_no,
  e.username,
  e.username || '@jsvalve.com',
  e.auth_user_id,
  true,
  'admin'
FROM employees e
WHERE e.auth_user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM technicians t WHERE lower(t.login_username) = lower(e.username)
  );

-- Verify
SELECT username, full_name, auth_user_id IS NOT NULL AS linked
FROM employees
WHERE username IN ('cbelden', 'cbustos')
ORDER BY username;

SELECT
  COUNT(*) FILTER (WHERE e.auth_user_id IS NOT NULL) AS employees_linked,
  COUNT(*) FILTER (WHERE e.auth_user_id IS NULL)     AS employees_not_linked
FROM employees e;
