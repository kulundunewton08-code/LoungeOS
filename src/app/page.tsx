import Link from 'next/link'
import AppShell from '@/components/app-shell'
import SessionTimer from '@/components/session-timer'
import { getStaffContext } from '@/lib/supabase/staff-context'

type LoungeSession = {
  id: string
  table_label: string
  option_name: string
  started_at: string
  ends_at: string
  timing_status: 'active' | 'ending_soon' | 'overdue' | 'ended'
}

export const dynamic = 'force-dynamic'

export default async function Home() {
  const context = await getStaffContext()
  if (!context) return <main className="center"><div className="setup-card"><h1>Sign in to LoungeOS</h1><p>Use your staff account to open the operations dashboard.</p><Link className="primary-button full" href="/login">Continue to sign in</Link></div></main>

  const { supabase, profile } = context
  const dateParts = new Intl.DateTimeFormat('en-KE', { timeZone: 'Africa/Nairobi', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const today = `${dateParts.find((part) => part.type === 'year')?.value}-${dateParts.find((part) => part.type === 'month')?.value}-${dateParts.find((part) => part.type === 'day')?.value}`
  const dayStartDate = new Date(`${today}T00:00:00+03:00`)
  const dayStart = dayStartDate.toISOString()
  const dayEnd = new Date(dayStartDate.getTime() + 24 * 60 * 60 * 1000).toISOString()
  const canSeeSales = ['owner', 'admin', 'manager', 'cashier'].includes(profile.role)
  const canSeeInventory = canSeeSales || profile.role === 'flavor_specialist'
  const [{ data: settings }, { data: sessions, error }, { data: paidToday, error: salesError }] = await Promise.all([
    supabase.from('business_settings').select('session_alert_minutes, low_stock_alert_enabled').eq('singleton', true).maybeSingle(),
    supabase.from('session_board').select('id, table_label, option_name, started_at, ends_at, timing_status').neq('status', 'ended').order('ends_at').limit(100),
    canSeeSales ? supabase.rpc('get_lounge_report', { p_from: dayStart, p_to: dayEnd }) : Promise.resolve({ data: [], error: null }),
  ])
  const { data: lowStockData } = settings?.low_stock_alert_enabled && canSeeInventory
    ? await supabase.rpc('get_low_stock_count')
    : { data: 0 }
  const canReviewBusiness = ['owner', 'admin'].includes(profile.role)
  const [attendanceQueue, paybillQueue, c2bQueue, unreadQueue] = canReviewBusiness
    ? await Promise.all([
      supabase.from('attendance_exceptions').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('paybill_claims').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('mpesa_c2b_transactions').select('id', { count: 'exact', head: true }).in('status', ['unmatched', 'matched', 'ambiguous']),
      supabase.from('staff_notifications').select('id', { count: 'exact', head: true }).is('read_at', null),
    ])
    : [{ count: 0, error: null }, { count: 0, error: null }, { count: 0, error: null }, { count: 0, error: null }]
  const rows = (sessions ?? []) as LoungeSession[]
  const overdue = rows.filter((session) => session.timing_status === 'overdue').length
  const endingSoon = rows.filter((session) => session.timing_status === 'ending_soon').length
  const shiftRevenue = Number(paidToday?.[0]?.gross_sales_cents ?? 0)
  const money = new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', maximumFractionDigits: 0 })
  const canOperate = ['owner', 'admin', 'manager', 'cashier'].includes(profile.role)
  const lowStockCount = Number(lowStockData ?? 0)
  const sessionAlertMinutes = settings?.session_alert_minutes ?? 10
  const dateLabel = new Intl.DateTimeFormat('en-KE', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'Africa/Nairobi' }).format(new Date()).toUpperCase()

  return <AppShell profile={profile}>
    <main className="content" id="overview">
      <header className="topbar">
        <div><p className="eyebrow">OPERATIONS / OVERVIEW</p><h1>Good shift, {profile.display_name.split(' ')[0]} <span>✦</span></h1></div>
        <div className="live-pill"><i /> LIVE OPERATIONS</div>
      </header>
      <div className="date-strip">{dateLabel} <span>·</span> LOUNGE OPERATIONS</div>
      <section className={`stats ${canSeeSales ? '' : 'staff-stats'}`} aria-label="Live operations summary">
        <article><span>ACTIVE SESSIONS</span><strong>{rows.length.toString().padStart(2, '0')}</strong><small>Across the lounge</small><b className="stat-icon">◷</b></article>
        <article><span>ENDING SOON</span><strong>{endingSoon.toString().padStart(2, '0')}</strong><small>Next {sessionAlertMinutes} minutes</small><b className="stat-icon warn">⌛</b></article>
        <article><span>OVERDUE</span><strong>{overdue.toString().padStart(2, '0')}</strong><small>Need attention</small><b className="stat-icon danger">!</b></article>
        {canSeeSales && <article><span>PAID TODAY</span><strong className="metric-money">{money.format(shiftRevenue / 100)}</strong><small>Recorded by authorized staff</small><b className="stat-icon report">↗</b></article>}
        {settings?.low_stock_alert_enabled && canSeeInventory && <article><span>LOW STOCK</span><strong>{lowStockCount.toString().padStart(2, '0')}</strong><small>At or below reorder level</small><b className="stat-icon warn">◈</b></article>}
      </section>
      {salesError && canSeeSales && <p className="notice error">Today’s sales summary could not be loaded. Open Reports to review the reporting status.</p>}
      <section className="panel" id="sessions">
        <div className="panel-head"><div><p className="eyebrow">RIGHT NOW</p><h2>Live sessions <span className="count">{rows.length}</span></h2></div>{canOperate && <Link href="/sessions#new-session" className="primary-button">＋ Start session</Link>}</div>
        {error ? <p className="notice error">Could not load sessions. Check the migration status and your staff permissions.</p> : rows.length === 0 ? <div className="empty"><span>◷</span><b>No active sessions yet</b><p>Start a session to see its timer and status here.</p></div> : null}
        {!error && <div className="session-list">{rows.slice(0, 5).map((session) => <article className="session-row" key={session.id}>
          <span className="table-icon">{session.table_label}</span>
          <span className="session-name">
            <b>{session.option_name}</b>
            <SessionTimer endsAt={session.ends_at} warningMinutes={sessionAlertMinutes} />
          </span>
          <span className={`state ${session.timing_status}`}>{session.timing_status.replace('_', ' ')}</span>
        </article>)}</div>}
        {!canOperate && <p className="notice role-notice">Your attendant account can view assigned sessions. Owner, admin, or cashier access is required to start or change a session.</p>}
      </section>
      <section className="quick-links" aria-label="Operations shortcuts">
        {canSeeSales && <Link href="/orders"><span>▤</span><b>Record an order</b><small>Link a charge to a table</small></Link>}
        <Link href={profile.role === 'flavor_specialist' ? '/flavors' : '/inventory'}><span>◈</span><b>{profile.role === 'flavor_specialist' ? 'Flavor tasks' : 'Update stock'}</b><small>{profile.role === 'flavor_specialist' ? 'Prepare assigned flavor orders' : 'Log a stock movement'}</small></Link>
        <Link href="/attendance"><span>◉</span><b>Attendance</b><small>Check in or review a shift</small></Link>
        {canSeeSales && <Link href="/reports"><span>▥</span><b>View reports</b><small>Review daily totals</small></Link>}
      </section>
      {canReviewBusiness && <section className="owner-console">
        {[attendanceQueue, paybillQueue, c2bQueue, unreadQueue].some((result) => result.error) && <p className="notice error">Some owner review counts could not be loaded. Open the related pages to check for pending work.</p>}
        <div className="panel-head"><div><p className="eyebrow">OWNER WORKSPACE</p><h2>Business overview</h2></div><Link href="/integrations" className="text-link">Integration setup →</Link></div>
        <div className="owner-links">
          <Link href="/reports"><span>↗</span><b>Financial reports</b><small>Sales, expenses, and operating result</small></Link>
          <Link href="/admin#staff-accounts"><span>♙</span><b>Staff management</b><small>Roles, invites, and account access</small></Link>
          <Link href="/attendance"><span>◉</span><b>Attendance & exceptions</b><small>{attendanceQueue.count ?? 0} requests waiting for review</small></Link>
          <Link href="/notifications"><span>♢</span><b>Alerts</b><small>{unreadQueue.count ?? 0} unread operational alerts</small></Link>
          <Link href="/orders#payment-reconciliation"><span>⇄</span><b>Payment reconciliation</b><small>{(paybillQueue.count ?? 0) + (c2bQueue.count ?? 0)} claims or confirmations to review</small></Link>
          <Link href="/admin#recent-audit"><span>▤</span><b>Audit log</b><small>Recent staff and operations changes</small></Link>
          <Link href="/inventory"><span>◈</span><b>Inventory</b><small>Catalogue, stock, and reorder levels</small></Link>
          <Link href="/flavors"><span>❋</span><b>Flavor operations</b><small>Assignments and preparation status</small></Link>
          <Link href="/admin#business-settings"><span>⚙</span><b>Business settings</b><small>Venue, attendance, and session rules</small></Link>
        </div>
      </section>}
      <p className="footnote">Session timing comes from PostgreSQL and refreshes every 30 seconds.</p>
    </main>
  </AppShell>
}
