-- Import VSI Tulsa repair customers + open shop jobs from spreadsheet.
-- Source: VSI_Tulsa_Repair_Customers_2025-2026.xlsx
-- Tabs: "Repair customers", "Repair orders"
-- Safe to re-run: customers upsert by name; jobs upsert by valve_id only when already VSI-owned.
-- Requires: migration-organizations-foundation.sql (VSI org row must exist).
-- Also applies valves.organization_id if missing (same as migration-valves-organization.sql).

begin;

-- 0) Company ownership on valves (existing untagged rows -> JS Valve)
alter table public.valves
  add column if not exists organization_id uuid references public.organizations (id) on delete set null;

create index if not exists idx_valves_organization_id
  on public.valves (organization_id);

update public.valves v
set organization_id = o.id
from public.organizations o
where o.slug = 'js-valve'
  and v.organization_id is null;

-- 1) VSI customers (79 from Repair customers tab; excludes footer notes)
insert into public.customers (name)
values
  ('HF Sinclair - Refining East'),
  ('CVR Wynnewood Refining'),
  ('XTO Energy, Inc - Ardmore'),
  ('Valero Mckee Refinery'),
  ('Continental Resources Inc.'),
  ('LimeRock Resources'),
  ('Hilcorp Energy Company - Donie'),
  ('Reworld Tulsa, LLC'),
  ('Valero Ardmore Refinery'),
  ('BKV North Texas'),
  ('HollyFrontier El Dorado Refining'),
  ('International Paper'),
  ('Mercer Valve Company, Inc.'),
  ('CP Kelco U.S., Inc.'),
  ('Cargill-Wichita'),
  ('Air Products Express Services'),
  ('J-S Machine and Valve Inc.'),
  ('Kiowa Power Partners LLC-Tenaska Kiamichi'),
  ('CF Industries'),
  ('HighMark Energy Operating, LLC'),
  ('Energy Transfer Fuel L.P. - North Texas'),
  ('Exco Resources, Inc.'),
  ('Gold Bond Building Products'),
  ('Bell Supply Company - North Texas'),
  ('Valve Systems International LLC (VSI)'),
  ('Brodie Mechanical Services'),
  ('Crescent Energy - Utah'),
  ('Seaboard Energy - Hugoton, KS'),
  ('Cardinal Ethanol'),
  ('War Horse Industrial'),
  ('HF Sinclair - Refining West'),
  ('Tokai Carbon CB - Borger'),
  ('Aep American Electric Power Pso Tulsa Power'),
  ('Apollo Energy Solutions'),
  ('Summit Midstream Partners LLC'),
  ('Goodyear Tire & Rubber Co.'),
  ('Applied LNG (Midlothian LNG)'),
  ('Nacelle Solutions'),
  ('Nucera Solutions'),
  ('RRP Operating LLC'),
  ('Hoffman Supply Company, Inc. dba Johnstone Supply'),
  ('CHS Refining'),
  ('Phillips 66 -Borger Refinery'),
  ('Blue Origin'),
  ('Vinson Process Controls CO., LP'),
  ('OG&E Sooner Power Plant'),
  ('Norit Americas, Inc.'),
  ('WestRock - North Texas'),
  ('Oneok Hydrocarbon Lp - Kansas'),
  ('XTO Energy, Inc - Carlsbad'),
  ('Vicinity Energy - OKC'),
  ('DCP Operating Company, Lp Parent'),
  ('Hatfield and Company - Oklahoma'),
  ('Automation Service'),
  ('Phillips 66 Bartlesville Downtown'),
  ('University of Texas at Austin'),
  ('Air Products and Chemicals'),
  ('Seaboard Energy Parent'),
  ('American Electric Power - PSO - Oologah'),
  ('American Electric Power - PSO - SW Station'),
  ('Occidental Chemical Corp'),
  ('Baker Hughes'),
  ('Wilsonart LLC'),
  ('Relevant Solutions'),
  ('AEP American Electric Power- AEP Western OK'),
  ('OG&E River Valley'),
  ('EagleRidge Operating, LLC'),
  ('CVR Nitrogen'),
  ('Flatrock Compression, LTD. - West Texas'),
  ('Xcel Energy'),
  ('Enlink - Western OK'),
  ('Contro Valve Equipment Inc'),
  ('Valtris Specialty Chemicals'),
  ('Gulf Valve Service Co Inc'),
  ('CUST-O-FAB'),
  ('Best Supply Company'),
  ('DCP - Carlsbad'),
  ('Oneok Field Services'),
  ('Tokai Carbon CB - West Texas')
on conflict (name) do nothing;

