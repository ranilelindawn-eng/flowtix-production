-- Flowtix Audit Fix 3 — AI Execution Accounting
--
-- Preserves NULL for provider metrics that are genuinely unavailable.
-- Application source now routes real AI execution through reserve_ai_usage /
-- finalize_ai_usage, so the existing ai_requests quota is consumed exactly once
-- by reserve_ai_usage rather than by a parallel route-level meter.

begin;

create or replace function public.finalize_ai_usage(
  reservation_id uuid,
  result_status text,
  result_provider text default null,
  result_model text default null,
  actual_input_tokens integer default null,
  actual_output_tokens integer default null,
  result_cost_micros bigint default null,
  result_request_id text default null,
  result_latency_ms integer default null,
  result_error_code text default null,
  result_error_message text default null,
  result_metadata jsonb default '{}'::jsonb
)
returns public.ai_usage_reservations
language plpgsql volatile security definer
set search_path = public, auth, pg_catalog
as $function$
declare v_row public.ai_usage_reservations%rowtype; v_policy public.ai_usage_policies%rowtype; v_monthly_cost bigint; begin
  select * into v_row from public.ai_usage_reservations where id=reservation_id for update;
  if not found then raise exception 'AI_USAGE_RESERVATION_NOT_FOUND' using errcode='P0002'; end if;
  if auth.role() <> 'service_role' and v_row.user_id <> auth.uid() then raise exception 'AI_USAGE_ACCESS_DENIED' using errcode='42501'; end if;
  if v_row.status <> 'reserved' then return v_row; end if;
  if result_status not in ('completed','failed','cancelled') then raise exception 'INVALID_AI_USAGE_STATUS' using errcode='22023'; end if;
  select * into v_policy from public.ai_usage_policies where organization_id=v_row.organization_id;
  if result_provider is not null and cardinality(v_policy.allowed_providers)>0 and not (result_provider = any(v_policy.allowed_providers)) then raise exception 'AI_PROVIDER_NOT_ALLOWED:%',result_provider using errcode='P0001'; end if;
  if result_model is not null and cardinality(v_policy.allowed_models)>0 and not (result_model = any(v_policy.allowed_models)) then raise exception 'AI_MODEL_NOT_ALLOWED:%',result_model using errcode='P0001'; end if;
  if result_status='completed' and v_policy.monthly_cost_limit_micros is not null then
    select coalesce(sum(cost_micros),0) into v_monthly_cost from public.ai_usage_reservations where organization_id=v_row.organization_id and status='completed' and created_at>=date_trunc('month',now());
    if v_monthly_cost + coalesce(result_cost_micros,0) > v_policy.monthly_cost_limit_micros then raise exception 'AI_MONTHLY_COST_LIMIT_REACHED' using errcode='P0001'; end if;
  end if;
  update public.ai_usage_reservations set
    status=result_status, provider=result_provider, model=result_model,
    input_tokens=case when actual_input_tokens is null then null else greatest(actual_input_tokens,0) end,
    output_tokens=case when actual_output_tokens is null then null else greatest(actual_output_tokens,0) end,
    cost_micros=case when result_cost_micros is null then null else greatest(result_cost_micros,0) end,
    provider_request_id=result_request_id,
    latency_ms=case when result_latency_ms is null then null else greatest(result_latency_ms,0) end,
    error_code=result_error_code,
    error_message=left(result_error_message,2000), metadata=coalesce(result_metadata,'{}'::jsonb),
    completed_at=now(), updated_at=now()
  where id=reservation_id returning * into v_row;
  return v_row;
end;
$function$;

revoke all on function public.finalize_ai_usage(
  uuid,text,text,text,integer,integer,bigint,text,integer,text,text,jsonb
) from public, anon;

grant execute on function public.finalize_ai_usage(
  uuid,text,text,text,integer,integer,bigint,text,integer,text,text,jsonb
) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
