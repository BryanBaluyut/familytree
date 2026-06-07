import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { Connector } from 'relatives-tree/lib/types'
import type { ID, Member, Tree } from '@shared/types'
import { memberById } from '../lib/relationships'
import { Avatar } from '../components/Avatar'
import { buildNodes } from './buildNodes'
import { layoutForest, type PlacedNode } from './layout'

const NODE_WIDTH = 170
const NODE_HEIGHT = 140
const W = NODE_WIDTH / 2
const H = NODE_HEIGHT / 2
const CARD_PAD = 10
const MIN_SCALE = 0.15
const MAX_SCALE = 2.5
const REFIT_JUMP = 5 // re-fit the view when the member count changes by at least this

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

function lifespan(m: Member): string {
  const by = m.birthDate?.slice(0, 4)
  const dy = m.deathDate?.slice(0, 4)
  if (by && dy) return `${by}–${dy}`
  if (by) return `b. ${by}`
  if (dy) return `d. ${dy}`
  return ''
}

interface View {
  scale: number
  x: number
  y: number
}

export function TreeView({
  tree,
  selectedId,
  onSelect,
}: {
  tree: Tree
  selectedId: ID | null
  onSelect: (id: ID) => void
}) {
  const [view, setView] = useState<View>({ scale: 1, x: 0, y: 0 })
  const [smooth, setSmooth] = useState(false)
  const [pulseTarget, setPulseTarget] = useState<ID | null>(null)

  const viewportRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<View>(view)
  const prevCount = useRef<number | null>(null)
  const focusTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pulseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const panStart = useRef<{ x: number; y: number; view: View } | null>(null)
  const pinchStart = useRef<{ dist: number; midX: number; midY: number; view: View } | null>(null)

  const rtNodes = useMemo(() => buildNodes(tree), [tree])
  const data = useMemo(() => layoutForest(rtNodes), [rtNodes])

  const applyView = useCallback((next: View) => {
    viewRef.current = next
    setView(next)
  }, [])

  const zoomAround = useCallback(
    (factor: number, cx: number, cy: number) => {
      const v = viewRef.current
      const scale = clamp(v.scale * factor, MIN_SCALE, MAX_SCALE)
      const k = scale / v.scale
      applyView({ scale, x: cx - k * (cx - v.x), y: cy - k * (cy - v.y) })
    },
    [applyView],
  )

  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      zoomAround(Math.exp(-e.deltaY * 0.0015), e.clientX - rect.left, e.clientY - rect.top)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomAround])

  const fitView = useCallback(() => {
    const el = viewportRef.current
    if (!el || data.nodes.length === 0) return
    const rect = el.getBoundingClientRect()
    const cw = data.canvas.width * W
    const ch = data.canvas.height * H
    const scale = clamp(Math.min((rect.width - 48) / cw, (rect.height - 48) / ch, 1.2), MIN_SCALE, 1.2)
    applyView({ scale, x: Math.max(24, (rect.width - cw * scale) / 2), y: 24 })
  }, [data, applyView])

  // Auto-fit on first render and after big changes (e.g. an import), but leave
  // the view alone for small edits so panning isn't disrupted.
  useLayoutEffect(() => {
    const count = tree.members.length
    const prev = prevCount.current
    prevCount.current = count
    if (prev === null || count - prev >= REFIT_JUMP) fitView()
  }, [data, fitView, tree.members.length])

  // Focus: when a person is selected (search / sidebar / node), pan to them if
  // they're off-screen. If already visible, don't move.
  const centerOn = useCallback(
    (node: PlacedNode) => {
      const el = viewportRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const v = viewRef.current
      const cx = node.left * W + NODE_WIDTH / 2
      const cy = node.top * H + NODE_HEIGHT / 2
      const editorPad = rect.width > 760 ? 360 : 0 // the editor covers the right on desktop
      const visRight = rect.width - editorPad
      const sx = cx * v.scale + v.x
      const sy = cy * v.scale + v.y
      const visible = sx > 60 && sx < visRight - 60 && sy > 60 && sy < rect.height - 60
      if (visible) return
      const scale = Math.max(v.scale, 0.7)
      applyView({ scale, x: visRight / 2 - cx * scale, y: rect.height * 0.45 - cy * scale })
      setSmooth(true)
      if (focusTimer.current) clearTimeout(focusTimer.current)
      focusTimer.current = setTimeout(() => setSmooth(false), 380)
    },
    [applyView],
  )

  useEffect(() => {
    if (!selectedId) return
    const node = data.nodes.find((n) => n.id === selectedId)
    if (node) centerOn(node)
  }, [selectedId, data, centerOn])

  // Briefly pulse the focused card when the selection changes.
  useEffect(() => {
    if (!selectedId) return
    setPulseTarget(selectedId)
    if (pulseTimer.current) clearTimeout(pulseTimer.current)
    pulseTimer.current = setTimeout(() => setPulseTarget(null), 1100)
  }, [selectedId])

  // --- pointer gestures: 1 finger / mouse = pan, 2 fingers = pinch-zoom ---

  function rectOf() {
    return viewportRef.current?.getBoundingClientRect()
  }

  function beginPinch() {
    const pts = [...pointers.current.values()]
    const rect = rectOf()
    if (pts.length < 2 || !rect) return
    const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
    pinchStart.current = {
      dist: dist || 1,
      midX: (pts[0].x + pts[1].x) / 2 - rect.left,
      midY: (pts[0].y + pts[1].y) / 2 - rect.top,
      view: { ...viewRef.current },
    }
    panStart.current = null
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size >= 2) {
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
      beginPinch()
      return
    }
    if ((e.target as HTMLElement).closest('.tree-card')) {
      panStart.current = null
      return
    }
    if (e.pointerType === 'mouse' && e.button !== 0) return
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    panStart.current = { x: e.clientX, y: e.clientY, view: { ...viewRef.current } }
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (pointers.current.size >= 2 && pinchStart.current) {
      const pts = [...pointers.current.values()]
      const rect = rectOf()
      if (!rect) return
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
      const midX = (pts[0].x + pts[1].x) / 2 - rect.left
      const midY = (pts[0].y + pts[1].y) / 2 - rect.top
      const start = pinchStart.current
      const scale = clamp(start.view.scale * (dist / start.dist), MIN_SCALE, MAX_SCALE)
      const k = scale / start.view.scale
      applyView({
        scale,
        x: midX - (start.midX - start.view.x) * k,
        y: midY - (start.midY - start.view.y) * k,
      })
      return
    }

    const pan = panStart.current
    if (pan && pointers.current.size === 1) {
      applyView({
        scale: pan.view.scale,
        x: pan.view.x + (e.clientX - pan.x),
        y: pan.view.y + (e.clientY - pan.y),
      })
    }
  }

  function endPointer(e: ReactPointerEvent<HTMLDivElement>) {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinchStart.current = null
    if (pointers.current.size === 1) {
      const [p] = [...pointers.current.values()]
      panStart.current = { x: p.x, y: p.y, view: { ...viewRef.current } }
    } else if (pointers.current.size === 0) {
      panStart.current = null
    }
  }

  function applyZoomCenter(factor: number) {
    const rect = rectOf()
    if (rect) zoomAround(factor, rect.width / 2, rect.height / 2)
  }

  if (tree.members.length === 0) {
    return (
      <div className="canvas-empty">
        <div className="canvas-empty-logo">🌳</div>
        <h2>Start your family tree</h2>
        <p className="muted">Add a person from the menu to begin.</p>
      </div>
    )
  }

  const dissolved = tree.partnerships.filter(
    (p) => p.status === 'divorced' || p.status === 'separated',
  )
  const posById = new Map<string, PlacedNode>(data.nodes.map((n) => [n.id, n]))
  const canvasW = data.canvas.width * W
  const canvasH = data.canvas.height * H

  return (
    <div className="tree-wrap">
      <div className="tree-toolbar">
        <div className="tree-legend">
          <span className="legend-item">
            <span className="legend-swatch married" /> partner
          </span>
          <span className="legend-item">
            <span className="legend-swatch divorced" /> divorced
          </span>
          <span className="legend-hint muted">· drag to pan, pinch / scroll to zoom</span>
        </div>

        <div className="zoom-controls">
          <button className="icon-btn" title="Zoom out" onClick={() => applyZoomCenter(0.83)}>
            −
          </button>
          <button className="btn small" title="Fit whole tree" onClick={fitView}>
            Fit
          </button>
          <button className="icon-btn" title="Zoom in" onClick={() => applyZoomCenter(1.2)}>
            +
          </button>
        </div>
      </div>

      <div
        className="tree-viewport"
        ref={viewportRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        style={{ cursor: panStart.current ? 'grabbing' : 'grab' }}
      >
        <div
          className="tree-canvas-inner"
          style={{
            width: canvasW,
            height: canvasH,
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
            transition: smooth ? 'transform 0.36s ease' : undefined,
          }}
        >
          {data.connectors.map((c, i) => (
            <ConnectorLine key={i} c={c} />
          ))}

          <svg className="divorce-layer" width={canvasW} height={canvasH}>
            {dissolved.map((p) => {
              const a = posById.get(p.a)
              const b = posById.get(p.b)
              if (!a || !b) return null
              const ax = a.left * W + NODE_WIDTH / 2
              const ay = a.top * H + NODE_HEIGHT / 2
              const bx = b.left * W + NODE_WIDTH / 2
              const by = b.top * H + NODE_HEIGHT / 2
              const dx = bx - ax
              const dy = by - ay
              const len = Math.hypot(dx, dy) || 1
              const off = Math.min(NODE_WIDTH / 2 - CARD_PAD, len / 2 - 6)
              const ux = dx / len
              const uy = dy / len
              const mx = (ax + bx) / 2
              const my = (ay + by) / 2
              return (
                <g key={p.id}>
                  <line
                    className={'divorce-line' + (p.status === 'separated' ? ' separated' : '')}
                    x1={ax + ux * off}
                    y1={ay + uy * off}
                    x2={bx - ux * off}
                    y2={by - uy * off}
                  />
                  <rect className="divorce-pill" x={mx - 15} y={my - 9} width={30} height={18} rx={9} />
                  <text className="divorce-pill-text" x={mx} y={my} textAnchor="middle" dominantBaseline="central">
                    {p.status === 'divorced' ? 'ex' : 'sep'}
                  </text>
                </g>
              )
            })}
          </svg>

          {data.nodes.map((node) => {
            const member = memberById(tree, node.id)
            if (!member) return null
            const span = lifespan(member)
            return (
              <div
                key={node.id}
                className="tree-node"
                style={{
                  width: NODE_WIDTH,
                  height: NODE_HEIGHT,
                  transform: `translate(${node.left * W}px, ${node.top * H}px)`,
                }}
              >
                <button
                  className={
                    'tree-card' +
                    (node.id === selectedId ? ' active' : '') +
                    (node.id === pulseTarget ? ' pulse' : '')
                  }
                  onClick={() => onSelect(node.id)}
                >
                  <Avatar member={member} size={54} />
                  <div className="tree-card-name">{member.name}</div>
                  {span && <div className="tree-card-dates">{span}</div>}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function ConnectorLine({ c }: { c: Connector }) {
  const [x1, y1, x2, y2] = c
  return (
    <i
      className="tree-connector"
      style={{
        position: 'absolute',
        width: Math.max(1, (x2 - x1) * W + 1),
        height: Math.max(1, (y2 - y1) * H + 1),
        transform: `translate(${x1 * W}px, ${y1 * H}px)`,
      }}
    />
  )
}
