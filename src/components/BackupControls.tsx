import { useRef } from 'react'
import type { ChangeEvent } from 'react'
import type { Tree } from '@shared/types'
import type { TreeStore } from '../hooks/useTree'

function download(tree: Tree) {
  const payload = {
    members: tree.members,
    partnerships: tree.partnerships,
    parentages: tree.parentages,
    exportedAt: new Date().toISOString(),
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `family-tree-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function isValidImport(
  value: unknown,
): value is Pick<Tree, 'members' | 'partnerships' | 'parentages'> {
  if (!value || typeof value !== 'object') return false
  const o = value as Record<string, unknown>
  return (
    Array.isArray(o.members) &&
    Array.isArray(o.partnerships) &&
    Array.isArray(o.parentages)
  )
}

export function BackupControls({ store }: { store: TreeStore }) {
  const fileRef = useRef<HTMLInputElement>(null)

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    let parsed: unknown
    try {
      parsed = JSON.parse(await file.text())
    } catch {
      window.alert('That file is not valid JSON.')
      return
    }
    if (!isValidImport(parsed)) {
      window.alert('That file does not look like a family-tree backup.')
      return
    }
    if (
      window.confirm(
        `Replace the current tree with ${parsed.members.length} people from this file? ` +
          `This overwrites what is there now.`,
      )
    ) {
      store.replaceTree(parsed)
    }
  }

  return (
    <div className="backup-controls">
      <button
        className="btn ghost small"
        onClick={() => store.tree && download(store.tree)}
        title="Download a JSON backup"
      >
        Export
      </button>
      <button
        className="btn ghost small"
        onClick={() => fileRef.current?.click()}
        title="Restore from a JSON backup"
      >
        Import
      </button>
      <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={onFile} />
    </div>
  )
}
