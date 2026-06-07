import { useEffect, useState } from 'react'
import { api } from './api'
import { FamilyTreeApp } from './components/FamilyTreeApp'
import { PasswordGate } from './components/PasswordGate'

export default function App() {
  // null = still checking the existing session.
  const [authed, setAuthed] = useState<boolean | null>(null)

  useEffect(() => {
    api
      .session()
      .then(setAuthed)
      .catch(() => setAuthed(false))
  }, [])

  if (authed === null) {
    return (
      <div className="splash">
        <div className="spinner" />
      </div>
    )
  }

  if (!authed) {
    return <PasswordGate onSuccess={() => setAuthed(true)} />
  }

  return <FamilyTreeApp onUnauthorized={() => setAuthed(false)} />
}
