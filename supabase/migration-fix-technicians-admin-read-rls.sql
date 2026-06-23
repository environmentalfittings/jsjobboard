-- Admins could insert technicians but not see them: authenticated_read_technicians
-- checked JWT top-level "role" (often "authenticated") before user_metadata/app_metadata.
-- Insert policies already use app_metadata/user_metadata; only SELECT was wrong.

drop policy if exists "authenticated_read_technicians" on public.technicians;

create policy "authenticated_read_technicians"
on public.technicians
for select
to authenticated
using (
  coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role')
    in ('admin', 'manager')
  or user_id = auth.uid()
);
