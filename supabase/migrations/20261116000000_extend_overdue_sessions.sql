update public.lounge_sessions
  set ends_at = ends_at + make_interval(mins => p_minutes)
  where id = p_session_id and status = 'active' and ends_at > now()
