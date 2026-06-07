import { useEffect, useState } from 'react'
import { api } from './api'
import { FamilyTreeApp } from './components/FamilyTreeApp'
import { PasswordGate } from './components/PasswordGate'
import { WhoAreYou } from './components/WhoAreYou'

interface Auth {
  authed: boolean
  name?: string
}

export default function App() {
  // null = still checking the existing session.
  const [auth, setAuth] = useState<Auth | null>(null)

  useEffect(() => {
    api
      .session()
      .then((s) => setAuth({ authed: s.authed, name: s.name ?? undefined }))
      .catch(() => setAuth({ authed: false }))
  }, [])

  if (auth === null) {
    return (
      <div className="splash">
        <div className="spinner" />
      </div>
    )
  }

  if (!auth.authed) {
    return <PasswordGate onSuccess={() => setAuth({ authed: true })} />
  }

  if (!auth.name) {
    return <WhoAreYou onDone={(name) => setAuth({ authed: true, name })} />
  }

  return (
    <FamilyTreeApp
      identity={auth.name}
      onChangeIdentity={() => setAuth({ authed: true, name: undefined })}
      onUnauthorized={() => setAuth({ authed: false })}
    />
  )
}
