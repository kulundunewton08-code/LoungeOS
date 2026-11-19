-- LoungeOS — S3: custom session duration at session start.
--
-- Purpose
-- -------
-- Handover §2.1 requires the cashier to be able to select "Custom duration"
-- in addition to presets (90 / 120 etc.). Previously, the only way to set a
-- session's duration was through the selected shisha_options preset's
-- duration_minutes. This migration adds an optional p_custom_minutes
-- argument that overrides the preset's duration.
--
-- Scope
-- -----
--   * Adds one optional argument to public.start_lounge_session.
--   * Adds an explicit 'session_duration_overridden' audit event when the
--     override is used.
--   * Does NOT change lounge_sessions, shisha_options, RLS policies,
--     write_session_audit, guard_session_update, or any other table.
--   * Does NOT recalculate pricing. A 240-minute session created from a
--     60-minute preset still charges the preset's price_cents. Scaling
--     price with duration would be a separate business decision.
--
-- Why drop the 3-arg function before creating the 4-arg function
-- ---------------------------------------------------------------
-- PostgREST cannot reliably resolve an overloaded RPC that has the same
-- name with different argument counts when one of the overloads has a
-- default. Dropping the old signature guarantees a single candidate
-- function and the default for p_custom_minutes is applied cleanly.
--
-- Backward compatibility
-- ----------------------
-- The 3-argument call site (app/sessions/actions.tsx) continues to work
-- because p_custom_minutes is DEFAULT NULL. Verified in local
-- environment before this migration was merged; must be verified again
-- against staging before applying to production.

drop function if exists public.start_lounge_session(text, uuid, uuid);

create function public.start_lounge_session(
  p_table_label text,
  p_option_id uuid,
  p_assigned_attendant uuid default null,
  p_custom_minutes integer default null
) returns public.lounge_sessions
language plpgsql
set search_path = ''
as $$
declare
  selected_option public.shisha_options;
  new_session public.lounge_sessions;
  actor uuid := (select auth.uid());
  v_duration_minutes integer;
  v_duration_overridden boolean := false;
begin
  if not (select private.has_cashier_role()) then
    raise exception 'Insufficient permissions' using errcode = '42501';
  end if;

  if char_length(trim(p_table_label)) not between 1 and 32 then
    raise exception 'Table label must be between 1 and 32 characters' using errcode = '22023';
  end if;

  select * into selected_option
    from public.shisha_options
    where id = p_option_id and is_available;
  if not found then
    raise exception 'Selected shisha option is unavailable' using errcode = '22023';
  end if;

  if p_assigned_attendant is not null and not exists (
    select 1 from public.staff_profiles
    where user_id = p_assigned_attendant and is_active and role = 'attendant'
  ) then
    raise exception 'Assigned staff member must have attendant role' using errcode = '22023';
  end if;

  if p_custom_minutes is not null then
    if p_custom_minutes < 15 or p_custom_minutes > 360 then
      raise exception 'Custom duration must be between 15 and 360 minutes' using errcode = '22023';
    end if;
    v_duration_minutes := p_custom_minutes;
    v_duration_overridden := true;
  else
    v_duration_minutes := selected_option.duration_minutes;
  end if;

  insert into public.lounge_sessions (
    table_label, option_id, option_name, started_at, ends_at,
    status, started_by, assigned_attendant
  )
  values (
    trim(p_table_label),
    selected_option.id,
    selected_option.name,
    now(),
    now() + make_interval(mins => v_duration_minutes),
    'active',
    actor,
    p_assigned_attendant
  )
  returning * into new_session;

  if v_duration_overridden then
    insert into public.audit_events (actor_id, entity_type, entity_id, action, after_data)
    values (
      actor,
      'lounge_session',
      new_session.id,
      'session_duration_overridden',
      jsonb_build_object(
        'custom_minutes', p_custom_minutes,
        'preset_duration_minutes', selected_option.duration_minutes
      )
    );
  end if;

  return new_session;
end;
$$;

revoke all on function public.start_lounge_session(text, uuid, uuid, integer) from public, anon;
grant execute on function public.start_lounge_session(text, uuid, uuid, integer) to authenticated;
