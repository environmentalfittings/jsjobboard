-- New Auth users should default to viewer, not admin.
-- Shop Admin is assigned on the Technicians page (and synced to profiles).

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, full_name)
  values (
    new.id,
    case
      when lower(coalesce(new.raw_user_meta_data->>'role', '')) = 'admin' then 'admin'
      else 'viewer'
    end,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      new.email
    )
  )
  on conflict (id) do nothing;
  return new;
exception
  when others then
    raise warning 'handle_new_user skipped profile insert: %', sqlerrm;
    return new;
end;
$$;
