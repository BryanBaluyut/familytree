import { useCallback, useEffect, useState } from 'react'
import { api } from './api'
import { FamilyTreeApp } from './components/FamilyTreeApp'
import { PasswordGate } from './components/PasswordGate'
import { Presentation } from './components/Presentation'
import { WhoAreYou } from './components/WhoAreYou'

interface Auth {
  authed: boolean
  name?: string
}

export default function App() {
  // null = still checking the existing session.
  const [auth, setAuth] = useState<Auth | null>(null)
  const [path, setPath] = useState(() => window.location.pathname)

  useEffect(() => {
    api
      .session()
      .then((s) => setAuth({ authed: s.authed, name: s.name ?? undefined }))
      .catch(() => setAuth({ authed: false }))
  }, [])

  // The Netlify SPA fallback serves index.html for any path, so routing is just
  // pathname + history. Only two screens, which doesn't warrant a router.
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const navigate = useCallback((to: string) => {
    window.history.pushState({}, '', to)
    setPath(to)
  }, [])

  const onUnauthorized = useCallback(() => setAuth({ authed: false }), [])

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

  // Checked before the identity prompt: the slideshow is read-only, so there's
  // no editor name to attribute changes to.
  if (path === '/present') {
    return <Presentation onExit={() => navigate('/')} onUnauthorized={onUnauthorized} />
  }

  if (!auth.name) {
    return <WhoAreYou onDone={(name) => setAuth({ authed: true, name })} />
  }

  return (
    <FamilyTreeApp
      identity={auth.name}
      onChangeIdentity={() => setAuth({ authed: true, name: undefined })}
      onUnauthorized={onUnauthorized}
      onPresent={() => navigate('/present')}
    />
  )
}