-- 2) Active VSI repair orders (valve_id = SO #; due_date = Deliver by)
with vsi as (
  select id as vsi_id from public.organizations where slug = 'vsi' limit 1
),
raw (valve_id, customer, status, order_type, job_type, due_date, description, notes) as (
  values
  ('508847', 'CVR Wynnewood Refining', 'Incoming', 'In-Process Order', 'Valve Repair', '2026-09-29'::date, 'VSI Repair-Shop', 'Imported from VSI Tulsa Repair orders spreadsheet. Created by: Wesley Watkins. Open value: 249. Source status: Open.'),
  ('509197', 'CVR Wynnewood Refining', 'Incoming', 'In-Process Order', 'Valve Repair', '2026-09-29'::date, 'VSI Repair-Shop', 'Imported from VSI Tulsa Repair orders spreadsheet. Created by: Wesley Watkins. Open value: 887. Source status: Open.'),
  ('509955', 'CVR Wynnewood Refining', 'Incoming', 'In-Process Order', 'Valve Repair', '2026-09-29'::date, 'VSI Repair-Shop', 'Imported from VSI Tulsa Repair orders spreadsheet. Created by: Wesley Watkins. Open value: 887. Source status: Open.'),
  ('513739', 'Valero Mckee Refinery', 'Incoming', 'In-Process Order', 'Valve Repair', '2026-09-29'::date, 'VSI Repair-Shop', 'Imported from VSI Tulsa Repair orders spreadsheet. Created by: Christopher Talley. Open value: 26460. Source status: Open.'),
  ('496913', 'Baker Hughes', 'Incoming', 'In-Process Order', 'Valve Repair', '2026-09-30'::date, 'VSI Repair-Shop', 'Imported from VSI Tulsa Repair orders spreadsheet. Created by: Barrett Wells. Open value: 3235.53. Source status: Open.'),
  ('506149', 'CVR Wynnewood Refining', 'Incoming', 'In-Process Order', 'Valve Repair', '2026-09-30'::date, 'VSI Repair-Shop', 'Imported from VSI Tulsa Repair orders spreadsheet. Created by: Wesley Watkins. Open value: 75. Source status: Open.'),
  ('508205', 'CP Kelco U.S., Inc.', 'Incoming', 'In-Process Order', 'Valve Repair', '2026-09-30'::date, 'VSI Repair-Shop', 'Imported from VSI Tulsa Repair orders spreadsheet. Created by: Barrett Wells. Open value: 5373. Source status: Open.'),
  ('508332', 'WestRock - North Texas', 'Incoming', 'In-Process Order', 'Valve Repair', '2026-09-30'::date, 'VSI Repair-Shop', 'Imported from VSI Tulsa Repair orders spreadsheet. Created by: Wesley Watkins. Open value: 12868. Source status: Open.'),
  ('516343', 'CVR Wynnewood Refining', 'Incoming', 'In-Process Order', 'Valve Repair', '2026-09-30'::date, 'VSI Repair-Shop', 'Imported from VSI Tulsa Repair orders spreadsheet. Created by: Levi Vanaman. Open value: 437.75. Source status: Open.'),
  ('516440', 'Hilcorp Energy Company - Donie', 'Incoming', 'In-Process Order', 'Valve Repair', '2026-10-09'::date, 'VSI Repair-Shop', 'Imported from VSI Tulsa Repair orders spreadsheet. Created by: Melissa Kincaid. Open value: 449.25. Source status: Open.'),
  ('502371', 'Seaboard Energy - Hugoton, KS', 'Incoming', 'In-Process Order', 'Valve Repair', '2026-10-14'::date, 'VSI Repair-Shop', 'Imported from VSI Tulsa Repair orders spreadsheet. Created by: Barrett Wells. Open value: 155870. Source status: Open.'),
  ('509418', 'CVR Wynnewood Refining', 'Incoming', 'In-Process Order', 'Valve Repair', '2026-10-15'::date, 'VSI Repair-Shop', 'Imported from VSI Tulsa Repair orders spreadsheet. Created by: Wesley Watkins. Open value: 887. Source status: Open.'),
  ('512552', 'Valero Ardmore Refinery', 'Incoming', 'In-Process Order', 'Valve Repair', '2026-10-15'::date, 'VSI Repair-Shop', 'Imported from VSI Tulsa Repair orders spreadsheet. Created by: Wesley Watkins. Open value: 12653. Source status: Open.'),
  ('513343', 'Xcel Energy', 'Incoming', 'In-Process Order', 'Valve Repair', '2026-10-21'::date, 'VSI Repair-Shop', 'Imported from VSI Tulsa Repair orders spreadsheet. Created by: Wesley Watkins. Open value: 1402. Source status: Open.'),
  ('508595', 'Valero Mckee Refinery', 'Incoming', 'In-Process Order', 'Valve Repair', '2026-10-22'::date, 'VSI Repair-Shop', 'Imported from VSI Tulsa Repair orders spreadsheet. Created by: Christopher Talley. Open value: 680. Source status: Open.'),
  ('473184', 'Valero Mckee Refinery', 'Incoming', 'In-Process Order', 'Valve Repair', '2026-10-30'::date, 'VSI Repair-Shop', 'Imported from VSI Tulsa Repair orders spreadsheet. Created by: John Maras. Open value: 24769. Source status: Open.'),
  ('473185', 'Valero Mckee Refinery', 'Incoming', 'In-Process Order', 'Valve Repair', '2026-10-30'::date, 'VSI Repair-Shop', 'Imported from VSI Tulsa Repair orders spreadsheet. Created by: John Maras. Open value: 14171. Source status: Open.'),
  ('473246', 'Valero Mckee Refinery', 'Incoming', 'In-Process Order', 'Valve Repair', '2026-10-30'::date, 'VSI Repair-Shop', 'Imported from VSI Tulsa Repair orders spreadsheet. Created by: John Maras. Open value: 33074. Source status: Open.'),
  ('473324', 'Valero Mckee Refinery', 'Incoming', 'In-Process Order', 'Valve Repair', '2026-10-30'::date, 'VSI Repair-Shop', 'Imported from VSI Tulsa Repair orders spreadsheet. Created by: John Maras. Open value: 11518. Source status: Open.'),
  ('473359', 'Valero Mckee Refinery', 'Incoming', 'In-Process Order', 'Valve Repair', '2026-10-30'::date, 'VSI Repair-Shop', 'Imported from VSI Tulsa Repair orders spreadsheet. Created by: John Maras. Open value: 11183. Source status: Open.'),
  ('473704', 'Valero Mckee Refinery', 'Incoming', 'In-Process Order', 'Valve Repair', '2026-10-30'::date, 'VSI Repair-Shop', 'Imported from VSI Tulsa Repair orders spreadsheet. Created by: John Maras. Open value: 28205. Source status: Open.'),
  ('473842', 'Valero Mckee Refinery', 'Incoming', 'In-Process Order', 'Valve Repair', '2026-10-30'::date, 'VSI Repair-Shop', 'Imported from VSI Tulsa Repair orders spreadsheet. Created by: John Maras. Open value: 18312. Source status: Open.'),
  ('473846', 'Valero Mckee Refinery', 'Incoming', 'In-Process Order', 'Valve Repair', '2026-10-30'::date, 'VSI Repair-Shop', 'Imported from VSI Tulsa Repair orders spreadsheet. Created by: John Maras. Open value: 6190. Source status: Open.'),
  ('473984', 'Valero Mckee Refinery', 'Incoming', 'In-Process Order', 'Valve Repair', '2026-10-30'::date, 'VSI Repair-Shop', 'Imported from VSI Tulsa Repair orders spreadsheet. Created by: John Maras. Open value: 7210. Source status: Open.'),
  ('474007', 'Valero Mckee Refinery', 'Incoming', 'In-Process Order', 'Valve Repair', '2026-10-30'::date, 'VSI Repair-Shop', 'Imported from VSI Tulsa Repair orders spreadsheet. Created by: John Maras. Open value: 6364. Source status: Open.'),
  ('474011', 'Valero Mckee Refinery', 'Incoming', 'In-Process Order', 'Valve Repair', '2026-10-30'::date, 'VSI Repair-Shop', 'Imported from VSI Tulsa Repair orders spreadsheet. Created by: John Maras. Open value: 16748. Source status: Open.'),
  ('474016', 'Valero Mckee Refinery', 'Incoming', 'In-Process Order', 'Valve Repair', '2026-10-30'::date, 'VSI Repair-Shop', 'Imported from VSI Tulsa Repair orders spreadsheet. Created by: John Maras. Open value: 7979. Source status: Open.'),
  ('474254', 'Valero Mckee Refinery', 'Incoming', 'In-Process Order', 'Valve Repair', '2026-10-30'::date, 'VSI Repair-Shop', 'Imported from VSI Tulsa Repair orders spreadsheet. Created by: John Maras. Open value: 7078. Source status: Open.'),
  ('474266', 'Valero Mckee Refinery', 'Incoming', 'In-Process Order', 'Valve Repair', '2026-10-30'::date, 'VSI Repair-Shop', 'Imported from VSI Tulsa Repair orders spreadsheet. Created by: John Maras. Open value: 12763. Source status: Open.'),
  ('474287', 'Valero Mckee Refinery', 'Incoming', 'In-Process Order', 'Valve Repair', '2026-10-30'::date, 'VSI Repair-Shop', 'Imported from VSI Tulsa Repair orders spreadsheet. Created by: John Maras. Open value: 16748. Source status: Open.'),
  ('474485', 'Valero Mckee Refinery', 'Incoming', 'In-Process Order', 'Valve Repair', '2026-10-30'::date, 'VSI Repair-Shop', 'Imported from VSI Tulsa Repair orders spreadsheet. Created by: John Maras. Open value: 16499. Source status: Open.'),
  ('500477', 'Valero Mckee Refinery', 'Incoming', 'In-Process Order', 'Valve Repair', '2026-11-06'::date, 'VSI Repair-Shop', 'Imported from VSI Tulsa Repair orders spreadsheet. Created by: Christopher Talley. Open value: 5520. Source status: Open.'),
  ('508585', 'Valero Mckee Refinery', 'Incoming', 'In-Process Order', 'Valve Repair', '2026-11-12'::date, 'VSI Repair-Shop', 'Imported from VSI Tulsa Repair orders spreadsheet. Created by: Christopher Talley. Open value: 665. Source status: Open.'),
  ('484857', 'Reworld Tulsa, LLC', 'Incoming', 'In-Process Order', 'Valve Repair', '2026-11-19'::date, 'VSI Repair-Shop', 'Imported from VSI Tulsa Repair orders spreadsheet. Created by: Christopher Talley. Open value: 2240. Source status: Open.'),
  ('508604', 'Valero Mckee Refinery', 'Incoming', 'In-Process Order', 'Valve Repair', '2026-11-27'::date, 'VSI Repair-Shop', 'Imported from VSI Tulsa Repair orders spreadsheet. Created by: Christopher Talley. Open value: 500. Source status: Open.'),
  ('503363', 'CHS Refining', 'Incoming', 'In-Process Order', 'Valve Repair', '2026-11-30'::date, 'VSI Repair-Shop', 'Imported from VSI Tulsa Repair orders spreadsheet. Created by: John Maras. Open value: 111786. Source status: Open.'),
  ('504100', 'International Paper', 'Incoming', 'In-Process Order', 'Valve Repair', '2026-12-30'::date, 'VSI Repair-Shop', 'Imported from VSI Tulsa Repair orders spreadsheet. Created by: Wesley Watkins. Open value: 29815. Source status: Open.'),
  ('504374', 'International Paper', 'Incoming', 'In-Process Order', 'Valve Repair', '2026-12-30'::date, 'VSI Repair-Shop', 'Imported from VSI Tulsa Repair orders spreadsheet. Created by: Wesley Watkins. Open value: 74919.8. Source status: Open.'),
  ('488340', 'Applied LNG (Midlothian LNG)', 'Incoming', 'In-Process Order', 'Valve Repair', '2026-12-31'::date, 'VSI Repair-Shop', 'Imported from VSI Tulsa Repair orders spreadsheet. Created by: Barrett Wells. Open value: 1430. Source status: Open.'),
  ('499953', 'CVR Wynnewood Refining', 'Incoming', 'In-Process Order', 'Valve Repair', '2026-12-31'::date, 'VSI Repair-Shop', 'Imported from VSI Tulsa Repair orders spreadsheet. Created by: Levi Vanaman. Open value: 235. Source status: Open.'),
  ('499959', 'CVR Wynnewood Refining', 'Incoming', 'In-Process Order', 'Valve Repair', '2026-12-31'::date, 'VSI Repair-Shop', 'Imported from VSI Tulsa Repair orders spreadsheet. Created by: Levi Vanaman. Open value: 300. Source status: Open.'),
  ('499965', 'CVR Wynnewood Refining', 'Incoming', 'In-Process Order', 'Valve Repair', '2026-12-31'::date, 'VSI Repair-Shop', 'Imported from VSI Tulsa Repair orders spreadsheet. Created by: Levi Vanaman. Open value: 500. Source status: Open.'),
  ('504036', 'CVR Wynnewood Refining', 'Incoming', 'In-Process Order', 'Valve Repair', '2026-12-31'::date, 'VSI Repair-Shop', 'Imported from VSI Tulsa Repair orders spreadsheet. Created by: Levi Vanaman. Open value: 120. Source status: Open.'),
  ('506122', 'HollyFrontier El Dorado Refining', 'Incoming', 'In-Process Order', 'Valve Repair', '2026-12-31'::date, 'VSI Repair-Shop', 'Imported from VSI Tulsa Repair orders spreadsheet. Created by: Wesley Watkins. Open value: 1780. Source status: Open.'),
  ('506130', 'CVR Wynnewood Refining', 'Incoming', 'In-Process Order', 'Valve Repair', '2026-12-31'::date, 'VSI Repair-Shop', 'Imported from VSI Tulsa Repair orders spreadsheet. Created by: Wesley Watkins. Open value: 75. Source status: Open.'),
  ('508312', 'AEP American Electric Power- AEP Western OK', 'Incoming', 'In-Process Order', 'Valve Repair', '2026-12-31'::date, 'VSI Repair-Shop', 'Imported from VSI Tulsa Repair orders spreadsheet. Created by: Wesley Watkins. Open value: 2488. Source status: Open.'),
  ('508550', 'CVR Wynnewood Refining', 'Incoming', 'In-Process Order', 'Valve Repair', '2026-12-31'::date, 'VSI Repair-Shop', 'Imported from VSI Tulsa Repair orders spreadsheet. Created by: Wesley Watkins. Open value: 249. Source status: Open.'),
  ('508555', 'CVR Wynnewood Refining', 'Incoming', 'In-Process Order', 'Valve Repair', '2026-12-31'::date, 'VSI Repair-Shop', 'Imported from VSI Tulsa Repair orders spreadsheet. Created by: Wesley Watkins. Open value: 249. Source status: Open.'),
  ('508560', 'CVR Wynnewood Refining', 'Incoming', 'In-Process Order', 'Valve Repair', '2026-12-31'::date, 'VSI Repair-Shop', 'Imported from VSI Tulsa Repair orders spreadsheet. Created by: Wesley Watkins. Open value: 249. Source status: Open.'),
  ('508620', 'CVR Wynnewood Refining', 'Incoming', 'In-Process Order', 'Valve Repair', '2026-12-31'::date, 'VSI Repair-Shop', 'Imported from VSI Tulsa Repair orders spreadsheet. Created by: Wesley Watkins. Open value: 249. Source status: Open.'),
  ('508625', 'CVR Wynnewood Refining', 'Incoming', 'In-Process Order', 'Valve Repair', '2026-12-31'::date, 'VSI Repair-Shop', 'Imported from VSI Tulsa Repair orders spreadsheet. Created by: Wesley Watkins. Open value: 249. Source status: Open.'),
  ('508628', 'CVR Wynnewood Refining', 'Incoming', 'In-Process Order', 'Valve Repair', '2026-12-31'::date, 'VSI Repair-Shop', 'Imported from VSI Tulsa Repair orders spreadsheet. Created by: Wesley Watkins. Open value: 249. Source status: Open.'),
  ('510548', 'International Paper', 'Incoming', 'In-Process Order', 'Valve Repair', '2026-12-31'::date, 'VSI Repair-Shop', 'Imported from VSI Tulsa Repair orders spreadsheet. Created by: Wesley Watkins. Open value: 12838. Source status: Open.'),
  ('509842', 'Wilsonart LLC', 'Incoming', 'In-Process Order', 'Valve Repair', '2027-01-01'::date, 'VSI Repair-Shop', 'Imported from VSI Tulsa Repair orders spreadsheet. Created by: Barrett Wells. Open value: 3100. Source status: Open.'),
  ('508425', 'Blue Origin', 'Incoming', 'In-Process Order', 'Valve Repair', '2027-01-01'::date, 'VSI Repair-Shop', 'Imported from VSI Tulsa Repair orders spreadsheet. Created by: Barrett Wells. Open value: 18862.5. Source status: Open.'),
  ('505424', 'Kiowa Power Partners LLC-Tenaska Kiamichi', 'Incoming', 'In-Process Order', 'Valve Repair', '2027-01-01'::date, 'VSI Repair-Shop', 'Imported from VSI Tulsa Repair orders spreadsheet. Created by: Barrett Wells. Open value: 3800. Source status: Open.'),
  ('513786', 'International Paper', 'Incoming', 'In-Process Order', 'Valve Repair', '2027-01-01'::date, 'VSI Repair-Shop', 'Imported from VSI Tulsa Repair orders spreadsheet. Created by: Wesley Watkins. Open value: 4671. Source status: Open.'),
  ('502200', 'J-S Machine and Valve Inc.', 'Incoming', 'In-Process Order', 'Valve Repair', '2027-01-01'::date, 'VSI Repair-Shop', 'Imported from VSI Tulsa Repair orders spreadsheet. Created by: Barrett Wells. Open value: 1022.5. Source status: Open.'),
  ('509172', 'Valve Systems International LLC (VSI)', 'Incoming', 'In-Process Order', 'Valve Repair', '2027-01-01'::date, 'VSI Repair-Shop', 'Imported from VSI Tulsa Repair orders spreadsheet. Created by: Barrett Wells. Open value: 3100. Source status: Open.'),
  ('515062', 'Valve Systems International LLC (VSI)', 'Incoming', 'In-Process Order', 'Valve Repair', '2027-01-01'::date, 'VSI Repair-Shop', 'Imported from VSI Tulsa Repair orders spreadsheet. Created by: Wesley Watkins. Open value: 2600. Source status: Open.'),
  ('509179', 'War Horse Industrial', 'Incoming', 'In-Process Order', 'Valve Repair', '2027-01-01'::date, 'VSI Repair-Shop', 'Imported from VSI Tulsa Repair orders spreadsheet. Created by: Barrett Wells. Open value: 23245. Source status: Open.'),
  ('510934', 'HF Sinclair - Refining East', 'Incoming', 'In-Process Order', 'Valve Repair', '2027-01-01'::date, 'VSI Repair-Shop', 'Imported from VSI Tulsa Repair orders spreadsheet. Created by: Barrett Wells. Open value: 400. Source status: Open.'),
  ('506512', 'HF Sinclair - Refining East', 'Incoming', 'In-Process Order', 'Valve Repair', '2027-01-01'::date, 'VSI Repair-Shop', 'Imported from VSI Tulsa Repair orders spreadsheet. Created by: Wesley Watkins. Open value: 120. Source status: Open.'),
  ('508156', 'HF Sinclair - Refining East', 'Incoming', 'In-Process Order', 'Valve Repair', '2027-01-01'::date, 'VSI Repair-Shop', 'Imported from VSI Tulsa Repair orders spreadsheet. Created by: Wesley Watkins. Open value: 75. Source status: Open.'),
  ('510045', 'HF Sinclair - Refining East', 'Incoming', 'In-Process Order', 'Valve Repair', '2027-01-01'::date, 'VSI Repair-Shop', 'Imported from VSI Tulsa Repair orders spreadsheet. Created by: Wesley Watkins. Open value: 120. Source status: Open.'),
  ('510194', 'HF Sinclair - Refining East', 'Incoming', 'In-Process Order', 'Valve Repair', '2027-01-01'::date, 'VSI Repair-Shop', 'Imported from VSI Tulsa Repair orders spreadsheet. Created by: Wesley Watkins. Open value: 250. Source status: Open.'),
  ('494064', 'HF Sinclair - Refining East', 'Incoming', 'In-Process Order', 'Valve Repair', '2027-01-01'::date, 'VSI Repair-Shop', 'Imported from VSI Tulsa Repair orders spreadsheet. Created by: Barrett Wells. Open value: 1935. Source status: Open.'),
  ('513651', 'HF Sinclair - Refining East', 'Incoming', 'In-Process Order', 'Valve Repair', '2027-01-01'::date, 'VSI Repair-Shop', 'Imported from VSI Tulsa Repair orders spreadsheet. Created by: Wesley Watkins. Open value: 75. Source status: Open.'),
  ('513671', 'HF Sinclair - Refining East', 'Incoming', 'In-Process Order', 'Valve Repair', '2027-01-01'::date, 'VSI Repair-Shop', 'Imported from VSI Tulsa Repair orders spreadsheet. Created by: Wesley Watkins. Open value: 250. Source status: Open.'),
  ('514841', 'HF Sinclair - Refining East', 'Incoming', 'In-Process Order', 'Valve Repair', '2027-01-01'::date, 'VSI Repair-Shop', 'Imported from VSI Tulsa Repair orders spreadsheet. Created by: Wesley Watkins. Open value: 75. Source status: Open.'),
  ('514847', 'HF Sinclair - Refining East', 'Incoming', 'In-Process Order', 'Valve Repair', '2027-01-01'::date, 'VSI Repair-Shop', 'Imported from VSI Tulsa Repair orders spreadsheet. Created by: Wesley Watkins. Open value: 120. Source status: Open.'),
  ('509505', 'HF Sinclair - Refining East', 'Incoming', 'In-Process Order', 'Valve Repair', '2027-01-01'::date, 'VSI Repair-Shop', 'Imported from VSI Tulsa Repair orders spreadsheet. Created by: Wesley Watkins. Open value: 4756. Source status: Open.'),
  ('503464', 'HF Sinclair - Refining East', 'Incoming', 'In-Process Order', 'Valve Repair', '2027-01-01'::date, 'VSI Repair-Shop', 'Imported from VSI Tulsa Repair orders spreadsheet. Created by: Christopher Talley. Open value: 1341. Source status: Open.'),
  ('511097', 'HF Sinclair - Refining East', 'Incoming', 'In-Process Order', 'Valve Repair', '2027-01-01'::date, 'VSI Repair-Shop', 'Imported from VSI Tulsa Repair orders spreadsheet. Created by: Christopher Talley. Open value: 16418. Source status: Open.'),
  ('506502', 'HF Sinclair - Refining East', 'Incoming', 'In-Process Order', 'Valve Repair', '2027-01-01'::date, 'VSI Repair-Shop', 'Imported from VSI Tulsa Repair orders spreadsheet. Created by: Wesley Watkins. Open value: 75. Source status: Open.'),
  ('502135', 'HF Sinclair - Refining East', 'Incoming', 'In-Process Order', 'Valve Repair', '2027-01-01'::date, 'VSI Repair-Shop', 'Imported from VSI Tulsa Repair orders spreadsheet. Created by: Christopher Talley. Open value: 2411. Source status: Open.'),
  ('473430', 'Cargill-Wichita', 'Incoming', 'In-Process Order', 'Valve Repair', '2027-01-01'::date, 'VSI Repair-Shop', 'Imported from VSI Tulsa Repair orders spreadsheet. Created by: Levi Vanaman. Open value: 3906.6. Source status: Open.'),
  ('482793', 'HF Sinclair - Refining East', 'Incoming', 'In-Process Order', 'Valve Repair', '2027-01-01'::date, 'VSI Repair-Shop', 'Imported from VSI Tulsa Repair orders spreadsheet. Created by: Christopher Talley. Open value: 2539. Source status: Open.'),
  ('484929', 'HF Sinclair - Refining East', 'Incoming', 'In-Process Order', 'Valve Repair', '2027-01-01'::date, 'VSI Repair-Shop', 'Imported from VSI Tulsa Repair orders spreadsheet. Created by: Christopher Talley. Open value: 6562. Source status: Open.'),
  ('485247', 'HF Sinclair - Refining East', 'Incoming', 'In-Process Order', 'Valve Repair', '2027-01-01'::date, 'VSI Repair-Shop', 'Imported from VSI Tulsa Repair orders spreadsheet. Created by: Christopher Talley. Open value: 4904. Source status: Open.'),
  ('509207', 'CVR Wynnewood Refining', 'Hold', 'In-Process Order', 'Valve Repair', null, 'VSI Repair-Shop', 'Imported from VSI Tulsa Repair orders spreadsheet. Created by: Wesley Watkins. Open value: 887. Source status: No date.'),
  ('512358', 'Phillips 66 -Borger Refinery', 'Hold', 'In-Process Order', 'Valve Repair', null, 'VSI Repair-Shop', 'Imported from VSI Tulsa Repair orders spreadsheet. Created by: Wesley Watkins. Open value: 24892. Source status: No date.'),
  ('516001', 'Cargill-Wichita', 'Hold', 'In-Process Order', 'Valve Repair', null, 'VSI Repair-Shop', 'Imported from VSI Tulsa Repair orders spreadsheet. Created by: Wesley Watkins. Open value: 1885.57. Source status: No date.'),
  ('516600', 'CF Industries', 'Hold', 'In-Process Order', 'Valve Repair', null, 'VSI Repair-Shop', 'Imported from VSI Tulsa Repair orders spreadsheet. Created by: Wesley Watkins. Open value: 26029. Source status: No date.'),
  ('516628', 'Energy Transfer Fuel L.P. - North Texas', 'Hold', 'In-Process Order', 'Valve Repair', null, 'VSI Repair-Shop', 'Imported from VSI Tulsa Repair orders spreadsheet. Created by: Melissa Kincaid. Open value: 127. Source status: No date.')
)
insert into public.valves (
  valve_id, customer, status, order_type, job_type, due_date, description, notes, organization_id
)
select
  r.valve_id, r.customer, r.status, r.order_type, r.job_type, r.due_date, r.description, r.notes, v.vsi_id
from raw r
cross join vsi v
where v.vsi_id is not null
on conflict (valve_id) do update
set
  customer = excluded.customer,
  status = excluded.status,
  order_type = excluded.order_type,
  job_type = excluded.job_type,
  due_date = excluded.due_date,
  description = excluded.description,
  notes = excluded.notes,
  organization_id = excluded.organization_id,
  updated_at = now()
where public.valves.organization_id = excluded.organization_id;

-- Conflicts with existing non-VSI valve_id values (skipped by the WHERE above)
select v.valve_id, v.customer as existing_customer, v.status as existing_status, o.slug as existing_org
from public.valves v
left join public.organizations o on o.id = v.organization_id
where v.valve_id in ('508847', '509197', '509955', '513739', '496913', '506149', '508205', '508332', '516343', '516440', '502371', '509418', '512552', '513343', '508595', '473184', '473185', '473246', '473324', '473359', '473704', '473842', '473846', '473984', '474007', '474011', '474016', '474254', '474266', '474287', '474485', '500477', '508585', '484857', '508604', '503363', '504100', '504374', '488340', '499953', '499959', '499965', '504036', '506122', '506130', '508312', '508550', '508555', '508560', '508620', '508625', '508628', '510548', '509842', '508425', '505424', '513786', '502200', '509172', '515062', '509179', '510934', '506512', '508156', '510045', '510194', '494064', '513651', '513671', '514841', '514847', '509505', '503464', '511097', '506502', '502135', '473430', '482793', '484929', '485247', '509207', '512358', '516001', '516600', '516628')
  and (v.organization_id is distinct from (select id from public.organizations where slug = 'vsi' limit 1));

-- Preview
select count(*) as vsi_customers_imported
from public.customers c
where c.name in ('HF Sinclair - Refining East', 'CVR Wynnewood Refining', 'XTO Energy, Inc - Ardmore', 'Valero Mckee Refinery', 'Continental Resources Inc.', 'LimeRock Resources', 'Hilcorp Energy Company - Donie', 'Reworld Tulsa, LLC', 'Valero Ardmore Refinery', 'BKV North Texas', 'HollyFrontier El Dorado Refining', 'International Paper', 'Mercer Valve Company, Inc.', 'CP Kelco U.S., Inc.', 'Cargill-Wichita', 'Air Products Express Services', 'J-S Machine and Valve Inc.', 'Kiowa Power Partners LLC-Tenaska Kiamichi', 'CF Industries', 'HighMark Energy Operating, LLC', 'Energy Transfer Fuel L.P. - North Texas', 'Exco Resources, Inc.', 'Gold Bond Building Products', 'Bell Supply Company - North Texas', 'Valve Systems International LLC (VSI)', 'Brodie Mechanical Services', 'Crescent Energy - Utah', 'Seaboard Energy - Hugoton, KS', 'Cardinal Ethanol', 'War Horse Industrial', 'HF Sinclair - Refining West', 'Tokai Carbon CB - Borger', 'Aep American Electric Power Pso Tulsa Power', 'Apollo Energy Solutions', 'Summit Midstream Partners LLC', 'Goodyear Tire & Rubber Co.', 'Applied LNG (Midlothian LNG)', 'Nacelle Solutions', 'Nucera Solutions', 'RRP Operating LLC', 'Hoffman Supply Company, Inc. dba Johnstone Supply', 'CHS Refining', 'Phillips 66 -Borger Refinery', 'Blue Origin', 'Vinson Process Controls CO., LP', 'OG&E Sooner Power Plant', 'Norit Americas, Inc.', 'WestRock - North Texas', 'Oneok Hydrocarbon Lp - Kansas', 'XTO Energy, Inc - Carlsbad', 'Vicinity Energy - OKC', 'DCP Operating Company, Lp Parent', 'Hatfield and Company - Oklahoma', 'Automation Service', 'Phillips 66 Bartlesville Downtown', 'University of Texas at Austin', 'Air Products and Chemicals', 'Seaboard Energy Parent', 'American Electric Power - PSO - Oologah', 'American Electric Power - PSO - SW Station', 'Occidental Chemical Corp', 'Baker Hughes', 'Wilsonart LLC', 'Relevant Solutions', 'AEP American Electric Power- AEP Western OK', 'OG&E River Valley', 'EagleRidge Operating, LLC', 'CVR Nitrogen', 'Flatrock Compression, LTD. - West Texas', 'Xcel Energy', 'Enlink - Western OK', 'Contro Valve Equipment Inc', 'Valtris Specialty Chemicals', 'Gulf Valve Service Co Inc', 'CUST-O-FAB', 'Best Supply Company', 'DCP - Carlsbad', 'Oneok Field Services', 'Tokai Carbon CB - West Texas');

select count(*) as vsi_open_jobs
from public.valves v
join public.organizations o on o.id = v.organization_id
where o.slug = 'vsi'
  and v.valve_id in ('508847', '509197', '509955', '513739', '496913', '506149', '508205', '508332', '516343', '516440', '502371', '509418', '512552', '513343', '508595', '473184', '473185', '473246', '473324', '473359', '473704', '473842', '473846', '473984', '474007', '474011', '474016', '474254', '474266', '474287', '474485', '500477', '508585', '484857', '508604', '503363', '504100', '504374', '488340', '499953', '499959', '499965', '504036', '506122', '506130', '508312', '508550', '508555', '508560', '508620', '508625', '508628', '510548', '509842', '508425', '505424', '513786', '502200', '509172', '515062', '509179', '510934', '506512', '508156', '510045', '510194', '494064', '513651', '513671', '514841', '514847', '509505', '503464', '511097', '506502', '502135', '473430', '482793', '484929', '485247', '509207', '512358', '516001', '516600', '516628');

select v.valve_id, v.customer, v.status, v.due_date, v.job_type
from public.valves v
join public.organizations o on o.id = v.organization_id
where o.slug = 'vsi'
order by v.due_date nulls last, v.valve_id
limit 25;

commit;
