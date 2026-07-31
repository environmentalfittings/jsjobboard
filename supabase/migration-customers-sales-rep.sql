-- Assign a salesman (employee) to each customer for inventory monthly reports.
-- Safe to re-run.

alter table public.customers
  add column if not exists sales_rep_employee_id uuid references public.employees(id) on delete set null;

create index if not exists idx_customers_sales_rep_employee_id
  on public.customers (sales_rep_employee_id);

comment on column public.customers.sales_rep_employee_id is
  'Employee who owns this customer account (receives monthly inventory reports in Messages)';
