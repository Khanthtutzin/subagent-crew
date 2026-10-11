import { describe, expect, test } from 'claude-code/testing'

import type { Member } from '../types'
import { GONE_MS, LINGER_MS, MAX_SHOWN, addMember, layout, pose, reconcile, step } from '../hooks/crew'
import { CLAUDE_ORANGE, COLORS, ITEMS, pickColor, pickItem, skinOf, typeLook } from '../hooks/skins'
import { DEFAULT, ROWS, drawFrame, encodeCells, toBase64 } from '../hooks/sprites'

const running = (id: string, type = 'Explore') => ({ id, type, status: 'running' as const })

describe('types', () => {
  test('named agent types get their label and favourite item', async () => {
    expect(typeLook('Explore').label).toBe('explore')
    expect(ITEMS[typeLook('Explore').favourite!]!.name).toBe('magnifier')
    expect(typeLook('Plan').label).toBe('plan')
    expect(ITEMS[typeLook('Plan').favourite!]!.name).toBe('clipboard')
  })

  test('an unknown type gets a short label and no favourite', async () => {
    expect(typeLook('my-plugin:code-reviewer')).toEqual({ label: 'code-re', favourite: null })
  })
})

describe('colors', () => {
  test('the first mascot wears Claude orange, the rest each wear their own', async () => {
    const crew = reconcile([], [running('a'), running('b', 'Plan'), running('c')], 0)
    expect(skinOf(crew[0]!.color).body).toBe(CLAUDE_ORANGE)
    expect(new Set(crew.map(m => m.color)).size).toBe(3)
  })

  test('orange goes to the next mascot once its wearer leaves', async () => {
    const crew = reconcile([], [running('a'), running('b')], 0)
    const left = crew.filter(m => m.id !== 'a')
    const back = addMember(left, { id: 'c', type: 'Plan' }, 10)
    expect(skinOf(back[1]!.color).body).toBe(CLAUDE_ORANGE)
  })

  test('with every color worn, the least worn is reused', async () => {
    const worn = COLORS.map((_, i) => i).concat([0, 1])
    expect(pickColor(worn)).toBe(2)
  })
})

describe('items', () => {
  test('three agents of one type each hold something different', async () => {
    const crew = reconcile([], [running('a'), running('b'), running('c')], 0)
    const items = crew.map(m => m.item)
    expect(new Set(items).size).toBe(3)
    expect(ITEMS[items[0]!]!.name).toBe('magnifier')
  })

  test('a spawned agent avoids items already held', async () => {
    const one = addMember([], { id: 'a', type: 'Plan' }, 0)
    const two = addMember(one, { id: 'b', type: 'Plan' }, 0)
    expect(two[1]!.item).not.toBe(two[0]!.item)
  })

  test('with every item held, the least held is reused', async () => {
    const held = ITEMS.map((_, i) => i).concat([0, 1, 2])
    const pick = pickItem('z', 'Explore', held)
    expect([0, 1, 2]).not.toContain(pick)
  })
})

describe('reconcile', () => {
  test('a running agent joins, one first seen finished does not', async () => {
    const crew = reconcile([], [running('a'), { id: 'b', type: 'Plan', status: 'completed' }], 100)
    expect(crew.map(m => m.id)).toEqual(['a'])
    expect(crew[0]!.phase).toBe('active')
  })

  test('a finished agent celebrates, then leaves after GONE_MS', async () => {
    const start = reconcile([], [running('a')], 0)
    const done = reconcile(start, [{ id: 'a', type: 'Explore', status: 'completed' }], 1000)
    expect(done[0]!.phase).toBe('done')
    expect(done[0]!.since).toBe(1000)
    expect(reconcile(done, [{ id: 'a', type: 'Explore', status: 'completed' }], 1000 + GONE_MS + 1)).toEqual([])
  })

  test('killed and failed agents flop', async () => {
    const start = reconcile([], [running('a'), running('b')], 0)
    const after = reconcile(start, [{ ...running('a'), status: 'failed' }, { ...running('b'), status: 'killed' }], 10)
    expect(after.map(m => m.phase)).toEqual(['failed', 'failed'])
  })

  test('a spawned agent is added once', async () => {
    const once = addMember([], { id: 'a', type: 'Plan' }, 5)
    expect(addMember(once, { id: 'a', type: 'Plan' }, 9)).toEqual(once)
  })
})

