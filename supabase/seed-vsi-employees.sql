-- Seed VSI employees, shop assignment, and VSI company access.
-- Run the whole script at once in Supabase SQL Editor (do not run only the preview).
-- Roles: Matt Gravil = Admin; everyone else = Supervisor (shop) / manager (company).
-- Safe to re-run (upserts by username).
-- No TEMP tables — Supabase SQL Editor often runs statements in separate sessions.

-- Ensure VSI company exists
insert into public.organizations (name, slug, is_active)
values ('VSI', 'vsi', true)
on conflict (slug) do update
set name = excluded.name,
    is_active = true,
    updated_at = now();

-- Employees roster
with staff (
  employee_no, first_name, last_name, username, initials, shop_role, org_role, job_title, specialty, email
) as (
  values
    ('2001', 'Matt', 'Gravil', 'mgravil', 'MG', 'admin', 'admin', 'Service center Manager', null::text, 'matt.gravil@vsi2.com'),
    ('2002', 'Paul', 'Lafrance', 'plafrance', 'PL', 'supervisor', 'manager', 'UL Tech', 'UL', 'paul.lafrance@vsi2.com'),
    ('2003', 'Micah', 'Adams', 'madams', 'MA', 'supervisor', 'manager', 'UL Tech', 'UL', 'micah.adams@vsi2.com'),
    ('2004', 'Jacob', 'Brady', 'jbrady', 'JB', 'supervisor', 'manager', 'CV Tech', 'CV', 'jacob.brady@vsi2.com'),
    ('2005', 'Darin', 'Briggs', 'dbriggs', 'DB', 'supervisor', 'manager', 'Warehouse', 'Warehouse', 'darin.briggs@vsi2.com'),
    ('2006', 'Zachary', 'Mouse', 'zmouse', 'ZM', 'supervisor', 'manager', 'Warehouse', 'Warehouse', 'zachary.mouse@vsi2.com'),
    ('2007', 'Zachary', 'Brooks', 'zbrooks', 'ZB', 'supervisor', 'manager', 'RV Tech', 'RV', 'zachary.brooks@vsi2.com'),
    ('2008', 'Aidan', 'Chernisky', 'achernisky', 'AC', 'supervisor', 'manager', 'CV Tech', 'CV', 'adian.chernisky@vsi2.com'),
    ('2009', 'Colton', 'Davis', 'cdavis', 'CD', 'supervisor', 'manager', 'RV Tech', 'RV', 'colton.davis@vsi2.com'),
    ('2010', 'Eddy', 'Hall', 'ehall', 'EH', 'supervisor', 'manager', 'RV Tech', 'RV', 'eddy.hall@vsi2.com'),
    ('2011', 'James', 'Wilson', 'jwilson', 'JW', 'supervisor', 'manager', 'RV Tech', 'RV', 'james.wilson@vsi2.com'),
    ('2012', 'Joey', 'Wynn', 'jwynn', 'JY', 'supervisor', 'manager', 'RV Tech', 'RV', 'joey.wynn@vsi2.com'),
    ('2013', 'Brayden', 'Ringer', 'bringer', 'BR', 'supervisor', 'manager', 'RV Tech', 'RV', 'brayden.ringer@vsi2.com'),
    ('2014', 'Mitchell', 'Nelson', 'mnelson', 'MN', 'supervisor', 'manager', 'Technician', null, 'mitchell.nelson@vsi2.com'),
    ('2015', 'Levi', 'Vanaman', 'lvanaman', 'LV', 'supervisor', 'manager', 'Technical Sales Leader', null, 'levi.vanaman@vsi2.com'),
    ('2016', 'Wes', 'Watkins', 'wwatkins', 'WW', 'supervisor', 'manager', 'Service coordinator', null, 'wes.watkins@vsi2.com'),
    ('2017', 'Chris', 'Talley', 'ctalley', 'CT', 'supervisor', 'manager', 'Technical Sales Specialist', null, 'chris.talley@vsi2.com'),
    -- username kjones already used by JS Valve Kristian Jones — use kjonesvsi
    ('2018', 'Kristian', 'Jones', 'kjonesvsi', 'KJ', 'supervisor', 'manager', 'Technical Sales Specialist', null, 'kristian.jones@vsi2.com'),
    ('2019', 'CJ', 'Kerns', 'ckerns', 'CK', 'supervisor', 'manager', 'QC', null, 'cj.kern@vsi2.com')
)
insert into public.employees (
  employee_no, first_name, last_name, full_name, username, initials, company, is_active, is_tester, is_salesman, quality_team_level
)
select
  s.employee_no,
  s.first_name,
  s.last_name,
  s.first_name || ' ' || s.last_name,
  s.username,
  s.initials,
  'VSI',
  true,
  false,
  s.job_title ilike '%sales%',
  'none'
