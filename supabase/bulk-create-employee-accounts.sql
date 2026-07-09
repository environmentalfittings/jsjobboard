-- Bulk create auth accounts for remaining employees
-- (cbelden and cbustos already created and verified working)
--
-- Run in: Supabase > SQL Editor
--
-- What each iteration does:
--   1. INSERT auth.users  — cost-10 bcrypt, confirmed, empty token fields, raw_app_meta_data set
--   2. INSERT auth.identities — required for GoTrue email provider
--   3. UPDATE employees   — set auth_user_id
--   4. INSERT technicians — required for app login lookup
--
-- Safe to re-run: skips any username that already has an auth.users row.
-- Default password for all accounts: JSValve2026!

DO $$
DECLARE
  r      RECORD;
  v_id   UUID;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('ghensley',     'Gary Hensley'),
      ('dwells',       'Dustin Wells'),
      ('cfarley',      'Colten Farley'),
      ('sgarrett',     'Scottie Garrett'),
      ('hhash',        'Hugh Hash'),
      ('chobbs',       'Corey Hobbs'),
      ('nhumphries',   'Nicholas Humphries'),
      ('kjones',       'Kristian Jones'),
      ('amartinez',    'Adam Martinez'),
      ('dmcdaniel',    'David McDaniel'),
      ('aparker',      'Andrew Parker'),
      ('cslaton',      'Conner Slaton'),
      ('btobin',       'Brad Tobin'),
      ('ctracy',       'Christopher Tracy'),
      ('mwashington',  'Mylon Washington'),
      ('awilliamson',  'Aaron Williamson'),
      ('jwoolman',     'Joshua Woolman'),
      ('mzillifro',    'Michael Zillifro'),
      ('afreeman',     'Alec Freeman'),
      ('ghawn',        'Garret Hawn'),
      ('eholweg',      'Eric Holweg'),
      ('mhughes',      'Michael Hughes'),
      ('ajohnson',     'Andrew Johnson'),
      ('jfuller',      'James Fuller'),
      ('rcarter',      'Rusty Carter'),
      ('dchancellor',  'David Chancellor'),
      ('rdejulio',     'Robert DeJulio'),
      ('cfreeman',     'Charles Freeman'),
      ('cgoodell',     'Chase Goodell'),
      ('lgoodell',     'Lane Goodell'),
      ('cgreathouse',  'Chris Greathouse'),
      ('cholinsworth', 'Charles Holinsworth'),
      ('shumphries',   'Steven Humphries'),
      ('sjohnson',     'Seth Johnson'),
      ('bjohnston',    'Benjamin Johnston'),
      ('bjones',       'Ben Jones'),
      ('mkempton',     'Matthew Kempton'),
      ('elowe',        'Edwina Lowe'),
      ('mmaddux',      'Mark Maddux'),
      ('kmayhew',      'Kevin Mayhew'),
      ('jmoffett',     'Jeramie Moffett'),
      ('tmoss',        'Tanner Moss'),
      ('smurphy',      'Shannon Murphy'),
      ('boconnor',     'Briant O''Connor'),
      ('jpfister',     'Josh Pfister'),
      ('rpruett',      'Roland Pruett'),
      ('kvandagriff',  'Kim Vandagriff'),
      ('tcole',        'Tyson Cole'),
      ('wdavis',       'William Davis'),
      ('jhobbs',       'Jesse Hobbs'),
      ('dkirby',       'Dakota Kirby'),
      ('lpierce',      'Lucas Pierce'),
      ('rvalenzuela',  'Rene Valenzuela'),
      ('rwolf',        'Randy Wolf'),
      ('jowens',       'Joel Owens'),
      ('bdunn',        'Brian Dunn'),
      ('dhughes',      'David Hughes'),
      ('nhughes',      'Nicholas Hughes'),
      ('bhumphries',   'Brayden Humphries'),
      ('khurd',        'Kaci Hurd'),
      ('mmccoach',     'Michael McCoach'),
      ('mnash',        'Mark Nash'),
      ('cparrett',     'Charlie Parrett'),
      ('ssimmons',     'Shayne Simmons'),
      ('dwhite',       'Danny White')
    ) AS t(username, full_name)
  LOOP
    IF EXISTS (
      SELECT 1 FROM auth.users WHERE email = r.username || '@jsvalve.com'
    ) THEN
      RAISE NOTICE 'Skipping % — already exists', r.username;
      CONTINUE;
    END IF;

    v_id := gen_random_uuid();

    INSERT INTO auth.users (
      id,
      instance_id,
      email,
      encrypted_password,
      email_confirmed_at,
      created_at,
      updated_at,
      role,
      aud,
      raw_user_meta_data,
      raw_app_meta_data,
      confirmation_token,
      recovery_token,
      email_change_token_new,
      email_change
    ) VALUES (
      v_id,
      '00000000-0000-0000-0000-000000000000',
      r.username || '@jsvalve.com',
      crypt('JSValve2026!', gen_salt('bf', 10)),
      now(),
      now(),
      now(),
      'authenticated',
      'authenticated',
      jsonb_build_object('full_name', r.full_name, 'username', r.username, 'role', 'admin'),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '',
      '',
      '',
      ''
    );

    UPDATE auth.users
    SET
      email_change_token_current = coalesce(email_change_token_current, '')
    WHERE id = v_id;

    INSERT INTO auth.identities (
      provider_id,
      user_id,
      identity_data,
      provider,
      last_sign_in_at,
      created_at,
      updated_at
    ) VALUES (
      v_id::text,
      v_id,
      jsonb_build_object(
        'sub',            v_id::text,
        'email',          r.username || '@jsvalve.com',
        'email_verified', true,
        'phone_verified', false
      ),
      'email',
      now(),
      now(),
      now()
    );

    UPDATE employees
    SET auth_user_id = v_id
    WHERE username = r.username;

    INSERT INTO technicians (name, employee_id, login_username, login_email, user_id, active, role)
    SELECT
      r.full_name,
      e.employee_no,
      r.username,
      r.username || '@jsvalve.com',
      v_id,
      true,
      'admin'
    FROM employees e
    WHERE e.username = r.username
    ON CONFLICT DO NOTHING;

    RAISE NOTICE 'Created: %', r.username;
  END LOOP;
END $$;

-- VERIFY
SELECT
  COUNT(*) FILTER (WHERE t.user_id IS NOT NULL) AS technicians_with_auth,
  COUNT(*) FILTER (WHERE t.user_id IS NULL)     AS technicians_missing_auth
FROM technicians t;

SELECT
  COUNT(*) FILTER (WHERE e.auth_user_id IS NOT NULL) AS employees_linked,
  COUNT(*) FILTER (WHERE e.auth_user_id IS NULL)     AS employees_not_linked
FROM employees e;
