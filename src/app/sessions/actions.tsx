'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import SessionTimer from '@/components/session-timer'

type Option = { id: string; name: string; duration_minutes: number }
type Session = { id: string; table_label: string; option_name: string; ends_at: string; timing_status: string }

export default function SessionActions({
  options,
  sessions,
  canOperate,
  warningMinutes = 10,
}: {
  options: Option[]
  sessions: Session[]
  canOperate: boolean
  warningMinutes?: number
}) {
  const router = useRouter()
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const timer = window.setInterval(() => router.refresh(), 30_000)
    return () => window.clearInterval(timer)
  }, [router])

  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage('')
    const submittedForm = event.currentTarget
    const form = new FormData(submittedForm)
    const supabase = createClient()
    const { error } = await supabase.rpc('start_lounge_session', {
      p_table_label: String(form.get('table_label')),
      p_option_id: String(form.get('option_id')),
      p_assigned_attendant: form.get('attendant_id') ? String(form.get('attendant_id')) : null,
    })
    setBusy(false)
    if (error) { setMessage(error.message.includes('Insufficient permissions') ? 'Your role cannot start sessions.' : 'Could not start the session. Check the table label and selected option.'); return }
    submittedForm.reset()
    router.refresh()
  }

  async function updateSession(id: string, action: 'extend' | 'end') {
    setBusy(true); setMessage('')
    const supabase = createClient()
    const { error } = action === 'extend'
      ? await supabase.rpc('extend_lounge_session', { p_session_id: id, p_minutes: 15 })
      : await supabase.rpc('end_lounge_session', { p_session_id: id })
    setBusy(false)
    if (error) setMessage(action === 'extend' ? 'Could not extend this session. It may have expired or already ended.' : 'Could not end this session.')
    else router.refresh()
  }

  return <div className="actions-area">
    {message && <p className="notice error" role="status">{message}</p>}
    {canOperate && options.length > 0 && <form className="start-form" onSubmit={start}>
      <label>Table<input name="table_label" maxLength={32} placeholder="e.g. T-04" required /></label>
      <label>Shisha option<select name="option_id" required defaultValue=""><option value="" disabled>Select an option</option>{options.map((option) => <option key={option.id} value={option.id}>{option.name} · {option.duration_minutes} min</option>)}</select></label>
      <button className="primary-button" disabled={busy}>{busy ? 'Working…' : 'Start session'}</button>
    </form>}
    {canOperate && options.length === 0 && <p className="notice role-notice">No active shisha options are configured. Add an available option to the Supabase catalog before starting a session.</p>}
    <div className="session-list">{sessions.map((session) => <article className="session-row" key={session.id}>
      <span className="table-icon">{session.table_label}</span>
      <span className="session-name">
        <b>{session.option_name}</b>
        <SessionTimer endsAt={session.ends_at} warningMinutes={warningMinutes} />
      </span>
      <span className={`state ${session.timing_status}`}>{session.timing_status.replace('_', ' ')}</span>
      {canOperate && session.timing_status !== 'ended' && <div className="row-actions"><button onClick={() => updateSession(session.id, 'extend')} disabled={busy}>+15 min</button><button className="end-button" onClick={() => updateSession(session.id, 'end')} disabled={busy}>End</button></div>}
    </article>)}</div>
  </div>
}
