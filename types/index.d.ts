/** Where a subagent's loop stands, as the band shows it. */
export type Phase = 'active' | 'waiting' | 'done' | 'failed'

/**
 * One subagent on the band: its id, agent type, phase and when that phase
 * began, and the item it holds and color it wears (indexes into the mod's
 * item and color lists).
 */
export type Member = { id: string; type: string; phase: Phase; since: number; item: number; color: number }

declare module 'claude-code' {
  interface PluginState {
    'subagent-crew': { crew: Member[] }
  }
}
