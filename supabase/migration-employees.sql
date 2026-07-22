-- J-S Machine & Valve — Employee setup (employees, profiles, roster, initials lookup)
-- Run in Supabase SQL Editor. Safe to re-run (uses IF NOT EXISTS / ON CONFLICT).

CREATE TABLE IF NOT EXISTS employees (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_no   TEXT NOT NULL UNIQUE,
  first_name    TEXT NOT NULL,
  last_name     TEXT NOT NULL,
  full_name     TEXT NOT NULL,
  username      TEXT NOT NULL UNIQUE,
  initials      TEXT NOT NULL,
  company       TEXT DEFAULT 'J-S Machine & Valve, Inc.',
  is_active     BOOLEAN DEFAULT true,
  is_tester     BOOLEAN NOT NULL DEFAULT false,
  auth_user_id  UUID,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS employees_employee_no_idx ON employees(employee_no);
CREATE INDEX IF NOT EXISTS employees_username_idx    ON employees(username);
CREATE INDEX IF NOT EXISTS employees_initials_idx    ON employees(initials);
CREATE INDEX IF NOT EXISTS employees_auth_user_idx   ON employees(auth_user_id);

CREATE TABLE IF NOT EXISTS profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_id   UUID REFERENCES employees(id),
  role          TEXT NOT NULL DEFAULT 'admin'
                  CHECK (role IN ('admin', 'viewer', 'customer')),
  full_name     TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE OR REPLACE FUNCTION update_profiles_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_profiles_updated_at();

ALTER TABLE profiles  ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_read_profiles" ON profiles;
CREATE POLICY "staff_read_profiles"
  ON profiles FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "staff_own_profile_update" ON profiles;
CREATE POLICY "staff_own_profile_update"
  ON profiles FOR UPDATE TO authenticated USING (id = auth.uid());

DROP POLICY IF EXISTS "staff_read_employees" ON employees;
CREATE POLICY "staff_read_employees"
  ON employees FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO profiles (id, role, full_name)
  VALUES (
    NEW.id,
    'admin',
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Employee roster seed (67 staff). Username = first initial + last name (lowercase).
INSERT INTO employees (employee_no, first_name, last_name, full_name, username, initials)
VALUES
  ('000849', 'Gary W.',     'Hensley',      'Gary Hensley',       'ghensley',      'GH'),
  ('001127', 'Dustin',      'Wells',        'Dustin Wells',       'dwells',        'DW'),
  ('000898', 'Colten',      'Bustos',       'Colten Bustos',      'cbustos',       'CB'),
  ('000837', 'Colten J.',   'Farley',       'Colten Farley',      'cfarley',       'CF'),
  ('000863', 'Scottie',     'Garrett',      'Scottie Garrett',    'sgarrett',      'SG'),
  ('000839', 'Hugh T.',     'Hash',         'Hugh Hash',          'hhash',         'HH'),
  ('001185', 'Corey J.',    'Hobbs',        'Corey Hobbs',        'chobbs',        'COH'),
  ('000841', 'Nicholas J.', 'Humphries',    'Nicholas Humphries', 'nhumphries',    'NH'),
  ('000900', 'Kristian',    'Jones I',      'Kristian Jones',     'kjones',        'KJ'),
  ('000864', 'Adam',        'Martinez',     'Adam Martinez',      'amartinez',     'AM'),
  ('000935', 'David',       'McDaniel',     'David McDaniel',     'dmcdaniel',     'DM'),
  ('000937', 'Andrew',      'Parker',       'Andrew Parker',      'aparker',       'AP'),
  ('000939', 'Conner',      'Slaton',       'Conner Slaton',      'cslaton',       'CS'),
  ('001192', 'Brad',        'Tobin',        'Brad Tobin',         'btobin',        'BT'),
  ('000866', 'Christopher', 'Tracy',        'Christopher Tracy',  'ctracy',        'CT'),
  ('000941', 'Mylon',       'Washington',   'Mylon Washington',   'mwashington',   'MW'),
  ('000878', 'Aaron B.',    'Williamson',   'Aaron Williamson',   'awilliamson',   'AW'),
  ('000906', 'Joshua',      'Woolman',      'Joshua Woolman',     'jwoolman',      'JW'),
  ('000848', 'Michael',     'Zillifro',     'Michael Zillifro',   'mzillifro',     'MZ'),
  ('000883', 'Alec C.',     'Freeman',      'Alec Freeman',       'afreeman',      'ALF'),
  ('000860', 'Garret',      'Hawn',         'Garret Hawn',        'ghawn',         'GAH'),
  ('000840', 'Eric',        'Holweg',       'Eric Holweg',        'eholweg',       'EH'),
  ('000879', 'Michael',     'Hughes',       'Michael Hughes',     'mhughes',       'MH'),
  ('000874', 'Andrew',      'Johnson I',    'Andrew Johnson',     'ajohnson',      'AJ'),
  ('001013', 'James',       'Fuller',       'James Fuller',       'jfuller',       'JF'),
  ('000875', 'Rusty L.',    'Carter',       'Rusty Carter',       'rcarter',       'RC'),
  ('000882', 'David M.',    'Chancellor',   'David Chancellor',   'dchancellor',   'DC'),
  ('000856', 'Robert B.',   'DeJulio',      'Robert DeJulio',     'rdejulio',      'RD'),
  ('000984', 'Charles A.',  'Freeman',      'Charles Freeman',    'cfreeman',      'CHF'),
  ('000838', 'Chase',       'Goodell',      'Chase Goodell',      'cgoodell',      'CG'),
  ('000892', 'Lane',        'Goodell',      'Lane Goodell',       'lgoodell',      'LG'),
  ('000868', 'Chris',       'Greathouse',   'Chris Greathouse',   'cgreathouse',   'CGR'),
  ('000873', 'Charles J.',  'Holinsworth',  'Charles Holinsworth','cholinsworth',  'CHH'),
  ('000851', 'Steven L.',   'Humphries',    'Steven Humphries',   'shumphries',    'SH'),
  ('001203', 'Seth A.',     'Johnson',      'Seth Johnson',       'sjohnson',      'SJ'),
  ('000947', 'Benjamin',    'Johnston',     'Benjamin Johnston',  'bjohnston',     'BJ'),
  ('000867', 'Ben',         'Jones',        'Ben Jones',          'bjones',        'BEN'),
  ('000918', 'Matthew',     'Kempton',      'Matthew Kempton',    'mkempton',      'MK'),
  ('000854', 'Edwina A.',   'Lowe',         'Edwina Lowe',        'elowe',         'EL'),
  ('000919', 'Mark',        'Maddux',       'Mark Maddux',        'mmaddux',       'MM'),
  ('000887', 'Kevin D.',    'Mayhew',       'Kevin Mayhew',       'kmayhew',       'KM'),
  ('000897', 'Jeramie A.',  'Moffett',      'Jeramie Moffett',    'jmoffett',      'JM'),
  ('000893', 'Tanner D.',   'Moss',         'Tanner Moss',        'tmoss',         'TM'),
  ('000902', 'Shannon',     'Murphy',       'Shannon Murphy',     'smurphy',       'SM'),
  ('000962', 'Briant C.',   'OConnor',      'Briant O''Connor',   'boconnor',      'BO'),
  ('000858', 'Josh L.',     'Pfister',      'Josh Pfister',       'jpfister',      'JP'),
  ('000862', 'Roland',      'Pruett',       'Roland Pruett',      'rpruett',       'RP'),
  ('000888', 'Kim D.',      'Vandagriff',   'Kim Vandagriff',     'kvandagriff',   'KV'),
  ('000872', 'Tyson J.',    'Cole',         'Tyson Cole',         'tcole',         'TC'),
  ('001128', 'William R.',  'Davis III',    'William Davis',      'wdavis',        'WD'),
  ('000917', 'Jesse',       'Hobbs',        'Jesse Hobbs',        'jhobbs',        'JH'),
  ('000842', 'Dakota J.',   'Kirby',        'Dakota Kirby',       'dkirby',        'DK'),
  ('000889', 'Lucas R.',    'Pierce',       'Lucas Pierce',       'lpierce',       'LP'),
  ('000877', 'Rene',        'Valenzuela',   'Rene Valenzuela',    'rvalenzuela',   'RV'),
  ('000942', 'Randy',       'Wolf',         'Randy Wolf',         'rwolf',         'RW'),
  ('000891', 'Joel',        'Owens Jr.',    'Joel Owens',         'jowens',        'JO'),
  ('000847', 'Coy',         'Belden',       'Coy Belden',         'cbelden',       'COB'),
  ('000899', 'Mike',        'Dunn',         'Mike Dunn',          'mdunn',         'MD'),
  ('000901', 'David L.',    'Hughes',       'David Hughes',       'dhughes',       'DH'),
  ('000894', 'Nicholas D.', 'Hughes',       'Nicholas Hughes',    'nhughes',       'NHU'),
  ('000908', 'Brayden K.',  'Humphries',    'Brayden Humphries',  'bhumphries',    'BH'),
  ('000835', 'Kaci E.',     'Hurd',         'Kaci Hurd',          'khurd',         'KHU'),
  ('000934', 'Michael',     'McCoach',      'Michael McCoach',    'mmccoach',      'MMC'),
  ('000861', 'Mark L.',     'Nash',         'Mark Nash',          'mnash',         'MN'),
  ('000880', 'Charlie',     'Parrett',      'Charlie Parrett',    'cparrett',      'CP'),
  ('000855', 'Shayne',      'Simmons',      'Shayne Simmons',     'ssimmons',      'SS'),
  ('001110', 'Danny R.',    'White',        'Danny White',        'dwhite',        'DAW')
ON CONFLICT (employee_no) DO UPDATE SET
  first_name   = EXCLUDED.first_name,
  last_name    = EXCLUDED.last_name,
  full_name    = EXCLUDED.full_name,
  username     = EXCLUDED.username,
  initials     = EXCLUDED.initials,
  is_active    = true;

CREATE OR REPLACE FUNCTION lookup_employee_by_initials(p_initials TEXT)
RETURNS TABLE (employee_no TEXT, full_name TEXT, initials TEXT)
LANGUAGE sql STABLE AS $$
  SELECT employee_no, full_name, initials
  FROM employees
  WHERE UPPER(initials) = UPPER(p_initials) AND is_active = true
  LIMIT 1;
$$;

CREATE OR REPLACE VIEW employee_roster AS
SELECT
  e.employee_no,
  e.full_name,
  e.username,
  e.initials,
  e.is_active,
  p.role,
  CASE WHEN e.auth_user_id IS NOT NULL THEN 'Active' ELSE 'No Account Yet' END AS account_status,
  au.last_sign_in_at
FROM employees e
LEFT JOIN auth.users au ON au.id = e.auth_user_id
LEFT JOIN profiles p ON p.id = e.auth_user_id
ORDER BY e.last_name, e.first_name;
