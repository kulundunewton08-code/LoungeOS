'use client'

import { useEffect, useState } from 'react'
import { getSessionState } from '@/lib/session/session-status'

type Props = {
  endsAt: string
  warningMinutes: number
  /** Optional pre-formatted "HH:MM" from the server. If provided, used for the SSR-safe first paint. */
  endsAtLabel?: string
}

const NAIROBI_TZ = 'Africa/Nairobi'

function formatEndsAtLabel(endsAt: string): string {
  try {
    return new Date(endsAt).toLocaleTimeString('en-KE', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: NAIROBI_TZ,
    })
  } catch {
    return '—'
  }
}

function formatOverdueDuration(overdueMs: number): string {
  const totalMinutes = Math.floor(overdueMs / 60_000)
  if (totalMinutes < 1) return 'LESS THAN A MINUTE'
  if (totalMinutes < 60) return `${totalMinutes} MINUTE${totalMinutes === 1 ? '' : 'S'}`
  const hours = Math.floor(totalMinutes / 60)
  const mins = totalMinutes % 60
  return mins === 0 ? `${hours} HOUR${hours === 1 ? '' : 'S'}` : `${hours}H ${mins}M`
}

function formatRemaining(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export default function SessionTimer({ endsAt, warningMinutes, endsAtLabel }: Props) {
  const [nowMs, setNowMs] = useState<number | null>(null)

  useEffect(() => {
    setNowMs(Date.now())
    const id = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [endsAt])

  const endMs = Date.parse(endsAt)
  const staticLabel = endsAtLabel ?? formatEndsAtLabel(endsAt)

  // SSR + first client paint: deterministic static label. Avoids hydration mismatch.
  if (nowMs === null || !Number.isFinite(endMs)) {
    return (
      <span className="session-timer session-timer-static" aria-label={`Session ends at ${staticLabel}`}>
        Ends {staticLabel}
      </span>
    )
  }

  const state = getSessionState(endsAt, nowMs, warningMinutes)
  const remainingMs = endMs - nowMs

  if (state === 'overdue') {
    return (
      <span className="session-timer session-timer-overdue" role="timer" aria-live="polite">
        OVERDUE BY {formatOverdueDuration(Math.abs(remainingMs))}
      </span>
    )
  }

  if (state === 'ending-soon') {
    return (
      <span className="session-timer session-timer-ending-soon" role="timer" aria-live="polite">
        Ends {staticLabel} · {formatRemaining(remainingMs)} left
      </span>
    )
  }

  return (
    <span className="session-timer session-timer-active" role="timer" aria-live="polite">
      Ends {staticLabel} · {formatRemaining(remainingMs)} left
    </span>
  )
}
