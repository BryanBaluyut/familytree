// Computes human-readable change-log entries by diffing the previous tree
// against the newly-saved tree. Runs server-side so logging can't be skipped.

import type { ChangeLogEntry, Member, Tree } from '../../../shared/types'

type IdGen = () => string

const BULK_THRESHOLD = 12 // collapse very large diffs (e.g. an import) into one entry

export function computeChanges(
  oldTree: Tree,
  newTree: Tree,
  who: string,
  at: string,
  newId: IdGen,
): ChangeLogEntry[] {
  const entries: ChangeLogEntry[] = []
  const add = (action: ChangeLogEntry['action'], summary: string, targetId?: string) =>
    entries.push({ id: newId(), at, who, action, summary, targetId })

  // Name lookup spanning both trees so removed members still resolve.
  const names = new Map<string, string>()
  for (const m of oldTree.members) names.set(m.id, m.name)
  for (const m of newTree.members) names.set(m.id, m.name)
  const nameOf = (id: string) => names.get(id) ?? 'someone'

  const oldMembers = new Map(oldTree.members.map((m) => [m.id, m]))
  const newMembers = new Map(newTree.members.map((m) => [m.id, m]))
  for (const m of newTree.members) {
    const prev = oldMembers.get(m.id)
    if (!prev) add('add', `Added ${m.name}`, m.id)
    else {
      const summary = memberChange(prev, m)
      if (summary) add('edit', summary, m.id)
    }
  }
  for (const m of oldTree.members) {
    if (!newMembers.has(m.id)) add('remove', `Removed ${m.name}`, m.id)
  }

  const oldParts = new Map(oldTree.partnerships.map((p) => [p.id, p]))
  const newParts = new Map(newTree.partnerships.map((p) => [p.id, p]))
  for (const p of newTree.partnerships) {
    const prev = oldParts.get(p.id)
    if (!prev) add('link', `Linked ${nameOf(p.a)} & ${nameOf(p.b)} (${p.status})`, p.id)
    else if (prev.status !== p.status)
      add('relink', `Marked ${nameOf(p.a)} & ${nameOf(p.b)} as ${p.status}`, p.id)
  }
  for (const p of oldTree.partnerships) {
    if (!newParts.has(p.id)) add('unlink', `Unlinked ${nameOf(p.a)} & ${nameOf(p.b)}`, p.id)
  }

  const oldRels = new Map(oldTree.parentages.map((r) => [r.id, r]))
  const newRels = new Map(newTree.parentages.map((r) => [r.id, r]))
  for (const r of newTree.parentages) {
    const prev = oldRels.get(r.id)
    if (!prev) add('link', `Added ${nameOf(r.child)} as child of ${nameOf(r.parent)}`, r.id)
    else if (prev.type !== r.type)
      add('relink', `Changed ${nameOf(r.child)}/${nameOf(r.parent)} link to ${r.type}`, r.id)
  }
  for (const r of oldTree.parentages) {
    if (!newRels.has(r.id))
      add('unlink', `Removed ${nameOf(r.child)} as child of ${nameOf(r.parent)}`, r.id)
  }

  if (entries.length > BULK_THRESHOLD) {
    const added = entries.filter((e) => e.action === 'add').length
    const removed = entries.filter((e) => e.action === 'remove').length
    const bits = [`${entries.length} updates`]
    if (added) bits.push(`${added} added`)
    if (removed) bits.push(`${removed} removed`)
    return [{ id: newId(), at, who, action: 'bulk', summary: `Made bulk changes (${bits.join(', ')})` }]
  }

  return entries
}

function memberChange(prev: Member, next: Member): string | null {
  if (prev.name !== next.name) return `Renamed "${prev.name}" to "${next.name}"`
  if ((prev.photoId || '') !== (next.photoId || ''))
    return next.photoId ? `Updated ${next.name}'s photo` : `Removed ${next.name}'s photo`
  const fields: string[] = []
  if ((prev.gender || '') !== (next.gender || '')) fields.push('gender')
  if ((prev.birthDate || '') !== (next.birthDate || '')) fields.push('birth date')
  if ((prev.deathDate || '') !== (next.deathDate || '')) fields.push('death date')
  if ((prev.notes || '') !== (next.notes || '')) fields.push('notes')
  if (fields.length) return `Edited ${next.name} (${fields.join(', ')})`
  return null
}