describe('layout', () => {
  test('shows at most MAX_SHOWN mascots and counts the rest', async () => {
    const { lanes, overflow } = layout(10, 200)
    expect(lanes.length).toBe(MAX_SHOWN)
    expect(overflow).toBe(10 - MAX_SHOWN)
  })

  test('a narrow band shows fewer and no lane overlaps the "+N" note', async () => {
    const { lanes, overflow } = layout(6, 40)
    expect(lanes.length).toBe(3)
    expect(overflow).toBe(3)
    const last = lanes[lanes.length - 1]!
    expect(last.start + last.width).toBeLessThanOrEqual(40 - 5)
  })

  test('no crew, no lanes', async () => {
    expect(layout(0, 120)).toEqual({ lanes: [], overflow: 0 })
  })
})

describe('motion', () => {
  const member: Member = { id: 'a', type: 'Explore', phase: 'active', since: 0, item: 0, color: 0 }
  const lane = { start: 0, width: 40 }

  test('a mascot stays inside its lane and turns at the edge', async () => {
    const sim = { x: 20, dir: 1 as const }
    for (let t = 0; t < 200; t++) {
      step(sim, member, lane, true, t * 100, 0.1)
      expect(sim.x).toBeGreaterThanOrEqual(2)
      expect(sim.x).toBeLessThanOrEqual(40 - 6 - 2)
    }
  })

  test('a waiting mascot stands still', async () => {
    const sim = { x: 20, dir: 1 as const }
    step(sim, { ...member, phase: 'waiting' }, lane, false, 0, 1)
    expect(sim.x).toBe(20)
  })

  test('a finished mascot parties, then walks off to the right', async () => {
    const done: Member = { ...member, phase: 'done', since: 0 }
    const sim = { x: 20, dir: -1 as const }
    expect(pose(done, sim, false, 100, 0).mood).toBe('party')
    step(sim, done, lane, false, LINGER_MS + 10, 1)
    expect(sim.x).toBeGreaterThan(20)
    expect(pose(done, sim, false, LINGER_MS + 10, 0).label).toBeNull()
  })

  test('a failed mascot flops', async () => {
    const failed: Member = { ...member, phase: 'failed', since: 0 }
    expect(pose(failed, { x: 5, dir: 1 }, false, 200, 0).mood).toBe('flop')
  })
})

describe('frame', () => {
  test('fills every cell of the raster and labels the mascot', async () => {
    const columns = 30
    const drawn = pose(
      { id: 'a', type: 'Plan', phase: 'active', since: 0, item: 1, color: 2 },
      { x: 5, dir: 1 },
      false,
      1000,
      0,
    )
    expect(drawn.item?.name).toBe('clipboard')
    expect(drawn.skin.body).toBe(COLORS[2])
    const words = drawFrame(columns, [drawn], '+2')
    expect(words.length).toBe(columns * ROWS * 3)
    expect(ROWS).toBe(4)

    const labelRow = Array.from({ length: columns }, (_, c) => String.fromCharCode(words[((ROWS - 1) * columns + c) * 3]!)).join('')
    expect(labelRow).toContain('plan')
    expect(labelRow.trimEnd().endsWith('+2')).toBe(true)

    const painted = Array.from({ length: columns * (ROWS - 1) }, (_, i) => words[i * 3 + 1]!).filter(fg => fg !== DEFAULT)
    expect(painted.length).toBeGreaterThan(0)

    // The clipboard's paper (0xf2eee6) is drawn right of the body when facing right.
    const paperAt = (frame: Uint32Array) =>
      Array.from({ length: columns * (ROWS - 1) }, (_, i) => i).filter(
        i => frame[i * 3 + 1] === 0xf2eee6 || frame[i * 3 + 2] === 0xf2eee6,
      )
    expect(paperAt(words).length).toBeGreaterThan(0)
    expect(paperAt(words).every(i => i % columns >= 5 + 6)).toBe(true)
    const left = drawFrame(columns, [{ ...drawn, x: 10, dir: -1 }], null)
    expect(paperAt(left).length).toBeGreaterThan(0)
    expect(paperAt(left).every(i => i % columns < 10)).toBe(true)
  })

  test('cells are base64 of little-endian u32s', async () => {
    expect(toBase64(new TextEncoder().encode('Man'))).toBe('TWFu')
    expect(toBase64(new TextEncoder().encode('Ma'))).toBe('TWE=')
    expect(toBase64(new TextEncoder().encode('M'))).toBe('TQ==')
    expect(encodeCells(Uint32Array.of(0x2588, 0xff8800, 0x01000000))).toBe('iCUAAACI/wAAAAAB')
  })
})
