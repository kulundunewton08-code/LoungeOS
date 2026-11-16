import AppShell from '@/components/app-shell'
import { getStaffContext } from '@/lib/supabase/staff-context'
import SessionActions from './actions'

export const dynamic = 'force-dynamic'

export default async function SessionsPage() {
  const context = await getStaffContext()
  if (!context) return <main className="center"><div className="setup-card"><h1>Sign in to view sessions</h1><a className="primary-button full" href="/login">Continue to sign in</a></div></main>

  const { supabase, profile } = context
  const [{ data: allSessions, error }, { data: options }, { data: settingsRow }] = await Promise.all([
    supabase.from('session_board').select('id, table_label, option_name, started_at, ends_at, status, timing_status').order('started_at', { ascending: false }).limit(200),
    supabase.from('shisha_options').select('id, name, duration_minutes').eq('is_available', true).order('name'),
    supabase.from('business_settings').select('session_alert_minutes').eq('singleton', true).maybeSingle(),
  ])
  const sessions = allSessions ?? []
  const active = sessions.filter((session) => session.status === 'active')
  const history = sessions.filter((session) => session.status === 'ended').slice(0, 30)
  const canOperate = ['owner', 'admin', 'manager', 'cashier'].includes(profile.role)
  const sessionAlertMinutes = settingsRow?.session_alert_minutes ?? 10

  return <AppShell profile={profile}><main className="content">
    <header className="page-heading"><div><p className="eyebrow">LOUNGE OPERATIONS</p><h1>Sessions</h1><p>Start, monitor, extend, and end lounge sessions.</p></div><span className="page-count">{active.length} active</span></header>
    {error && <p className="notice error">Could not load sessions. Check database access and migrations.</p>}
    <section className="panel" id="new-session">
      <div className="panel-head"><div><p className="eyebrow">CURRENT FLOOR</p><h2>Active sessions <span className="count">{active.length}</span></h2></div></div>
      <SessionActions
        options={options ?? []}
        sessions={active.map((session) => ({ id: session.id, table_label: session.table_label, option_name: session.option_name, ends_at: session.ends_at, timing_status: session.timing_status }))}
        canOperate={canOperate}
        warningMinutes={sessionAlertMinutes}
      />
      {!canOperate && <p className="notice role-notice">Your {profile.role === 'flavor_specialist' ? 'flavor tasks link you to the sessions you support. Session timing is managed by the cashier or manager.' : `Your ${profile.role} role is view-only here. Ask a manager if you need session controls.`}</p>}
      {!error && !canOperate && active.length === 0 && <div className="empty"><span>◷</span><b>No active sessions</b><p>Sessions will appear when an authorized cashier starts one.</p></div>}
    </section>
    <section className="panel history-panel">
      <div className="panel-head"><div><p className="eyebrow">RECENT ACTIVITY</p><h2>Session history</h2></div></div>
      {history.length === 0 ? <div className="empty compact-empty"><b>No completed sessions yet</b><p>Completed sessions will appear here.</p></div> : <div className="table-scroll"><table className="data-table"><thead><tr><th>Table</th><th>Shisha option</th><th>Started</th><th>Ended</th><th>Status</th></tr></thead><tbody>{history.map((session) => <tr key={session.id}><td>{session.table_label}</td><td>{session.option_name}</td><td>{new Date(session.started_at).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' })}</td><td>{new Date(session.ends_at).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' })}</td><td><span className="state ended">ended</span></td></tr>)}</tbody></table></div>}
    </section>
  </main></AppShell>
}
