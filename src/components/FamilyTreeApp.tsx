import { useEffect, useState } from 'react'
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

  const { undo, redo } = store

  // Keyboard: Ctrl/Cmd+Z = undo, Ctrl/Cmd+Shift+Z (or Ctrl+Y) = redo.
  // Ignored while typing in a field, so text-editing undo still works there.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey)) return
      const el = e.target as HTMLElement | null
      const tag = el?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return
      const key = e.key.toLowerCase()
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

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

  async function handleRestore(version: number) {
    await store.restore(version)
    setSelectedId(null) // a restored member may no longer exist
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
          <div className="undo-redo">
            <button
              className="icon-btn"
              title="Undo (Ctrl/⌘+Z)"
              onClick={undo}
              disabled={!store.canUndo}
            >
              ↶
            </button>
            <button
              className="icon-btn"
              title="Redo (Ctrl/⌘+Shift+Z)"
              onClick={redo}
              disabled={!store.canRedo}
            >
              ↷
            </button>
          </div>
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
        <ChangeLogPanel
          currentVersion={tree.version}
          onRestore={handleRestore}
          onClose={() => setShowHistory(false)}
          onUnauthorized={onUnauthorized}
        />
      )}
    </div>
  )
}