from staff s
on conflict (username) do update
set
  employee_no = excluded.employee_no,
  first_name = excluded.first_name,
  last_name = excluded.last_name,
  full_name = excluded.full_name,
  initials = excluded.initials,
  company = excluded.company,
  is_active = true,
  is_salesman = excluded.is_salesman,
  quality_team_level = excluded.quality_team_level;

-- Shop assignment (App role). supervisor is a valid technicians.role value.
with staff (
  employee_no, first_name, last_name, username, initials, shop_role, org_role, job_title, specialty, email
) as (
  values
    ('2001', 'Matt', 'Gravil', 'mgravil', 'MG', 'admin', 'admin', 'Service center Manager', null::text, 'matt.gravil@vsi2.com'),
    ('2002', 'Paul', 'Lafrance', 'plafrance', 'PL', 'supervisor', 'manager', 'UL Tech', 'UL', 'paul.lafrance@vsi2.com'),
    ('2003', 'Micah', 'Adams', 'madams', 'MA', 'supervisor', 'manager', 'UL Tech', 'UL', 'micah.adams@vsi2.com'),
    ('2004', 'Jacob', 'Brady', 'jbrady', 'JB', 'supervisor', 'manager', 'CV Tech', 'CV', 'jacob.brady@vsi2.com'),
    ('2005', 'Darin', 'Briggs', 'dbriggs', 'DB', 'supervisor', 'manager', 'Warehouse', 'Warehouse', 'darin.briggs@vsi2.com'),
    ('2006', 'Zachary', 'Mouse', 'zmouse', 'ZM', 'supervisor', 'manager', 'Warehouse', 'Warehouse', 'zachary.mouse@vsi2.com'),
    ('2007', 'Zachary', 'Brooks', 'zbrooks', 'ZB', 'supervisor', 'manager', 'RV Tech', 'RV', 'zachary.brooks@vsi2.com'),
    ('2008', 'Aidan', 'Chernisky', 'achernisky', 'AC', 'supervisor', 'manager', 'CV Tech', 'CV', 'adian.chernisky@vsi2.com'),
    ('2009', 'Colton', 'Davis', 'cdavis', 'CD', 'supervisor', 'manager', 'RV Tech', 'RV', 'colton.davis@vsi2.com'),
    ('2010', 'Eddy', 'Hall', 'ehall', 'EH', 'supervisor', 'manager', 'RV Tech', 'RV', 'eddy.hall@vsi2.com'),
    ('2011', 'James', 'Wilson', 'jwilson', 'JW', 'supervisor', 'manager', 'RV Tech', 'RV', 'james.wilson@vsi2.com'),
    ('2012', 'Joey', 'Wynn', 'jwynn', 'JY', 'supervisor', 'manager', 'RV Tech', 'RV', 'joey.wynn@vsi2.com'),
    ('2013', 'Brayden', 'Ringer', 'bringer', 'BR', 'supervisor', 'manager', 'RV Tech', 'RV', 'brayden.ringer@vsi2.com'),
    ('2014', 'Mitchell', 'Nelson', 'mnelson', 'MN', 'supervisor', 'manager', 'Technician', null, 'mitchell.nelson@vsi2.com'),
    ('2015', 'Levi', 'Vanaman', 'lvanaman', 'LV', 'supervisor', 'manager', 'Technical Sales Leader', null, 'levi.vanaman@vsi2.com'),
    ('2016', 'Wes', 'Watkins', 'wwatkins', 'WW', 'supervisor', 'manager', 'Service coordinator', null, 'wes.watkins@vsi2.com'),
    ('2017', 'Chris', 'Talley', 'ctalley', 'CT', 'supervisor', 'manager', 'Technical Sales Specialist', null, 'chris.talley@vsi2.com'),
    ('2018', 'Kristian', 'Jones', 'kjonesvsi', 'KJ', 'supervisor', 'manager', 'Technical Sales Specialist', null, 'kristian.jones@vsi2.com'),
    ('2019', 'CJ', 'Kerns', 'ckerns', 'CK', 'supervisor', 'manager', 'QC', null, 'cj.kern@vsi2.com')
)
insert into public.technicians (
  name, employee_id, login_username, role, active, work_cell_specialties, group_team, login_email
)
select
  e.full_name,
  e.employee_no,
  e.username,
  s.shop_role,
  true,
  case when s.specialty is null then '{}'::text[] else array[s.specialty] end,
  coalesce(s.specialty, 'VSI'),
  s.email
