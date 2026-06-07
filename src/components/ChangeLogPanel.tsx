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
  restore: '⟲',
}

export function ChangeLogPanel({
  currentVersion,
  onRestore,
  onClose,
  onUnauthorized,
}: {
  currentVersion: number
  onRestore: (version: number) => Promise<void>
  onClose: () => void
  onUnauthorized: () => void
}) {
  const [entries, setEntries] = useState<ChangeLogEntry[] | null>(null)
  const [restorable, setRestorable] = useState<Set<number>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [busyVersion, setBusyVersion] = useState<number | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [log, snaps] = await Promise.all([api.getChangelog(), api.getSnapshots()])
      setEntries(log)
      setRestorable(new Set(snaps.map((s) => s.version)))
    } catch (e) {
      if (e instanceof AuthError) onUnauthorized()
      else setError(e instanceof Error ? e.message : 'Failed to load history')
    }
  }, [onUnauthorized])

  useEffect(() => {
    void load()
  }, [load])

  async function handleRestore(entry: ChangeLogEntry) {
    if (entry.version == null) return
    const when = relativeTime(entry.at)
    if (
      !window.confirm(
        `Restore the tree to its state from ${when}?\n\n` +
          `Newer changes will be rolled back. You can undo this afterwards.`,
      )
    )
      return
    setBusyVersion(entry.version)
    try {
      await onRestore(entry.version)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Restore failed')
    } finally {
      setBusyVersion(null)
    }
  }

  // Offer Restore once per version (newest entry of that version), excluding the
  // current state and versions whose snapshot is no longer kept.
  const seen = new Set<number>()
  const rows = (entries ?? []).map((entry) => {
    let canRestore = false
    if (
      entry.version != null &&
      entry.version !== currentVersion &&
      restorable.has(entry.version) &&
      !seen.has(entry.version)
    ) {
      canRestore = true
      seen.add(entry.version)
    }
    return { entry, canRestore }
  })

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
          {rows.map(({ entry, canRestore }) => (
            <div className="log-entry" key={entry.id}>
              <span className="log-icon">{ICON[entry.action] ?? '•'}</span>
              <div className="log-body">
                <div className="log-summary">{entry.summary}</div>
                <div className="log-meta">
                  {entry.who} · {relativeTime(entry.at)}
                </div>
              </div>
              {canRestore && (
                <button
                  className="btn small log-restore"
                  disabled={busyVersion !== null}
                  onClick={() => void handleRestore(entry)}
                  title="Roll the tree back to this point"
                >
                  {busyVersion === entry.version ? '…' : 'Restore'}
                </button>
              )}
            </div>
          ))}
        </div>
      </aside>
    </div>
  )
}
