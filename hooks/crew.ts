// Who is on the band, where each mascot walks, and how it poses: pure
// functions over the crew, the clock and a small per-mascot position.

import type { AgentInfo } from 'claude-code'

import type { Member, Phase } from '../types'
import { ITEMS, hash, pickColor, pickItem, skinOf, typeLook } from './skins'
import { BODY_WIDTH, ITEM_WIDTH } from './sprites'
import type { Drawn } from './sprites'

export const MAX_SHOWN = 6
/** How long a finished mascot celebrates or flops before it walks off. */
export const LINGER_MS = 1500
/** How long after finishing a mascot leaves the band for good. */
export const GONE_MS = 4000

const MIN_LANE = Math.max(BODY_WIDTH + ITEM_WIDTH * 2, 10)
const NOTE_WIDTH = 5
const SPEED = { idle: 6, busy: 10, regroup: 20, exit: 40 }

export type Lane = { start: number; width: number }

/** A mascot's position between frames: its body's left column and facing. */
export type Sim = { x: number; dir: 1 | -1 }

export type AgentRow = Pick<AgentInfo, 'id' | 'type' | 'status'>

export function phaseOf(status: AgentInfo['status']): Phase {
  switch (status) {
    case 'completed':
      return 'done'
    case 'failed':
    case 'killed':
      return 'failed'
    case 'waiting':
    case 'idle':
      return 'waiting'
    default:
      return 'active'
  }
}

export const isEnded = (phase: Phase) => phase === 'done' || phase === 'failed'

/**
 * The crew after a look at `$.agent.list()`: phases follow the list, finished
 * members leave once GONE_MS has passed, and agents that are new and still
 * running join. An agent first seen already finished never joins.
 */
export function reconcile(prev: readonly Member[], agents: readonly AgentRow[], now: number): Member[] {
  const byId = new Map(agents.map(agent => [agent.id, agent]))
  const next: Member[] = []

  for (const member of prev) {
    const agent = byId.get(member.id)
    const phase = agent !== undefined ? phaseOf(agent.status) : isEnded(member.phase) ? member.phase : 'done'
    const current = phase === member.phase ? member : { ...member, phase, since: now }
    if (!(isEnded(current.phase) && now - current.since > GONE_MS)) {
      next.push(current)
    }
  }

  const known = new Set(prev.map(member => member.id))
  for (const agent of agents) {
    const phase = phaseOf(agent.status)
    if (!known.has(agent.id) && !isEnded(phase)) {
      next.push(join(next, agent.id, agent.type, phase, now))
    }
  }

  return next
}

/** The crew with a just-spawned agent added, unless it is already there. */
export function addMember(prev: readonly Member[], agent: { id: string; type: string }, now: number): Member[] {
  if (prev.some(member => member.id === agent.id)) {
    return [...prev]
  }

  return [...prev, join(prev, agent.id, agent.type, 'active', now)]
}

const join = (crew: readonly Member[], id: string, type: string, phase: Phase, now: number): Member => ({
  id,
  type,
  phase,
  since: now,
  item: pickItem(id, type, crew.map(member => member.item)),
  color: pickColor(crew.map(member => member.color)),
})

export function sameCrew(a: readonly Member[], b: readonly Member[]): boolean {
  return (
    a.length === b.length &&
    a.every((m, i) => m.id === b[i]!.id && m.phase === b[i]!.phase && m.since === b[i]!.since)
  )
}

/** Splits the band into one lane per shown mascot, leaving room for a "+N" note. */
export function layout(count: number, columns: number): { lanes: Lane[]; overflow: number } {
  const fit = (width: number) => Math.max(1, Math.floor(width / MIN_LANE))
  let usable = columns
  let shown = Math.min(count, MAX_SHOWN, fit(usable))
  if (shown < count) {
    usable = columns - NOTE_WIDTH
    shown = Math.min(count, MAX_SHOWN, fit(usable))
  }
  const width = shown > 0 ? Math.floor(usable / shown) : 0
  const lanes = Array.from({ length: shown }, (_, i) => ({ start: i * width, width }))

  return { lanes, overflow: count - shown }
}

/** A number in [0, 1) fixed per agent id, so each mascot moves out of step. */
export const seedOf = (id: string) => hash(id) / 0x100000000

const bounds = (lane: Lane) => {
  const min = lane.start + ITEM_WIDTH
  return { min, max: Math.max(min, lane.start + lane.width - BODY_WIDTH - ITEM_WIDTH) }
}

export function spawnX(lane: Lane, seed: number): number {
  const { min, max } = bounds(lane)
  return min + seed * (max - min)
}

/** Moves a mascot on by `dt` seconds: wandering its lane, or walking off once finished. */
export function step(sim: Sim, member: Member, lane: Lane, isBusy: boolean, now: number, dt: number): void {
  if (isEnded(member.phase)) {
    if (now - member.since >= LINGER_MS) {
      sim.dir = 1
      sim.x += SPEED.exit * dt
    }
    return
  }

  const { min, max } = bounds(lane)
  if (sim.x < min) {
    sim.dir = 1
    sim.x = Math.min(min, sim.x + SPEED.regroup * dt)
    return
  }
  if (sim.x > max) {
    sim.dir = -1
    sim.x = Math.max(max, sim.x - SPEED.regroup * dt)
    return
  }

  const speed = member.phase === 'waiting' ? 0 : isBusy ? SPEED.busy : SPEED.idle
  sim.x += sim.dir * speed * dt
  if (sim.x >= max) {
    sim.x = max
    sim.dir = -1
  } else if (sim.x <= min) {
    sim.x = min
    sim.dir = 1
  }
}

/** How the mascot looks this frame: hop height, leg frame, blink, mood, label. */
export function pose(member: Member, sim: Sim, isBusy: boolean, now: number, seed: number): Drawn {
  const age = now - member.since
  const lingering = isEnded(member.phase) && age < LINGER_MS
  const isMoving = member.phase === 'active' || (isEnded(member.phase) && !lingering)

  // The band has two pixels of headroom above a standing mascot.
  let hop = 0
  if (member.phase === 'done' && lingering) {
    hop = Math.round(Math.abs(Math.sin((age / 750) * Math.PI)) * 2)
  } else if (member.phase === 'active' && isBusy) {
    hop = Math.round(Math.abs(Math.sin((now / 1000) * Math.PI * 2.5 + seed * 7)))
  } else if (member.phase === 'active') {
    const cycle = (now + seed * 3000) % 3000
    hop = cycle < 400 ? Math.round(Math.sin((cycle / 400) * Math.PI) * 2) : 0
  }

  const { label: typeLabel } = typeLook(member.type)
  const label = !isEnded(member.phase) ? typeLabel : !lingering ? null : member.phase === 'done' ? 'done!' : 'failed'

  return {
    skin: skinOf(member.color),
    item: ITEMS[member.item] ?? null,
    x: sim.x,
    hop,
    dir: sim.dir,
    step: isMoving && Math.floor(now / 150) % 2 === 1 ? 1 : 0,
    blink: (now + seed * 3200) % 3200 < 140,
    mood: member.phase === 'failed' && lingering ? 'flop' : member.phase === 'done' && lingering ? 'party' : 'normal',
    label,
  }
}