from staff s
join public.employees e on e.username = s.username
where not exists (
  select 1 from public.technicians t
  where lower(trim(coalesce(t.login_username, ''))) = lower(s.username)
);

with staff (
  employee_no, first_name, last_name, username, initials, shop_role, org_role, job_title, specialty, email
) as (
  values
    ('2001', 'Matt', 'Gravil', 'mgravil', 'MG', 'admin', 'admin', 'Service center Manager', null::text, 'matt.gravil@vsi2.com'),
    ('2002', 'Paul', 'Lafrance', 'plafrance', 'PL', 'supervisor', 'manager', 'UL Tech', 'UL', 'paul.lafrance@vsi2.com'),
    ('2003', 'Micah', 'Adams', 'madams', 'MA', 'supervisor', 'manager', 'UL Tech', 'UL', 'micah.adams@vsi2.com'),
    ('2004', 'Jacob', 'Brady', 'jbrady', 'JB', 'supervisor', 'manager', 'CV Tech', 'CV', 'jacob.brady@vsi2.com'),
    ('2005', 'Darin', 'Briggs', 'dbriggs', 'DB', 'supervisor', 'manager', 'Warehouse', 'Warehouse', 'darin.briggs@vsi2.com'),
    ('2006', 'Zachary', 'Mouse', 'zmouse', 'ZM', 'supervisor', 'manager', 'Warehouse', 'Warehouse', 'zachary.mouse@vsi2.com'),
    ('2007', 'Zachary', 'Brooks', 'zbrooks', 'ZB', 'supervisor', 'manager', 'RV Tech', 'RV', 'zachary.brooks@vsi2.com'),
    ('2008', 'Aidan', 'Chernisky', 'achernisky', 'AC', 'supervisor', 'manager', 'CV Tech', 'CV', 'adian.chernisky@vsi2.com'),
    ('2009', 'Colton', 'Davis', 'cdavis', 'CD', 'supervisor', 'manager', 'RV Tech', 'RV', 'colton.davis@vsi2.com'),
    ('2010', 'Eddy', 'Hall', 'ehall', 'EH', 'supervisor', 'manager', 'RV Tech', 'RV', 'eddy.hall@vsi2.com'),
    ('2011', 'James', 'Wilson', 'jwilson', 'JW', 'supervisor', 'manager', 'RV Tech', 'RV', 'james.wilson@vsi2.com'),
    ('2012', 'Joey', 'Wynn', 'jwynn', 'JY', 'supervisor', 'manager', 'RV Tech', 'RV', 'joey.wynn@vsi2.com'),
    ('2013', 'Brayden', 'Ringer', 'bringer', 'BR', 'supervisor', 'manager', 'RV Tech', 'RV', 'brayden.ringer@vsi2.com'),
    ('2014', 'Mitchell', 'Nelson', 'mnelson', 'MN', 'supervisor', 'manager', 'Technician', null, 'mitchell.nelson@vsi2.com'),
    ('2015', 'Levi', 'Vanaman', 'lvanaman', 'LV', 'supervisor', 'manager', 'Technical Sales Leader', null, 'levi.vanaman@vsi2.com'),
    ('2016', 'Wes', 'Watkins', 'wwatkins', 'WW', 'supervisor', 'manager', 'Service coordinator', null, 'wes.watkins@vsi2.com'),
    ('2017', 'Chris', 'Talley', 'ctalley', 'CT', 'supervisor', 'manager', 'Technical Sales Specialist', null, 'chris.talley@vsi2.com'),
    ('2018', 'Kristian', 'Jones', 'kjonesvsi', 'KJ', 'supervisor', 'manager', 'Technical Sales Specialist', null, 'kristian.jones@vsi2.com'),
    ('2019', 'CJ', 'Kerns', 'ckerns', 'CK', 'supervisor', 'manager', 'QC', null, 'cj.kern@vsi2.com')
)
update public.technicians t
set
  name = e.full_name,
  employee_id = e.employee_no,
  role = s.shop_role,
  active = true,
  work_cell_specialties = case when s.specialty is null then '{}'::text[] else array[s.specialty] end,
  group_team = coalesce(s.specialty, 'VSI'),
  login_email = s.email,
  updated_at = now()
