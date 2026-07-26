// Full-screen slideshow at /present: one member at a time, eldest generation
// first, each slide framing that person between their parents and children.
// Read-only — it never writes, so it's safe to leave running on a TV.

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Member, Tree } from '@shared/types'
import { api, AuthError } from '../api'
import { buildSlides, generationCount } from '../lib/generations'
import { Avatar } from './Avatar'

/** Dwell time per slide when playing. */
const SLIDE_MS = 9000

const year = (iso?: string) => (iso ? iso.slice(0, 4) : '')

/** "1935 – 2001", "b. 1980", "d. 1943", or empty when nothing is recorded. */
function lifespan(member: Member): string {
  const born = year(member.birthDate)
  const died = year(member.deathDate)
  if (born && died) return `${born} – ${died}`
  if (born) return `b. ${born}`
  if (died) return `d. ${died}`
  return ''
}

function Relatives({ label, members }: { label: string; members: Member[] }) {
  return (
    <div className="present-relatives">
      <div className="present-relatives-label">{label}</div>
      <div className="present-relatives-row">
        {members.map((m) => (
          <div className="present-relative" key={m.id}>
            <Avatar member={m} size={72} />
            <div className="present-relative-name">{m.name}</div>
            <div className="present-relative-dates">{lifespan(m)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function Presentation({
  onExit,
  onUnauthorized,
}: {
  onExit: () => void
  onUnauthorized: () => void
}) {
  const [tree, setTree] = useState<Tree | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(true)

  useEffect(() => {
    let cancelled = false
    api
      .getTree()
      .then((t) => {
        if (!cancelled) setTree(t)
      })
      .catch((e) => {
        if (cancelled) return
        if (e instanceof AuthError) onUnauthorized()
        else setError(e instanceof Error ? e.message : 'Could not load the tree')
      })
    return () => {
      cancelled = true
    }
    // onUnauthorized is stable for the lifetime of this screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const slides = useMemo(() => (tree ? buildSlides(tree) : []), [tree])
  const total = slides.length

  const go = useCallback(
    (delta: number) => {
      setIndex((i) => (total === 0 ? 0 : (i + delta + total) % total))
    },
    [total],
  )

  // Auto-advance. Keyed on `index` too, so manual navigation restarts the dwell.
  useEffect(() => {
    if (!playing || total < 2) return
    const timer = window.setTimeout(() => go(1), SLIDE_MS)
    return () => window.clearTimeout(timer)
  }, [playing, index, total, go])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(1)
      else if (e.key === 'ArrowLeft') go(-1)
      else if (e.key === ' ') {
        e.preventDefault()
        setPlaying((p) => !p)
      } else if (e.key === 'Escape') onExit()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, onExit])

  if (error) {
    return (
      <div className="present present-message">
        <p>{error}</p>
        <button className="btn" onClick={onExit}>
          Back to the tree
        </button>
      </div>
    )
  }

  if (!tree) {
    return (
      <div className="splash">
        <div className="spinner" />
      </div>
    )
  }

  if (total === 0) {
    return (
      <div className="present present-message">
        <p className="muted">There's nobody in the tree yet.</p>
        <button className="btn" onClick={onExit}>
          Back to the tree
        </button>
      </div>
    )
  }

  const slide = slides[Math.min(index, total - 1)]
  const generations = generationCount(slides)
  const dates = lifespan(slide.member)

  return (
    <div className="present">
      <header className="present-bar">
        <button className="btn ghost small" onClick={onExit}>
          ← Back
        </button>
        <div className="present-meta">
          Generation {slide.generation + 1} of {generations}
          <span className="present-meta-sep">·</span>
          {index + 1} of {total}
        </div>
        <div className="present-controls">
          <button className="icon-btn" onClick={() => go(-1)} title="Previous (←)">
            ‹
          </button>
          <button
            className="icon-btn"
            onClick={() => setPlaying((p) => !p)}
            title={playing ? 'Pause (space)' : 'Play (space)'}
          >
            {playing ? '❚❚' : '▶'}
          </button>
          <button className="icon-btn" onClick={() => go(1)} title="Next (→)">
            ›
          </button>
        </div>
      </header>

      <div className="present-progress">
        <div
          className="present-progress-fill"
          style={{ width: `${((index + 1) / total) * 100}%` }}
        />
      </div>

      <div className="present-stage" key={slide.member.id}>
        {slide.parents.length > 0 && (
          <>
            <Relatives label={slide.parents.length > 1 ? 'Parents' : 'Parent'} members={slide.parents} />
            <div className="present-connector" />
          </>
        )}

        <div className="present-hero">
          <Avatar member={slide.member} size={200} />
          <h1 className="present-name">{slide.member.name}</h1>
          {dates && <div className="present-dates">{dates}</div>}
          {slide.member.notes && <p className="present-notes">{slide.member.notes}</p>}
        </div>

        {slide.children.length > 0 && (
          <>
            <div className="present-connector" />
            <Relatives
              label={slide.children.length > 1 ? 'Children' : 'Child'}
              members={slide.children}
            />
          </>
        )}
      </div>
    </div>
  )
}
