-- Demand Profile report aggregation (job-count metric).
-- Depends on: migration-valves-date-received.sql, migration-customer-aliases.sql
-- Company scope: pass include/exclude valve row ids from the app (same rules as other reports).
-- Run once in the Supabase SQL Editor.

begin;

create or replace function public.demand_profile_report(
  p_start date,
  p_end date,
  p_period text default 'quarter',
  p_type_dimension text default 'valve_type',
  p_job_types text[] default null,
  p_type_keys text[] default null,
  p_customer_keys text[] default null,
  p_workflow_key text default 'js-valve',
  p_include_valve_ids bigint[] default null,
  p_exclude_valve_ids bigint[] default null
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_min_ok date := date '2022-01-01';
  v_max_ok date := (current_date + interval '1 year')::date;
  v_result jsonb;
begin
  if p_start is null or p_end is null or p_start > p_end then
    raise exception 'invalid date range';
  end if;

  with scoped as (
    select
      v.id,
      v.valve_id,
      v.customer,
      v.valve_type,
      v.job_type,
      v.size,
      v.pressure_class,
      v.due_date,
      v.date_received,
      coalesce(v.date_received, v.due_date) as demand_date
    from public.valves v
    where
      case
        when lower(coalesce(p_workflow_key, 'js-valve')) = 'vsi' then
          p_include_valve_ids is not null
          and cardinality(p_include_valve_ids) > 0
          and v.id = any (p_include_valve_ids)
        else
          p_exclude_valve_ids is null
          or cardinality(p_exclude_valve_ids) = 0
          or not (v.id = any (p_exclude_valve_ids))
      end
  ),
  classified as (
    select
      s.*,
      case
        when s.demand_date is null then 'null'
        when s.demand_date < v_min_ok or s.demand_date > v_max_ok then 'bad'
        else 'ok'
      end as date_quality
    from scoped s
  ),
  resolved as (
    select
      c.*,
      coalesce(
        cust.name,
        nullif(btrim(c.customer), ''),
        'Unassigned'
      ) as customer_label,
      lower(coalesce(cust.name, nullif(btrim(c.customer), ''), 'unassigned')) as customer_key,
      case lower(coalesce(p_type_dimension, 'valve_type'))
        when 'job_type' then coalesce(nullif(btrim(c.job_type), ''), 'Unspecified')
        when 'size' then coalesce(nullif(btrim(c.size), ''), 'Unspecified')
        when 'pressure_class' then coalesce(nullif(btrim(c.pressure_class), ''), 'Unspecified')
        else coalesce(nullif(btrim(c.valve_type), ''), 'Unspecified')
      end as type_label
    from classified c
    left join public.customer_aliases ca
      on ca.alias_text = public.normalize_customer_alias_text(c.customer)
    left join public.customers cust
      on cust.id = ca.customer_id
  ),
  stats as (
    select
      count(*)::int as scoped_total,
      count(*) filter (where date_quality = 'null')::int as excluded_null,
      count(*) filter (where date_quality = 'bad')::int as excluded_bad
    from resolved
  ),
  stamped as (
    select
      r.*,
      case lower(coalesce(p_period, 'quarter'))
        when 'month' then to_char(r.demand_date, 'YYYY-MM')
        when 'year' then to_char(r.demand_date, 'YYYY')
        else to_char(r.demand_date, 'YYYY') || '-Q' || to_char(r.demand_date, 'Q')
      end as period_key,
      extract(year from r.demand_date)::int as demand_year
    from resolved r
    where r.date_quality = 'ok'
      and r.demand_date >= p_start
      and r.demand_date <= p_end
      and (
        p_job_types is null
        or cardinality(p_job_types) = 0
        or coalesce(nullif(btrim(r.job_type), ''), 'Valve Repair') = any (p_job_types)
      )
      and (
        p_type_keys is null
        or cardinality(p_type_keys) = 0
        or r.type_label = any (p_type_keys)
      )
      and (
        p_customer_keys is null
        or cardinality(p_customer_keys) = 0
        or r.customer_key = any (p_customer_keys)
      )
  ),
  meta as (
    select
      (select scoped_total from stats) as scoped_total,
      (select excluded_null from stats) as excluded_null,
      (select excluded_bad from stats) as excluded_bad,
      (select count(*) from stamped)::int as total_jobs,
      (
        select coalesce(
          round(
            100.0 * count(*) filter (where type_label = 'Unspecified') / nullif(count(*), 0),
            1
          ),
          0
        )
        from stamped
      ) as unspecified_type_pct,
      coalesce(
        (select jsonb_agg(y order by y) from (select distinct demand_year::text as y from stamped) years),
        '[]'::jsonb
      ) as years
  ),
  type_period as (
    select type_label, period_key, count(*)::int as job_count
    from stamped
    group by 1, 2
  ),
  type_year as (
    select type_label, demand_year::text as year_key, count(*)::int as job_count
    from stamped
    group by 1, 2
  ),
  type_totals as (
    select
      type_label,
      count(*)::int as total,
      min(demand_date) as first_job_date,
      max(demand_date) as last_job_date
    from stamped
    group by 1
  ),
  type_ranked as (
    select
      t.*,
      round(100.0 * t.total / nullif((select total_jobs from meta), 0), 2) as pct_of_total,
      case
        when round(100.0 * t.total / nullif((select total_jobs from meta), 0), 2) < 3
          and t.type_label <> 'Unspecified'
        then true
        else false
      end as roll_into_other
    from type_totals t
  ),
  type_display as (
    select
      case when roll_into_other then 'Other' else type_label end as type_label,
      sum(total)::int as total,
      min(first_job_date) as first_job_date,
      max(last_job_date) as last_job_date
    from type_ranked
    group by 1
  ),
  type_year_display as (
    select
      case when r.roll_into_other then 'Other' else ty.type_label end as type_label,
      ty.year_key,
      sum(ty.job_count)::int as job_count
    from type_year ty
    join type_ranked r on r.type_label = ty.type_label
    group by 1, 2
  ),
  type_period_display as (
    select
      case when r.roll_into_other then 'Other' else tp.type_label end as type_label,
      tp.period_key,
      sum(tp.job_count)::int as job_count
    from type_period tp
    join type_ranked r on r.type_label = tp.type_label
    group by 1, 2
  ),
  type_summary as (
    select
      d.type_label,
      d.total,
      round(100.0 * d.total / nullif((select total_jobs from meta), 0), 2) as pct_of_total,
      coalesce(
        (
          select jsonb_object_agg(ty.year_key, ty.job_count)
          from type_year_display ty
          where ty.type_label = d.type_label
        ),
        '{}'::jsonb
      ) as year_counts,
      d.last_job_date
    from type_display d
  ),
  customer_totals as (
    select
      customer_key,
      max(customer_label) as customer_label,
      count(*)::int as total,
      count(*)::int as job_count,
      min(demand_date) as first_job_date,
      max(demand_date) as last_job_date
    from stamped
    group by 1
  ),
  customer_year as (
    select customer_key, demand_year::text as year_key, count(*)::int as job_count
    from stamped
    group by 1, 2
  ),
  customer_summary as (
    select
      c.customer_key,
      c.customer_label,
      c.total,
      round(100.0 * c.total / nullif((select total_jobs from meta), 0), 2) as pct_of_total,
      c.job_count,
      c.first_job_date,
      c.last_job_date,
      coalesce(
        (
          select jsonb_object_agg(cy.year_key, cy.job_count)
          from customer_year cy
          where cy.customer_key = c.customer_key
        ),
        '{}'::jsonb
      ) as year_counts,
      (c.first_job_date >= p_start and c.first_job_date <= p_end) as is_new_in_range
    from customer_totals c
  ),
  customer_ranked as (
    select
      cs.*,
      row_number() over (order by cs.total desc, cs.customer_label) as rank
    from customer_summary cs
  ),
  top_customers as (
    select * from customer_ranked where rank <= 10
  ),
  customer_period as (
    select
      case
        when exists (select 1 from top_customers t where t.customer_key = s.customer_key)
          then s.customer_key
        else '__other__'
      end as customer_key,
      case
        when exists (select 1 from top_customers t where t.customer_key = s.customer_key)
          then s.customer_label
        else 'All other'
      end as customer_label,
      s.period_key,
      count(*)::int as job_count
    from stamped s
    group by 1, 2, 3
  ),
  matrix_customers as (
    select customer_key, customer_label, total, rank
    from customer_ranked
    where rank <= 15
  ),
  matrix_types as (
    select type_label, total
    from type_display
    order by case when type_label = 'Other' then 1 else 0 end, total desc, type_label
    limit 12
  ),
  matrix_cells as (
    select
      s.customer_key,
      case
        when exists (select 1 from matrix_types mt where mt.type_label = s.type_label) then s.type_label
        else 'Other'
      end as type_label,
      count(*)::int as job_count
    from stamped s
    where exists (select 1 from matrix_customers mc where mc.customer_key = s.customer_key)
    group by 1, 2
  )
  select jsonb_build_object(
    'meta', jsonb_build_object(
      'start', p_start,
      'end', p_end,
      'period', lower(coalesce(p_period, 'quarter')),
      'typeDimension', lower(coalesce(p_type_dimension, 'valve_type')),
      'metric', 'job_count',
      'scopedTotal', (select scoped_total from meta),
      'excludedNull', (select excluded_null from meta),
      'excludedBad', (select excluded_bad from meta),
      'totalJobs', (select total_jobs from meta),
      'unspecifiedTypePct', (select unspecified_type_pct from meta),
      'years', (select years from meta),
      'footnote', 'Historical demand is based on due date, which typically lags receipt by a few weeks.'
    ),
    'typePeriods', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object('type', type_label, 'period', period_key, 'jobCount', job_count)
          order by period_key, type_label
        )
        from type_period_display
      ),
      '[]'::jsonb
    ),
    'typeSummary', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'type', type_label,
            'total', total,
            'pctOfTotal', pct_of_total,
            'yearCounts', year_counts,
            'lastJobDate', last_job_date
          )
          order by case when type_label = 'Other' then 1 else 0 end, total desc, type_label
        )
        from type_summary
      ),
      '[]'::jsonb
    ),
    'customerSummary', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'key', customer_key,
            'customer', customer_label,
            'total', total,
            'pctOfTotal', pct_of_total,
            'jobCount', job_count,
            'yearCounts', year_counts,
            'firstJobDate', first_job_date,
            'lastJobDate', last_job_date,
            'isNewInRange', is_new_in_range,
            'rank', rank
          )
          order by rank
        )
        from customer_ranked
      ),
      '[]'::jsonb
    ),
    'customerPeriods', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'key', customer_key,
            'customer', customer_label,
            'period', period_key,
            'jobCount', job_count
          )
          order by period_key, customer_label
        )
        from customer_period
      ),
      '[]'::jsonb
    ),
    'matrix', jsonb_build_object(
      'customers', coalesce(
        (
          select jsonb_agg(
            jsonb_build_object('key', customer_key, 'customer', customer_label, 'total', total)
            order by rank
          )
          from matrix_customers
        ),
        '[]'::jsonb
      ),
      'types', coalesce(
        (
          select jsonb_agg(type_label order by case when type_label = 'Other' then 1 else 0 end, total desc, type_label)
          from matrix_types
        ),
        '[]'::jsonb
      ),
      'cells', coalesce(
        (
          select jsonb_agg(
            jsonb_build_object('customerKey', customer_key, 'type', type_label, 'jobCount', job_count)
          )
          from matrix_cells
        ),
        '[]'::jsonb
      )
    ),
    'filterOptions', jsonb_build_object(
      'types', coalesce(
        (select jsonb_agg(type_label order by type_label) from (select distinct type_label from stamped) x),
        '[]'::jsonb
      ),
      'customers', coalesce(
        (
          select jsonb_agg(jsonb_build_object('key', customer_key, 'label', customer_label) order by customer_label)
          from (select distinct customer_key, customer_label from stamped) x
        ),
        '[]'::jsonb
      ),
      'jobTypes', coalesce(
        (
          select jsonb_agg(jt order by jt)
          from (
            select distinct coalesce(nullif(btrim(job_type), ''), 'Valve Repair') as jt
            from resolved
            where date_quality = 'ok'
          ) x
        ),
        '[]'::jsonb
      )
    )
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.demand_profile_report(
  date, date, text, text, text[], text[], text[], text, bigint[], bigint[]
) from public;
grant execute on function public.demand_profile_report(
  date, date, text, text, text[], text[], text[], text, bigint[], bigint[]
) to authenticated, anon;