from staff s
join public.employees e on e.username = s.username
where lower(trim(coalesce(t.login_username, ''))) = lower(s.username);

-- VSI company access (org role: admin for Matt, manager for Supervisors)
with staff (
  employee_no, first_name, last_name, username, initials, shop_role, org_role, job_title, specialty, email
) as (
  values
    ('2001', 'Matt', 'Gravil', 'mgravil', 'MG', 'admin', 'admin', 'Service center Manager', null::text, 'matt.gravil@vsi2.com'),
    ('2002', 'Paul', 'Lafrance', 'plafrance', 'PL', 'supervisor', 'manager', 'UL Tech', 'UL', 'paul.lafrance@vsi2.com'),
    ('2003', 'Micah', 'Adams', 'madams', 'MA', 'supervisor', 'manager', 'UL Tech', 'UL', 'micah.adams@vsi2.com'),
    ('2004', 'Jacob', 'Brady', 'jbrady', 'JB', 'supervisor', 'manager', 'CV Tech', 'CV', 'jacob.brady@vsi2.com'),
    ('2005', 'Darin', 'Briggs', 'dbriggs', 'DB', 'supervisor', 'manager', 'Warehouse', 'Warehouse', 'darin.briggs@vsi2.com'),
    ('2006', 'Zachary', 'Mouse', 'zmouse', 'ZM', 'supervisor', 'manager', 'Warehouse', 'Warehouse', 'zachary.mouse@vsi2.com'),
    ('2007', 'Zachary', 'Brooks', 'zbrooks', 'ZB', 'supervisor', 'manager', 'RV Tech', 'RV', 'zachary.brooks@vsi2.com'),
    ('2008', 'Aidan', 'Chernisky', 'achernisky', 'AC', 'supervisor', 'manager', 'CV Tech', 'CV', 'adian.chernisky@vsi2.com'),
    ('2009', 'Colton', 'Davis', 'cdavis', 'CD', 'supervisor', 'manager', 'RV Tech', 'RV', 'colton.davis@vsi2.com'),
    ('2010', 'Eddy', 'Hall', 'ehall', 'EH', 'supervisor', 'manager', 'RV Tech', 'RV', 'eddy.hall@vsi2.com'),
    ('2011', 'James', 'Wilson', 'jwilson', 'JW', 'supervisor', 'manager', 'RV Tech', 'RV', 'james.wilson@vsi2.com'),
    ('2012', 'Joey', 'Wynn', 'jwynn', 'JY', 'supervisor', 'manager', 'RV Tech', 'RV', 'joey.wynn@vsi2.com'),
    ('2013', 'Brayden', 'Ringer', 'bringer', 'BR', 'supervisor', 'manager', 'RV Tech', 'RV', 'brayden.ringer@vsi2.com'),
    ('2014', 'Mitchell', 'Nelson', 'mnelson', 'MN', 'supervisor', 'manager', 'Technician', null, 'mitchell.nelson@vsi2.com'),
    ('2015', 'Levi', 'Vanaman', 'lvanaman', 'LV', 'supervisor', 'manager', 'Technical Sales Leader', null, 'levi.vanaman@vsi2.com'),
    ('2016', 'Wes', 'Watkins', 'wwatkins', 'WW', 'supervisor', 'manager', 'Service coordinator', null, 'wes.watkins@vsi2.com'),
    ('2017', 'Chris', 'Talley', 'ctalley', 'CT', 'supervisor', 'manager', 'Technical Sales Specialist', null, 'chris.talley@vsi2.com'),
    ('2018', 'Kristian', 'Jones', 'kjonesvsi', 'KJ', 'supervisor', 'manager', 'Technical Sales Specialist', null, 'kristian.jones@vsi2.com'),
    ('2019', 'CJ', 'Kerns', 'ckerns', 'CK', 'supervisor', 'manager', 'QC', null, 'cj.kern@vsi2.com')
)
insert into public.organization_members (organization_id, user_id, employee_id, role, can_access)
select
  o.id,
  e.auth_user_id,
  e.id,
  s.org_role,
  true
from staff s
join public.employees e on e.username = s.username
join public.organizations o on o.slug = 'vsi'
where not exists (
  select 1
  from public.organization_members m
  where m.organization_id = o.id
    and m.employee_id = e.id
);

