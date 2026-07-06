-- ai_usage_log needs to actually reference the property/report a call was
-- for, not just the user — otherwise "confirm ai_usage_log records a
-- property/report reference" has nothing to point at. Run after 002.

alter table public.ai_usage_log
  add column if not exists property_id uuid references public.properties (id) on delete set null,
  add column if not exists report_id uuid references public.risk_reports (id) on delete set null;

create index if not exists ai_usage_log_property_id_idx on public.ai_usage_log (property_id);
create index if not exists ai_usage_log_report_id_idx on public.ai_usage_log (report_id);
