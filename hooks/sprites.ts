// Pixel art drawn into a Raster. Each terminal cell holds two pixels stacked
// with half blocks, so the band's 3 drawing rows are 6 pixels tall, and a 4th
// row carries the labels.

import type { Item, Skin } from './skins'

export const PIXEL_ROWS = 6
export const ROWS = PIXEL_ROWS / 2 + 1
export const BODY_WIDTH = 6
export const ITEM_WIDTH = 2

/** The terminal's default color, in a Raster cell's color slot. */
export const DEFAULT = 0x01000000

const UPPER_HALF = 0x2580
const LOWER_HALF = 0x2584
const SPACE = 0x20
const NOTE_COLOR = 0x8a8580
const SPARKLE = 0xf5c451
const FLOP_BODY = 0x8a8580
const FLOP_EYE = 0xe5484d

const BODY = ['BBBBBB', 'BEBBEB', 'BBBBBB']
const LEGS = ['L.LL.L', '.L..L.']
const FLOP = ['BXBBXB', 'BBBBBB']

export type Mood = 'normal' | 'party' | 'flop'

/** One mascot as it stands in this frame. `x` is the body's left column. */
export type Drawn = {
  skin: Skin
  item: Item | null
  x: number
  hop: number
  dir: 1 | -1
  step: 0 | 1
  blink: boolean
  mood: Mood
  label: string | null
}

/** Draws the frame as Raster words: `[codePoint, fg, bg]` per cell, row-major. */
export function drawFrame(columns: number, actors: readonly Drawn[], note: string | null): Uint32Array {
  const pixels = new Uint32Array(columns * PIXEL_ROWS).fill(DEFAULT)
  const put = (x: number, y: number, color: number) => {
    if (x >= 0 && x < columns && y >= 0 && y < PIXEL_ROWS) {
      pixels[y * columns + x] = color
    }
  }
  const paint = (rows: readonly string[], left: number, top: number, colors: Readonly<Record<string, number>>) => {
    rows.forEach((row, dy) => {
      for (let dx = 0; dx < row.length; dx++) {
        const color = colors[row[dx]!]
        if (color !== undefined) {
          put(left + dx, top + dy, color)
        }
      }
    })
  }

  for (const actor of actors) {
    const x = Math.round(actor.x)
    const { skin } = actor

    if (actor.mood === 'flop') {
      paint(FLOP, x, PIXEL_ROWS - FLOP.length, { B: FLOP_BODY, X: FLOP_EYE, L: shadeOf(FLOP_BODY) })
      continue
    }

    const top = PIXEL_ROWS - BODY.length - 1 - actor.hop
    const eye = actor.blink ? skin.body : skin.eye
    paint([...BODY, LEGS[actor.step]!], x, top, { B: skin.body, E: eye, L: skin.leg })

    if (actor.item !== null) {
      const { item } = actor
      const width = Math.max(...item.rows.map(row => row.length))
      const rows = actor.dir === 1 ? item.rows : item.rows.map(row => mirror(row.padEnd(width, '.')))
      const left = actor.dir === 1 ? x + BODY_WIDTH : x - width
      paint(rows, left, top, item.colors)
    }

    if (actor.mood === 'party') {
      const flip = actor.step === 0
      put(flip ? x - 1 : x + BODY_WIDTH, top, SPARKLE)
      put(flip ? x + BODY_WIDTH : x - 1, top + 2, SPARKLE)
    }
  }

  const words = new Uint32Array(columns * ROWS * 3)
  const cell = (row: number, column: number, glyph: number, fg: number, bg: number) => {
    const at = (row * columns + column) * 3
    words[at] = glyph
    words[at + 1] = fg
    words[at + 2] = bg
  }

  for (let row = 0; row < PIXEL_ROWS / 2; row++) {
    for (let column = 0; column < columns; column++) {
      const upper = pixels[row * 2 * columns + column]!
      const lower = pixels[(row * 2 + 1) * columns + column]!
      if (upper === DEFAULT && lower === DEFAULT) {
        cell(row, column, SPACE, DEFAULT, DEFAULT)
      } else if (upper === DEFAULT) {
        cell(row, column, LOWER_HALF, lower, DEFAULT)
      } else {
        cell(row, column, UPPER_HALF, upper, lower)
      }
    }
  }

  const labelRow = ROWS - 1
  for (let column = 0; column < columns; column++) {
    cell(labelRow, column, SPACE, DEFAULT, DEFAULT)
  }
  const write = (text: string, start: number, color: number) => {
    for (let i = 0; i < text.length; i++) {
      const column = start + i
      if (column >= 0 && column < columns) {
        const code = text.charCodeAt(i)
        cell(labelRow, column, code >= 0x20 && code <= 0x7e ? code : 0x3f, color, DEFAULT)
      }
    }
  }

  for (const actor of actors) {
    if (actor.label !== null) {
      const text = actor.label.slice(0, BODY_WIDTH + 2)
      const color = actor.mood === 'flop' ? FLOP_EYE : actor.skin.body
      write(text, Math.round(actor.x) + Math.floor((BODY_WIDTH - text.length) / 2), color)
    }
  }
  if (note !== null) {
    write(note, columns - note.length - 1, NOTE_COLOR)
  }

  return words
}

/** Packs Raster words as `RasterProps.cells` wants: base64 of little-endian u32s. */
export function encodeCells(words: Uint32Array): string {
  const bytes = new Uint8Array(words.length * 4)
  const view = new DataView(bytes.buffer)
  words.forEach((word, i) => view.setUint32(i * 4, word, true))

  return toBase64(bytes)
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

export function toBase64(bytes: Uint8Array): string {
  const out: string[] = []
  let i = 0
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!
    out.push(ALPHABET[(n >> 18) & 63]!, ALPHABET[(n >> 12) & 63]!, ALPHABET[(n >> 6) & 63]!, ALPHABET[n & 63]!)
  }
  if (bytes.length - i === 1) {
    const n = bytes[i]! << 16
    out.push(ALPHABET[(n >> 18) & 63]!, ALPHABET[(n >> 12) & 63]!, '==')
  } else if (bytes.length - i === 2) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8)
    out.push(ALPHABET[(n >> 18) & 63]!, ALPHABET[(n >> 12) & 63]!, ALPHABET[(n >> 6) & 63]!, '=')
  }

  return out.join('')
}

const mirror = (row: string) => [...row].reverse().join('')

const shadeOf = (rgb: number) => ((rgb >> 1) & 0x7f7f7f)