with staff (
  employee_no, first_name, last_name, username, initials, shop_role, org_role, job_title, specialty, email
) as (
  values
    ('2001', 'Matt', 'Gravil', 'mgravil', 'MG', 'admin', 'admin', 'Service center Manager', null::text, 'matt.gravil@vsi2.com'),
    ('2002', 'Paul', 'Lafrance', 'plafrance', 'PL', 'supervisor', 'manager', 'UL Tech', 'UL', 'paul.lafrance@vsi2.com'),
    ('2003', 'Micah', 'Adams', 'madams', 'MA', 'supervisor', 'manager', 'UL Tech', 'UL', 'micah.adams@vsi2.com'),
    ('2004', 'Jacob', 'Brady', 'jbrady', 'JB', 'supervisor', 'manager', 'CV Tech', 'CV', 'jacob.brady@vsi2.com'),
    ('2005', 'Darin', 'Briggs', 'dbriggs', 'DB', 'supervisor', 'manager', 'Warehouse', 'Warehouse', 'darin.briggs@vsi2.com'),
    ('2006', 'Zachary', 'Mouse', 'zmouse', 'ZM', 'supervisor', 'manager', 'Warehouse', 'Warehouse', 'zachary.mouse@vsi2.com'),
    ('2007', 'Zachary', 'Brooks', 'zbrooks', 'ZB', 'supervisor', 'manager', 'RV Tech', 'RV', 'zachary.brooks@vsi2.com'),
    ('2008', 'Aidan', 'Chernisky', 'achernisky', 'AC', 'supervisor', 'manager', 'CV Tech', 'CV', 'adian.chernisky@vsi2.com'),
    ('2009', 'Colton', 'Davis', 'cdavis', 'CD', 'supervisor', 'manager', 'RV Tech', 'RV', 'colton.davis@vsi2.com'),
    ('2010', 'Eddy', 'Hall', 'ehall', 'EH', 'supervisor', 'manager', 'RV Tech', 'RV', 'eddy.hall@vsi2.com'),
    ('2011', 'James', 'Wilson', 'jwilson', 'JW', 'supervisor', 'manager', 'RV Tech', 'RV', 'james.wilson@vsi2.com'),
    ('2012', 'Joey', 'Wynn', 'jwynn', 'JY', 'supervisor', 'manager', 'RV Tech', 'RV', 'joey.wynn@vsi2.com'),
    ('2013', 'Brayden', 'Ringer', 'bringer', 'BR', 'supervisor', 'manager', 'RV Tech', 'RV', 'brayden.ringer@vsi2.com'),
    ('2014', 'Mitchell', 'Nelson', 'mnelson', 'MN', 'supervisor', 'manager', 'Technician', null, 'mitchell.nelson@vsi2.com'),
    ('2015', 'Levi', 'Vanaman', 'lvanaman', 'LV', 'supervisor', 'manager', 'Technical Sales Leader', null, 'levi.vanaman@vsi2.com'),
    ('2016', 'Wes', 'Watkins', 'wwatkins', 'WW', 'supervisor', 'manager', 'Service coordinator', null, 'wes.watkins@vsi2.com'),
    ('2017', 'Chris', 'Talley', 'ctalley', 'CT', 'supervisor', 'manager', 'Technical Sales Specialist', null, 'chris.talley@vsi2.com'),
    ('2018', 'Kristian', 'Jones', 'kjonesvsi', 'KJ', 'supervisor', 'manager', 'Technical Sales Specialist', null, 'kristian.jones@vsi2.com'),
    ('2019', 'CJ', 'Kerns', 'ckerns', 'CK', 'supervisor', 'manager', 'QC', null, 'cj.kern@vsi2.com')
)
update public.organization_members m
set
  role = s.org_role,
  can_access = true,
  user_id = coalesce(m.user_id, e.auth_user_id),
  updated_at = now()
from staff s
join public.employees e on e.username = s.username
join public.organizations o on o.slug = 'vsi'
where m.organization_id = o.id
  and m.employee_id = e.id;

-- Verify (run alone anytime — does not depend on temp tables)
select
  e.employee_no,
  e.full_name,
  e.username,
  t.role as shop_role,
  m.role as company_role,
  m.can_access
from public.employees e
left join public.technicians t
  on lower(trim(coalesce(t.login_username, ''))) = lower(e.username)
left join public.organizations o on o.slug = 'vsi'
left join public.organization_members m
  on m.employee_id = e.id and m.organization_id = o.id
where e.company = 'VSI'
  and e.employee_no between '2001' and '2019'
order by e.employee_no;
