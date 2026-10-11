// What a mascot looks like. Its color and the item it holds are its own:
// each joins with a color and an item no other mascot has, Claude's own orange
// first. Its agent type gives the label and a favourite item, taken when free.
// Item rows are drawn as if the mascot faces right, column 0 at its hand;
// facing left mirrors them.

export type Item = { name: string; rows: readonly string[]; colors: Readonly<Record<string, number>> }

/** The palette one mascot is drawn in. */
export type Skin = { body: number; eye: number; leg: number }

/** What an agent type gives its mascots: the label and a favourite item. */
export type TypeLook = { label: string; favourite: number | null }

/** Claude's mascot orange, the first color handed out. */
export const CLAUDE_ORANGE = 0xd97757

export const COLORS: readonly number[] = [
  CLAUDE_ORANGE,
  0x5ba88c, // sage
  0x8e7cc3, // lavender
  0xd4a72c, // gold
  0xc2607a, // rose
  0x5b9bd5, // sky
  0x3fb6b2, // teal
  0x9cc95b, // lime
  0xc9a27e, // sand
  0x8a94a6, // slate
]

export const ITEMS: readonly Item[] = [
  { name: 'magnifier', rows: ['GG', 'GG', 'H.'], colors: { G: 0x9fd3e6, H: 0x8b5a2b } },
  { name: 'clipboard', rows: ['CC', 'WW', 'WW'], colors: { C: 0xa0703f, W: 0xf2eee6 } },
  { name: 'book', rows: ['UU', 'UW', 'UU'], colors: { U: 0x4a6fa5, W: 0xf2eee6 } },
  { name: 'hammer', rows: ['MM', 'H.', 'H.'], colors: { M: 0xb8b8b8, H: 0x8b5a2b } },
  { name: 'mug', rows: ['S.', 'MM', 'MM'], colors: { S: 0xd0ccc4, M: 0xe8e2d6 } },
  { name: 'flag', rows: ['PF', 'PF', 'P.'], colors: { P: 0x8b5a2b, F: 0xe5484d } },
  { name: 'balloon', rows: ['BB', 'BB', 'S.'], colors: { B: 0xe86fa0, S: 0xb8b8b8 } },
  { name: 'pencil', rows: ['.T', '.Y', 'Y.'], colors: { T: 0x3a3a3a, Y: 0xf5c451 } },
  { name: 'flower', rows: ['FY', 'G.', 'G.'], colors: { F: 0xf08a5d, Y: 0xf5c451, G: 0x5ba88c } },
  { name: 'torch', rows: ['Y', 'O', 'H'], colors: { Y: 0xf5c451, O: 0xe5484d, H: 0x8b5a2b } },
]

const itemIndex = (name: string) => ITEMS.findIndex(item => item.name === name)

const EYE = 0x1f1e1d

const TYPES: Readonly<Record<string, TypeLook>> = {
  'general-purpose': { label: 'general', favourite: itemIndex('mug') },
  Explore: { label: 'explore', favourite: itemIndex('magnifier') },
  Plan: { label: 'plan', favourite: itemIndex('clipboard') },
  'claude-code-guide': { label: 'guide', favourite: itemIndex('book') },
  'statusline-setup': { label: 'status', favourite: itemIndex('hammer') },
}

/** The label and favourite item for an agent type; an unknown type has no favourite. */
export function typeLook(type: string): TypeLook {
  const named = TYPES[type]
  if (named !== undefined) {
    return named
  }

  const label = (type.split(':').pop() ?? type).toLowerCase().slice(0, 7)

  return { label: label || 'agent', favourite: null }
}

/** The palette for a color index; an index outside the list draws in Claude orange. */
export function skinOf(color: number): Skin {
  const body = COLORS[color] ?? CLAUDE_ORANGE

  return { body, eye: EYE, leg: shade(body, 0.65) }
}

/** The color a joining mascot wears: the first in the list nobody wears, else the least worn. */
export function pickColor(worn: readonly number[]): number {
  return leastUsed(COLORS.length, 0, worn)
}

/**
 * The item a joining mascot holds: its type's favourite when nobody holds it,
 * else the free item its id hashes to first, else the least held one.
 */
export function pickItem(id: string, type: string, held: readonly number[]): number {
  const { favourite } = typeLook(type)
  if (favourite !== null && !held.includes(favourite)) {
    return favourite
  }

  return leastUsed(ITEMS.length, hash(id) % ITEMS.length, held)
}

function leastUsed(size: number, start: number, used: readonly number[]): number {
  let best = start
  let bestCount = Infinity
  for (let i = 0; i < size; i++) {
    const index = (start + i) % size
    const count = used.filter(u => u === index).length
    if (count < bestCount) {
      best = index
      bestCount = count
    }
  }

  return best
}

/** FNV-1a over the string's UTF-16 units: a stable 32-bit number per string. */
export function hash(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }

  return h
}

function shade(rgb: number, factor: number): number {
  const r = Math.round(((rgb >> 16) & 0xff) * factor)
  const g = Math.round(((rgb >> 8) & 0xff) * factor)
  const b = Math.round((rgb & 0xff) * factor)

  return (r << 16) | (g << 8) | b
}
