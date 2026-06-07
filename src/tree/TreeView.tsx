import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import calcTree from 'relatives-tree'
import type { Connector, ExtNode, Node, RelData } from 'relatives-tree/lib/types'
import type { ID, Member, Tree } from '@shared/types'
import { memberById } from '../lib/relationships'
import { Avatar } from '../components/Avatar'
import { buildNodes, pickDefaultRoot, type RTNode } from './buildNodes'

const NODE_WIDTH = 170
const NODE_HEIGHT = 140
const W = NODE_WIDTH / 2
const H = NODE_HEIGHT / 2
const CARD_PAD = 10

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

function safeCalc(nodes: RTNode[], rootId: string): RelData | null {
  try {
    return calcTree(nodes as unknown as readonly Node[], { rootId })
  } catch (e) {
    console.error('calcTree failed', e)
    return null
  }
}

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
  const [rootId, setRootId] = useState<ID | null>(null)
  const [view, setView] = useState<View>({ scale: 1, x: 0, y: 0 })

  const viewportRef = useRef<HTMLDivElement>(null)
  const fitKey = useRef<ID | null>(null)
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null)

  const effectiveRoot = useMemo<ID | null>(() => {
    if (rootId && memberById(tree, rootId)) return rootId
    return pickDefaultRoot(tree)
  }, [rootId, tree])

  const rtNodes = useMemo(() => buildNodes(tree), [tree])
  const data = useMemo(
    () => (effectiveRoot ? safeCalc(rtNodes, effectiveRoot) : null),
    [rtNodes, effectiveRoot],
  )

  const applyZoom = useCallback((factor: number, cx: number, cy: number) => {
    setView((v) => {
      const scale = clamp(v.scale * factor, 0.2, 2.5)
      const k = scale / v.scale
      return { scale, x: cx - k * (cx - v.x), y: cy - k * (cy - v.y) }
    })
  }, [])

  // Native non-passive wheel listener so we can preventDefault page scroll.
  useEffect(() => {
    const el = viewportRef.current
    if (!el || !data) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      applyZoom(Math.exp(-e.deltaY * 0.0015), e.clientX - rect.left, e.clientY - rect.top)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [applyZoom, data])

  const fitView = useCallback(() => {
    const el = viewportRef.current
    if (!el || !data) return
    const rect = el.getBoundingClientRect()
    const cw = data.canvas.width * W
    const ch = data.canvas.height * H
    const scale = clamp(Math.min((rect.width - 64) / cw, (rect.height - 64) / ch, 1.2), 0.2, 1.2)
    setView({ scale, x: (rect.width - cw * scale) / 2, y: 28 })
  }, [data])

  // Auto-fit when the rooted layout first appears or the root changes.
  useLayoutEffect(() => {
    if (data && fitKey.current !== effectiveRoot) {
      fitKey.current = effectiveRoot
      fitView()
    }
  }, [data, effectiveRoot, fitView])

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return
    if ((e.target as HTMLElement).closest('.tree-card')) return // let card clicks through
    drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const d = drag.current
    if (!d) return
    setView((v) => ({ ...v, x: d.vx + (e.clientX - d.x), y: d.vy + (e.clientY - d.y) }))
  }

  function endDrag() {
    drag.current = null
  }

  if (tree.members.length === 0) {
    return (
      <div className="canvas-empty">
        <div className="canvas-empty-logo">🌳</div>
        <h2>Start your family tree</h2>
        <p className="muted">Add a person from the left panel to begin.</p>
      </div>
    )
  }

  const members = [...tree.members].sort((a, b) => a.name.localeCompare(b.name))
  const renderedIds = new Set<string>(data ? data.nodes.map((n) => n.id) : [])
  const unconnected = members.filter((m) => !renderedIds.has(m.id))
  const dissolved = data
    ? tree.partnerships.filter(
        (p) =>
          (p.status === 'divorced' || p.status === 'separated') &&
          renderedIds.has(p.a) &&
          renderedIds.has(p.b),
      )
    : []
  const posById = new Map<string, ExtNode>(data ? data.nodes.map((n) => [n.id, n]) : [])
  const canvasW = data ? data.canvas.width * W : 0
  const canvasH = data ? data.canvas.height * H : 0

  return (
    <div className="tree-wrap">
      <div className="tree-toolbar">
        <label className="view-from">
          View from
          <select
            className="input small"
            value={effectiveRoot ?? ''}
            onChange={(e) => setRootId(e.target.value)}
          >
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>

        <div className="tree-legend">
          <span className="legend-item">
            <span className="legend-swatch married" /> partner
          </span>
          <span className="legend-item">
            <span className="legend-swatch divorced" /> divorced
          </span>
        </div>

        <div className="zoom-controls">
          <button className="icon-btn" title="Zoom out" onClick={() => applyZoomCenter(0.83)}>
            −
          </button>
          <button className="btn small" title="Fit to screen" onClick={fitView}>
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
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        style={{ cursor: drag.current ? 'grabbing' : 'grab' }}
      >
        {!data ? (
          <div className="tree-error muted">
            Couldn't lay out the tree from this person. Try a different “View from”.
          </div>
        ) : (
          <div
            className="tree-canvas-inner"
            style={{
              width: canvasW,
              height: canvasH,
              transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
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
                    className={'tree-card' + (node.id === selectedId ? ' active' : '')}
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
        )}
      </div>

      {unconnected.length > 0 && (
        <div className="unconnected">
          <span className="muted">Not linked to this view:</span>
          {unconnected.map((m) => (
            <button key={m.id} className="unconnected-chip" onClick={() => setRootId(m.id)}>
              <Avatar member={m} size={24} />
              {m.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )

  function applyZoomCenter(factor: number) {
    const el = viewportRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    applyZoom(factor, rect.width / 2, rect.height / 2)
  }
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