create or replace function public.demand_profile_jobs(
  p_start date,
  p_end date,
  p_type_dimension text default 'valve_type',
  p_job_types text[] default null,
  p_customer_key text default null,
  p_type_label text default null,
  p_workflow_key text default 'js-valve',
  p_include_valve_ids bigint[] default null,
  p_exclude_valve_ids bigint[] default null,
  p_limit int default 500
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_min_ok date := date '2022-01-01';
  v_max_ok date := (current_date + interval '1 year')::date;
begin
  return coalesce(
    (
      with scoped as (
        select
          v.id,
          v.valve_id,
          v.customer,
          v.valve_type,
          v.job_type,
          v.size,
          v.pressure_class,
          v.status,
          v.due_date,
          v.date_received,
          coalesce(v.date_received, v.due_date) as demand_date
        from public.valves v
        where
          case
            when lower(coalesce(p_workflow_key, 'js-valve')) = 'vsi' then
              p_include_valve_ids is not null
              and cardinality(p_include_valve_ids) > 0
              and v.id = any (p_include_valve_ids)
            else
              p_exclude_valve_ids is null
              or cardinality(p_exclude_valve_ids) = 0
              or not (v.id = any (p_exclude_valve_ids))
          end
      ),
      resolved as (
        select
          s.*,
          coalesce(cust.name, nullif(btrim(s.customer), ''), 'Unassigned') as customer_label,
          lower(coalesce(cust.name, nullif(btrim(s.customer), ''), 'unassigned')) as customer_key,
          case lower(coalesce(p_type_dimension, 'valve_type'))
            when 'job_type' then coalesce(nullif(btrim(s.job_type), ''), 'Unspecified')
            when 'size' then coalesce(nullif(btrim(s.size), ''), 'Unspecified')
            when 'pressure_class' then coalesce(nullif(btrim(s.pressure_class), ''), 'Unspecified')
            else coalesce(nullif(btrim(s.valve_type), ''), 'Unspecified')
          end as type_label
        from scoped s
        left join public.customer_aliases ca
          on ca.alias_text = public.normalize_customer_alias_text(s.customer)
        left join public.customers cust
          on cust.id = ca.customer_id
      ),
      filtered as (
        select *
        from resolved
        where demand_date is not null
          and demand_date >= v_min_ok
          and demand_date <= v_max_ok
          and demand_date >= p_start
          and demand_date <= p_end
          and (
            p_job_types is null
            or cardinality(p_job_types) = 0
            or coalesce(nullif(btrim(job_type), ''), 'Valve Repair') = any (p_job_types)
          )
          and (p_customer_key is null or customer_key = p_customer_key)
          and (p_type_label is null or type_label = p_type_label)
        order by demand_date desc, valve_id
        limit greatest(1, least(coalesce(p_limit, 500), 2000))
      )
      select jsonb_agg(
        jsonb_build_object(
          'id', id,
          'valveId', valve_id,
          'customer', customer_label,
          'type', type_label,
          'jobType', coalesce(nullif(btrim(job_type), ''), 'Valve Repair'),
          'status', status,
          'demandDate', demand_date,
          'dueDate', due_date,
          'dateReceived', date_received
        )
      )
      from filtered
    ),
    '[]'::jsonb
  );
end;
$$;

revoke all on function public.demand_profile_jobs(
  date, date, text, text[], text, text, text, bigint[], bigint[], int
) from public;
grant execute on function public.demand_profile_jobs(
  date, date, text, text[], text, text, text, bigint[], bigint[], int
) to authenticated, anon;

-- Unmatched / near-duplicate customer names for the admin mapping screen.
-- Create a pg_trgm-free version first so install succeeds even when similarity()
-- is unavailable. Optionally upgrade to fuzzy matching if the extension works.
create or replace function public.customer_alias_candidates()
returns jsonb
language sql
stable
as $$
  with names as (
    select
      nullif(btrim(customer), '') as raw_name,
      public.normalize_customer_alias_text(customer) as norm,
      count(*)::int as job_count
    from public.valves
    where nullif(btrim(customer), '') is not null
    group by 1, 2
  ),
  unmatched as (
    select n.raw_name, n.norm, n.job_count
    from names n
    left join public.customer_aliases ca on ca.alias_text = n.norm
    where ca.id is null
  ),
  near as (
    select
      a.raw_name as name_a,
      a.job_count as jobs_a,
      b.raw_name as name_b,
      b.job_count as jobs_b,
      a.norm as norm_a,
      b.norm as norm_b
    from unmatched a
    join unmatched b
      on a.norm < b.norm
     and (
       replace(a.norm, '-', ' ') = replace(b.norm, '-', ' ')
       or replace(a.norm, '  ', ' ') = replace(b.norm, '  ', ' ')
     )
  )
  select jsonb_build_object(
    'unmatched', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object('name', raw_name, 'normalized', norm, 'jobCount', job_count)
          order by job_count desc, raw_name
        )
        from unmatched
      ),
      '[]'::jsonb
    ),
    'nearDuplicates', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'nameA', name_a,
            'jobsA', jobs_a,
            'nameB', name_b,
            'jobsB', jobs_b,
            'normalizedA', norm_a,
            'normalizedB', norm_b
          )
          order by greatest(jobs_a, jobs_b) desc, name_a, name_b
        )
        from near
      ),
      '[]'::jsonb
    ),
    'canonicalCustomers', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object('id', id, 'name', name)
          order by name
        )
        from public.customers
      ),
      '[]'::jsonb
    )
  );
