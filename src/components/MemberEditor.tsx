import { useState } from 'react'
import type { ReactNode } from 'react'
import type {
  Gender,
  ID,
  Member,
  ParentType,
  PartnerStatus,
  Tree,
} from '@shared/types'
import { PARENT_TYPE_LABELS, PARTNER_STATUS_LABELS } from '@shared/types'
import { childrenOf, memberById, parentsOf, partnersOf } from '../lib/relationships'
import type { TreeStore } from '../hooks/useTree'
import { Avatar } from './Avatar'
import { SortableList } from './SortableList'

export function MemberEditor({
  store,
  memberId,
  onClose,
  onSelect,
}: {
  store: TreeStore
  memberId: ID
  onClose: () => void
  onSelect: (id: ID) => void
}) {
  const tree = store.tree
  const member = tree ? memberById(tree, memberId) : undefined

  if (!tree || !member) return null

  const patch = (p: Partial<Member>) => store.updateMember({ ...member, ...p })

  const partners = partnersOf(tree, member.id)
  const parents = parentsOf(tree, member.id)
  const children = childrenOf(tree, member.id)

  function handleDelete() {
    if (
      window.confirm(
        `Delete ${member!.name}? This also removes their links (relatives stay).`,
      )
    ) {
      store.deleteMember(member!.id)
      onClose()
    }
  }

  return (
    <aside className="editor">
      <div className="editor-bar">
        <span className="muted">Edit person</span>
        <button className="icon-btn" onClick={onClose} title="Close">
          ✕
        </button>
      </div>

      <div className="editor-head">
        <Avatar
          member={member}
          size={88}
          editable
          onPick={(file) => store.setPhoto(member.id, file)}
        />
        <div className="editor-head-fields">
          <input
            className="input name-input"
            value={member.name}
            placeholder="Full name"
            onChange={(e) => patch({ name: e.target.value })}
          />
          {member.photoId && (
            <button className="link-btn" onClick={() => void store.clearPhoto(member.id)}>
              Remove photo
            </button>
          )}
        </div>
      </div>

      <label className="field">
        <span>Gender</span>
        <select
          className="input"
          value={member.gender ?? 'unknown'}
          onChange={(e) => patch({ gender: e.target.value as Gender })}
        >
          <option value="unknown">—</option>
          <option value="female">Female</option>
          <option value="male">Male</option>
          <option value="other">Other</option>
        </select>
      </label>

      <div className="field-row">
        <label className="field">
          <span>Born</span>
          <input
            type="date"
            className="input"
            value={member.birthDate ?? ''}
            onChange={(e) => patch({ birthDate: e.target.value || undefined })}
          />
        </label>
        <label className="field">
          <span>Died</span>
          <input
            type="date"
            className="input"
            value={member.deathDate ?? ''}
            onChange={(e) => patch({ deathDate: e.target.value || undefined })}
          />
        </label>
      </div>

      <label className="field">
        <span>Notes</span>
        <textarea
          className="input"
          rows={3}
          value={member.notes ?? ''}
          onChange={(e) => patch({ notes: e.target.value || undefined })}
        />
      </label>

      <RelationSection title="Partners" hint={partners.length > 1 ? 'drag to reorder · earliest on the left' : undefined}>
        <SortableList
          onReorder={(ids) => store.reorderPartners(member.id, ids)}
          items={partners
            .map(({ partnership, otherId }) => {
              const other = memberById(tree, otherId)
              if (!other) return null
              return {
                id: otherId,
                content: (
                  <>
                    <PersonButton name={other.name} memberId={otherId} tree={tree} onSelect={onSelect} />
                    <select
                      className="input small"
                      value={partnership.status}
                      onChange={(e) =>
                        store.setPartnerStatus(partnership.id, e.target.value as PartnerStatus)
                      }
                    >
                      {Object.entries(PARTNER_STATUS_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <button
                      className="icon-btn"
                      title="Remove partner link"
                      onClick={() => store.unlinkPartner(partnership.id)}
                    >
                      ✕
                    </button>
                  </>
                ),
              }
            })
            .filter((it): it is { id: string; content: JSX.Element } => it !== null)}
        />
        <AddRelation
          tree={tree}
          placeholder="new partner"
          exclude={[member.id, ...partners.map((p) => p.otherId)]}
          onPickExisting={(id) => store.linkPartner(member.id, id)}
          onCreateNew={(name) => {
            const created = store.addMember(name)
            if (created) store.linkPartner(member.id, created.id)
          }}
        />
      </RelationSection>

      <RelationSection title="Parents">
        {parents.map(({ parentage, parentId }) => {
          const parent = memberById(tree, parentId)
          if (!parent) return null
          return (
            <div className="relation-row" key={parentage.id}>
              <PersonButton name={parent.name} memberId={parentId} tree={tree} onSelect={onSelect} />
              <select
                className="input small"
                value={parentage.type}
                onChange={(e) =>
                  store.setParentageType(parentage.id, e.target.value as ParentType)
                }
              >
                {Object.entries(PARENT_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <button
                className="icon-btn"
                title="Remove parent link"
                onClick={() => store.unlinkParentage(parentage.id)}
              >
                ✕
              </button>
            </div>
          )
        })}
        <AddRelation
          tree={tree}
          placeholder="new parent"
          exclude={[member.id, ...parents.map((p) => p.parentId)]}
          onPickExisting={(id) => store.linkParent(member.id, id)}
          onCreateNew={(name) => {
            const created = store.addMember(name)
            if (created) store.linkParent(member.id, created.id)
          }}
        />
      </RelationSection>

      <RelationSection title="Children" hint={children.length > 1 ? 'drag to reorder · firstborn on the left' : undefined}>
        <SortableList
          onReorder={(ids) => store.reorderChildren(member.id, ids)}
          items={children
            .map(({ parentage, childId }) => {
              const child = memberById(tree, childId)
              if (!child) return null
              return {
                id: childId,
                content: (
                  <>
                    <PersonButton name={child.name} memberId={childId} tree={tree} onSelect={onSelect} />
                    <select
                      className="input small"
                      value={parentage.type}
                      onChange={(e) =>
                        store.setParentageType(parentage.id, e.target.value as ParentType)
                      }
                    >
                      {Object.entries(PARENT_TYPE_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <button
                      className="icon-btn"
                      title="Remove child link"
                      onClick={() => store.unlinkParentage(parentage.id)}
                    >
                      ✕
                    </button>
                  </>
                ),
              }
            })
            .filter((it): it is { id: string; content: JSX.Element } => it !== null)}
        />
        <AddRelation
          tree={tree}
          placeholder="new child"
          exclude={[member.id, ...children.map((c) => c.childId)]}
          onPickExisting={(id) => store.linkChild(member.id, id)}
          onCreateNew={(name) => {
            const created = store.addMember(name)
            if (created) store.linkChild(member.id, created.id)
          }}
        />
      </RelationSection>

      <button className="btn danger delete-btn" onClick={handleDelete}>
        Delete person
      </button>
    </aside>
  )
}

function RelationSection({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: ReactNode
}) {
  return (
    <section className="relation-section">
      <h3>
        {title}
        {hint && <span className="relation-hint muted"> · {hint}</span>}
      </h3>
      {children}
    </section>
  )
}

function PersonButton({
  name,
  memberId,
  tree,
  onSelect,
}: {
  name: string
  memberId: ID
  tree: Tree
  onSelect: (id: ID) => void
}) {
  const member = memberById(tree, memberId)
  return (
    <button className="relation-person" onClick={() => onSelect(memberId)} title={`Open ${name}`}>
      {member && <Avatar member={member} size={30} />}
      <span>{name}</span>
    </button>
  )
}

function AddRelation({
  tree,
  exclude,
  placeholder,
  onPickExisting,
  onCreateNew,
}: {
  tree: Tree
  exclude: ID[]
  placeholder: string
  onPickExisting: (id: ID) => void
  onCreateNew: (name: string) => void
}) {
  const [selected, setSelected] = useState('')
  const [name, setName] = useState('')

  const candidates = tree.members
    .filter((m) => !exclude.includes(m.id))
    .sort((a, b) => a.name.localeCompare(b.name))

  function add() {
    const trimmed = name.trim()
    if (trimmed) {
      onCreateNew(trimmed)
    } else if (selected) {
      onPickExisting(selected)
    }
    setName('')
    setSelected('')
  }

  return (
    <div className="add-relation">
      <select
        className="input small"
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
      >
        <option value="">Link existing…</option>
        {candidates.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
      <span className="or muted">or</span>
      <input
        className="input small"
        placeholder={placeholder}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <button className="btn" onClick={add} disabled={!name.trim() && !selected}>
        Add
      </button>
    </div>
  )
}
