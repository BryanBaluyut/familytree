import { useState } from 'react'
import type { ID } from '@shared/types'
import { api } from '../api'
import { useTree } from '../hooks/useTree'
import { TreeView } from '../tree/TreeView'
import { BackupControls } from './BackupControls'
import { ChangeLogPanel } from './ChangeLogPanel'
import { MemberEditor } from './MemberEditor'
import { MemberList } from './MemberList'
import { SaveIndicator } from './SaveIndicator'

export function FamilyTreeApp({
  identity,
  onChangeIdentity,
  onUnauthorized,
}: {
  identity: string
  onChangeIdentity: () => void
  onUnauthorized: () => void
}) {
  const store = useTree(onUnauthorized)
  const [selectedId, setSelectedId] = useState<ID | null>(null)
  const [showHistory, setShowHistory] = useState(false)

  async function logout() {
    await api.logout()
    onUnauthorized()
  }

  if (store.loading) {
    return (
      <div className="splash">
        <div className="spinner" />
        Loading your family tree…
      </div>
    )
  }

  if (store.loadError || !store.tree) {
    return (
      <div className="splash error">
        <p>Couldn't load the tree: {store.loadError}</p>
        <button className="btn" onClick={store.reload}>
          Retry
        </button>
      </div>
    )
  }

  const tree = store.tree

  function addMember(name: string) {
    const created = store.addMember(name)
    if (created) setSelectedId(created.id)
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <span className="brand-logo">🌳</span>
          <strong>Family Tree</strong>
        </div>
        <div className="header-right">
          <SaveIndicator status={store.saveStatus} />
          <button className="btn ghost small" onClick={() => setShowHistory(true)}>
            History
          </button>
          <BackupControls store={store} />
          <span className="identity" title="You're editing as this name">
            <span className="identity-name">{identity}</span>
            <button className="link-btn" onClick={onChangeIdentity}>
              change
            </button>
          </span>
          <button className="btn ghost" onClick={() => void logout()}>
            Log out
          </button>
        </div>
      </header>

      <div className="app-body">
        <aside className="app-sidebar">
          <MemberList
            tree={tree}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onAdd={addMember}
          />
        </aside>

        <main className="app-canvas">
          <TreeView tree={tree} selectedId={selectedId} onSelect={setSelectedId} />
        </main>

        {selectedId && (
          <MemberEditor
            store={store}
            memberId={selectedId}
            onClose={() => setSelectedId(null)}
            onSelect={setSelectedId}
          />
        )}
      </div>

      {showHistory && (
        <ChangeLogPanel onClose={() => setShowHistory(false)} onUnauthorized={onUnauthorized} />
      )}
    </div>
  )
}
