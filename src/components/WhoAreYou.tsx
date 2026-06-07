import { useState } from 'react'
import type { FormEvent } from 'react'
import { api } from '../api'

// Shown after the shared-password login: capture who is editing so changes
// can be attributed in the history log.
export function WhoAreYou({ onDone }: { onDone: (name: string) => void }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    setBusy(true)
    setError(false)
    try {
      const ok = await api.setIdentity(trimmed)
      if (ok) onDone(trimmed)
      else setError(true)
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="gate">
      <form className="gate-card" onSubmit={submit}>
        <div className="gate-logo">👋</div>
        <h1>Who's editing?</h1>
        <p className="muted">
          Your name is shown in the change history, so the family knows who made each edit.
        </p>
        <input
          className={'input' + (error ? ' input-error' : '')}
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setError(false)
          }}
          placeholder="Your name"
          autoFocus
          maxLength={80}
        />
        {error && <div className="gate-error">Couldn't save that — please try again.</div>}
        <button className="btn primary" disabled={busy || !name.trim()}>
          {busy ? 'Saving…' : 'Continue'}
        </button>
      </form>
    </div>
  )
}
