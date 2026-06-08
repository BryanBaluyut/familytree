// A tiny drag-to-reorder list. Uses Pointer Events (so it works with mouse AND
// touch) and a dedicated drag handle, so each row's own buttons/selects keep
// working. While dragging it reorders a local copy of the ids and reports the
// final order on drop; the parent persists it and re-renders in the new order.
//
// Move/up are listened for on `window` (not the handle) on purpose: dragging
// reorders the rows in the DOM, which would drop a pointer-capture on the moving
// handle and lose the drop. Global listeners are immune to that.

import { useEffect, useRef, useState } from 'react'
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from 'react'

export interface SortableItem {
  id: string
  content: ReactNode
}

export function SortableList({
  items,
  onReorder,
}: {
  items: SortableItem[]
  onReorder: (orderedIds: string[]) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const dragId = useRef<string | null>(null)
  const orderRef = useRef<string[]>([])
  const [order, setOrder] = useState<string[] | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)

  const baseIds = items.map((i) => i.id)
  const baseRef = useRef(baseIds)
  baseRef.current = baseIds
  const onReorderRef = useRef(onReorder)
  onReorderRef.current = onReorder

  const ids = order ?? baseIds
  const contentById = new Map(items.map((i) => [i.id, i.content]))

  const setBoth = (next: string[]) => {
    orderRef.current = next
    setOrder(next)
  }

  useEffect(() => {
    function move(e: PointerEvent) {
      if (!dragId.current || !containerRef.current) return
      const rows = [...containerRef.current.querySelectorAll<HTMLElement>('[data-srow]')]
      const y = e.clientY
      let target = rows.length - 1
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i].getBoundingClientRect()
        if (y < r.top + r.height / 2) {
          target = i
          break
        }
      }
      const arr = [...orderRef.current]
      const from = arr.indexOf(dragId.current)
      if (from === -1 || from === target) return
      arr.splice(from, 1)
      arr.splice(target, 0, dragId.current)
      setBoth(arr)
    }
    function up() {
      if (!dragId.current) return
      const final = orderRef.current
      const changed = baseRef.current.join(' ') !== final.join(' ')
      dragId.current = null
      setDragging(null)
      setOrder(null)
      if (changed) onReorderRef.current(final)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [])

  function onDown(e: ReactPointerEvent, id: string) {
    e.preventDefault()
    e.stopPropagation()
    dragId.current = id
    setDragging(id)
    setBoth(baseIds)
  }

  // Keyboard fallback: move the focused row up/down one slot (no mouse/touch needed).
  function onKey(e: ReactKeyboardEvent, id: string) {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
    const from = baseIds.indexOf(id)
    const to = e.key === 'ArrowUp' ? from - 1 : from + 1
    if (from === -1 || to < 0 || to >= baseIds.length) return
    e.preventDefault()
    const next = [...baseIds]
    next.splice(from, 1)
    next.splice(to, 0, id)
    onReorder(next)
  }

  const showHandles = items.length > 1

  return (
    <div className="sortable" ref={containerRef}>
      {ids.map((id) => (
        <div
          key={id}
          data-srow={id}
          className={'relation-row sortable-row' + (dragging === id ? ' dragging' : '')}
        >
          {showHandles && (
            <button
              type="button"
              className="drag-handle"
              title="Drag, or focus and use ↑/↓ arrows, to reorder"
              aria-label="Reorder: drag, or press up and down arrow keys"
              onPointerDown={(e) => onDown(e, id)}
              onKeyDown={(e) => onKey(e, id)}
            >
              ⠿
            </button>
          )}
          {contentById.get(id)}
        </div>
      ))}
    </div>
  )
}