$$;

-- Optional fuzzy near-duplicates when pg_trgm is available.
do $$
begin
  begin
    create extension if not exists pg_trgm;
  exception
    when others then
      null;
  end;

  begin
    perform similarity('a', 'b');
  exception
    when undefined_function then
      return;
  end;

  execute $fn$
    create or replace function public.customer_alias_candidates()
    returns jsonb
    language sql
    stable
    as $body$
      with names as (
        select
          nullif(btrim(customer), '') as raw_name,
          public.normalize_customer_alias_text(customer) as norm,
          count(*)::int as job_count
        from public.valves
        where nullif(btrim(customer), '') is not null
        group by 1, 2
      ),
      unmatched as (
        select n.raw_name, n.norm, n.job_count
        from names n
        left join public.customer_aliases ca on ca.alias_text = n.norm
        where ca.id is null
      ),
      near as (
        select
          a.raw_name as name_a,
          a.job_count as jobs_a,
          b.raw_name as name_b,
          b.job_count as jobs_b,
          a.norm as norm_a,
          b.norm as norm_b
        from unmatched a
        join unmatched b
          on a.norm < b.norm
         and (
           replace(a.norm, '-', ' ') = replace(b.norm, '-', ' ')
           or replace(a.norm, '  ', ' ') = replace(b.norm, '  ', ' ')
           or similarity(a.norm, b.norm) >= 0.55
         )
      )
      select jsonb_build_object(
        'unmatched', coalesce(
          (
            select jsonb_agg(
              jsonb_build_object('name', raw_name, 'normalized', norm, 'jobCount', job_count)
              order by job_count desc, raw_name
            )
            from unmatched
          ),
          '[]'::jsonb
        ),
        'nearDuplicates', coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'nameA', name_a,
                'jobsA', jobs_a,
                'nameB', name_b,
                'jobsB', jobs_b,
                'normalizedA', norm_a,
                'normalizedB', norm_b
              )
              order by greatest(jobs_a, jobs_b) desc, name_a, name_b
            )
            from near
          ),
          '[]'::jsonb
        ),
        'canonicalCustomers', coalesce(
          (
            select jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name)
            from public.customers
          ),
          '[]'::jsonb
        )
      );
    $body$;
  $fn$;
end;
$$;

revoke all on function public.customer_alias_candidates() from public;
grant execute on function public.customer_alias_candidates() to authenticated, anon;

commit;
