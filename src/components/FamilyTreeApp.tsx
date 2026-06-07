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
  const [sidebarOpen, setSidebarOpen] = useState(false)

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

  // On phones the sidebar is a drawer; selecting/adding should close it.
  function selectMember(id: ID) {
    setSelectedId(id)
    setSidebarOpen(false)
  }

  function addMember(name: string) {
    const created = store.addMember(name)
    if (created) selectMember(created.id)
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="header-left">
          <button
            className="icon-btn menu-btn"
            onClick={() => setSidebarOpen(true)}
            aria-label="Show people"
            title="People"
          >
            ☰
          </button>
          <div className="brand">
            <span className="brand-logo">🌳</span>
            <strong className="brand-text">Family Tree</strong>
          </div>
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
        {sidebarOpen && (
          <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />
        )}
        <aside className={'app-sidebar' + (sidebarOpen ? ' open' : '')}>
          <MemberList
            tree={tree}
            selectedId={selectedId}
            onSelect={selectMember}
            onAdd={addMember}
          />
          {/* Controls that live in the header on desktop, surfaced here on mobile. */}
          <div className="sidebar-mobile-extra">
            <BackupControls store={store} />
            <div className="identity-row">
              You: <strong>{identity}</strong>{' '}
              <button className="link-btn" onClick={onChangeIdentity}>
                change
              </button>
            </div>
            <button className="btn ghost" onClick={() => void logout()}>
              Log out
            </button>
          </div>
        </aside>

        <main className="app-canvas">
          <TreeView tree={tree} selectedId={selectedId} onSelect={selectMember} />
        </main>

        {selectedId && (
          <MemberEditor
            store={store}
            memberId={selectedId}
            onClose={() => setSelectedId(null)}
            onSelect={selectMember}
          />
        )}
      </div>

      {showHistory && (
        <ChangeLogPanel onClose={() => setShowHistory(false)} onUnauthorized={onUnauthorized} />
      )}
    </div>
  )
}
