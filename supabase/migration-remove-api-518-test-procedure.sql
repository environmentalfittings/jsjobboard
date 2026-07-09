-- Remove erroneous "API 518 Test" label; migrate historical references to "API 598 Test".

insert into public.lookup_values (category, value, sort_order)
values ('test_procedure', 'API 598 Test', 0)
on conflict (category, value) do nothing;

-- Rewrite saved test log requirement checkboxes.
update public.test_logs
set testing_details = jsonb_set(
  testing_details,
  '{testProcedures}',
  coalesce(
    (
      select jsonb_agg(to_jsonb(
        case when entry = 'API 518 Test' then 'API 598 Test' else entry end
      ))
      from jsonb_array_elements_text(testing_details->'testProcedures') as entry
    ),
    '[]'::jsonb
  )
)
where testing_details ? 'testProcedures'
  and testing_details->'testProcedures'::text like '%API 518 Test%';

delete from public.lookup_values
where category = 'test_procedure'
  and value = 'API 518 Test';
