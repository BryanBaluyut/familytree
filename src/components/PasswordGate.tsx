import { useState } from 'react'
import type { FormEvent } from 'react'
import { api } from '../api'

export function PasswordGate({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(false)
    try {
      const ok = await api.login(password)
      if (ok) onSuccess()
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
        <div className="gate-logo">🌳</div>
        <h1>Family Tree</h1>
        <p className="muted">Enter the family password to continue.</p>
        <input
          type="password"
          className={'input' + (error ? ' input-error' : '')}
          value={password}
          onChange={(e) => {
            setPassword(e.target.value)
            setError(false)
          }}
          placeholder="Password"
          autoFocus
        />
        {error && <div className="gate-error">Incorrect password — try again.</div>}
        <button className="btn primary" disabled={busy || !password}>
          {busy ? 'Checking…' : 'Enter'}
        </button>
      </form>
    </div>
  )
}
