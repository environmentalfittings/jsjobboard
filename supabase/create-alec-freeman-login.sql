-- Create Auth login for Alec Freeman only (password: Jsvalves)
-- New blank query → paste → Run

create extension if not exists pgcrypto;

do $$
declare
  v_id uuid := gen_random_uuid();
  v_email text := 'alec.freeman@jsvalve.com';
  v_username text := 'alec.freeman';
  v_name text := 'Alec C. Freeman';
begin
  if exists (select 1 from auth.users where lower(email) = lower(v_email)) then
    select id into v_id from auth.users where lower(email) = lower(v_email) limit 1;
  else
    insert into auth.users (
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
    ) values (
      v_id,
      '00000000-0000-0000-0000-000000000000',
      v_email,
      crypt('Jsvalves', gen_salt('bf')),
      now(),
      now(),
      now(),
      'authenticated',
      'authenticated',
      jsonb_build_object('full_name', v_name, 'username', v_username, 'role', 'technician', 'name', v_name),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '',
      '',
      '',
      ''
    );

    insert into auth.identities (
      provider_id,
      user_id,
      identity_data,
      provider,
      last_sign_in_at,
      created_at,
      updated_at
    ) values (
      v_id::text,
      v_id,
      jsonb_build_object(
        'sub', v_id::text,
        'email', v_email,
        'email_verified', true,
        'phone_verified', false
      ),
      'email',
      now(),
      now(),
      now()
    );
  end if;

  -- Fix technician row (was on @users.jsvalve.local and unlinked)
  update public.technicians
  set
    user_id = v_id,
    login_username = v_username,
    login_email = v_email,
    active = true,
    role = coalesce(role, 'technician')
  where lower(login_username) = v_username
     or lower(name) like 'alec%freeman%';

  update public.employees
  set auth_user_id = v_id
  where lower(username) = v_username
    and auth_user_id is null;

  insert into public.profiles (id, role, full_name)
  values (v_id, 'viewer', v_name)
  on conflict (id) do update
  set full_name = excluded.full_name;
end $$;

-- Verify
select t.login_username, t.name, t.login_email, t.user_id, u.email
from public.technicians t
left join auth.users u on u.id = t.user_id
where lower(t.login_username) = 'alec.freeman';
