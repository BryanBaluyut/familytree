import { useCallback, useEffect, useState } from 'react'
import type { ChangeAction, ChangeLogEntry } from '@shared/types'
import { api, AuthError } from '../api'
import { relativeTime } from '../lib/time'

const ICON: Record<ChangeAction, string> = {
  add: '➕',
  remove: '🗑️',
  edit: '✏️',
  link: '🔗',
  unlink: '✂️',
  relink: '🔄',
  bulk: '📦',
}

export function ChangeLogPanel({
  onClose,
  onUnauthorized,
}: {
  onClose: () => void
  onUnauthorized: () => void
}) {
  const [entries, setEntries] = useState<ChangeLogEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      setEntries(await api.getChangelog())
    } catch (e) {
      if (e instanceof AuthError) onUnauthorized()
      else setError(e instanceof Error ? e.message : 'Failed to load history')
    }
  }, [onUnauthorized])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-bar">
          <h2>History</h2>
          <div className="drawer-actions">
            <button className="btn small" onClick={() => void load()}>
              Refresh
            </button>
            <button className="icon-btn" onClick={onClose} title="Close">
              ✕
            </button>
          </div>
        </div>
        <div className="drawer-body">
          {entries === null && !error && <div className="muted pad">Loading…</div>}
          {error && <div className="muted pad">{error}</div>}
          {entries && entries.length === 0 && (
            <div className="muted pad">No changes recorded yet.</div>
          )}
          {entries?.map((entry) => (
            <div className="log-entry" key={entry.id}>
              <span className="log-icon">{ICON[entry.action] ?? '•'}</span>
              <div className="log-body">
                <div className="log-summary">{entry.summary}</div>
                <div className="log-meta">
                  {entry.who} · {relativeTime(entry.at)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </aside>
    </div>
  )
}
