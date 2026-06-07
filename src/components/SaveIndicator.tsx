import type { SaveStatus } from '../hooks/useTree'

const TEXT: Record<SaveStatus, string> = {
  idle: '',
  saving: 'Saving…',
  saved: 'All changes saved',
  error: 'Save failed — will retry on next edit',
}

export function SaveIndicator({ status }: { status: SaveStatus }) {
  const text = TEXT[status]
  if (!text) return null
  return <span className={`save-indicator ${status}`}>{text}</span>
}
