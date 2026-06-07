import { useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import type { Member } from '@shared/types'
import { api } from '../api'

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const first = parts[0][0]
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return (first + last).toUpperCase()
}

export function Avatar({
  member,
  size = 96,
  editable = false,
  onPick,
}: {
  member: Member
  size?: number
  editable?: boolean
  onPick?: (file: File) => Promise<void> | void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file
    if (!file || !onPick) return
    setBusy(true)
    try {
      await onPick(file)
    } finally {
      setBusy(false)
    }
  }

  const className =
    'avatar' +
    (editable ? ' editable' : '') +
    (member.deathDate ? ' deceased' : '')

  return (
    <div
      className={className}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
      onClick={editable ? () => inputRef.current?.click() : undefined}
      role={editable ? 'button' : undefined}
      title={editable ? 'Click to upload a photo' : member.name}
    >
      {member.photoId ? (
        <img src={api.photoUrl(member.photoId)} alt={member.name} draggable={false} />
      ) : (
        <span className="avatar-initials">{initials(member.name)}</span>
      )}
      {editable && <span className="avatar-overlay">{busy ? '…' : '📷'}</span>}
      {editable && (
        <input ref={inputRef} type="file" accept="image/*" hidden onChange={handleFile} />
      )}
    </div>
  )
}
