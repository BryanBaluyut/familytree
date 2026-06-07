import { useState } from 'react'
import type { FormEvent } from 'react'
import type { ID, Tree } from '@shared/types'
import { Avatar } from './Avatar'

export function MemberList({
  tree,
  selectedId,
  onSelect,
  onAdd,
}: {
  tree: Tree
  selectedId: ID | null
  onSelect: (id: ID) => void
  onAdd: (name: string) => void
}) {
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState('')

  const members = [...tree.members].sort((a, b) => a.name.localeCompare(b.name))
  const needle = query.trim().toLowerCase()
  const filtered = needle
    ? members.filter((m) => m.name.toLowerCase().includes(needle))
    : members

  function submitAdd(e: FormEvent) {
    e.preventDefault()
    const name = draft.trim()
    if (!name) return
    onAdd(name)
    setDraft('')
  }

  return (
    <div className="member-list">
      <form className="add-row" onSubmit={submitAdd}>
        <input
          className="input"
          placeholder="Add a person…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button className="btn primary" disabled={!draft.trim()} title="Add person">
          +
        </button>
      </form>

      <input
        className="input search"
        placeholder="Search…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="member-scroll">
        {filtered.length === 0 && (
          <div className="empty muted">
            {tree.members.length === 0 ? 'No people yet — add one above.' : 'No matches.'}
          </div>
        )}
        {filtered.map((m) => (
          <button
            key={m.id}
            className={'member-row' + (m.id === selectedId ? ' active' : '')}
            onClick={() => onSelect(m.id)}
          >
            <Avatar member={m} size={36} />
            <span className="member-row-name">{m.name}</span>
          </button>
        ))}
      </div>

      <div className="list-footer muted">
        {tree.members.length} {tree.members.length === 1 ? 'person' : 'people'}
      </div>
    </div>
  )
}
