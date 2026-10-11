import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Member } from '../types'
import { addMember, layout, pose, reconcile, sameCrew, seedOf, spawnX, step } from './crew'
import type { Sim } from './crew'
import { drawFrame, encodeCells, ROWS } from './sprites'

const crew = atom({ plugin: 'subagent-crew', key: 'crew' } as const, [])

const FRAME_MS = 66
const POLL_MS = 400
const RASTER_KEY = 'crew'

export const register: Register = on => {
  // The crew's copy for the frame clock, and what only animation needs: lost
  // on a reload and rebuilt from $.state by the next poll or draw.
  let members: readonly Member[] = []
  let mounted: { requestId: string; columns: number } | null = null
  let lastTick = 0
  const sims = new Map<string, Sim>()
  const busy = new Map<string, number>()

  const frame = (now: number, dt: number, columns: number) => {
    const { lanes, overflow } = layout(members.length, columns)
    const drawn = lanes.map((lane, i) => {
      const member = members[i]!
      const seed = seedOf(member.id)
      let sim = sims.get(member.id)
      if (sim === undefined) {
        sim = { x: spawnX(lane, seed), dir: seed < 0.5 ? 1 : -1 }
        sims.set(member.id, sim)
      }
      const isBusy = (busy.get(member.id) ?? 0) > 0
      step(sim, member, lane, isBusy, now, dt)

      return pose(member, sim, isBusy, now, seed)
    })
    for (const id of sims.keys()) {
      if (!members.some(member => member.id === id)) {
        sims.delete(id)
      }
    }

    return encodeCells(drawFrame(columns, drawn, overflow > 0 ? `+${overflow}` : null))
  }

  on('session.start', async ($, e, next) => {
    $.clock.every(POLL_MS, async () => {
      try {
        const [prev, agents, now] = await Promise.all([read($, crew), $.agent.list(), $.clock.now()])
        const nextCrew = reconcile(prev, agents, now)
        members = nextCrew
        if (!sameCrew(prev, nextCrew)) {
          await update($, crew, () => nextCrew)
        }
      } catch {
        // A missed poll is retried on the next period.
      }
    })

    $.clock.every(FRAME_MS, async () => {
      if (mounted === null || members.length === 0) {
        lastTick = 0
        return
      }
      try {
        const now = await $.clock.now()
        const dt = lastTick === 0 ? 0 : Math.min((now - lastTick) / 1000, 0.25)
        lastTick = now
        const { requestId, columns } = mounted
        const result = await $.ui.blit({ requestId, key: RASTER_KEY, cells: frame(now, dt, columns) })
        if (result.deny !== undefined) {
          // Collapsed or unmounted: the next draw mounts it again.
          mounted = null
        }
      } catch {
        mounted = null
      }
    })

    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const result = await next(e)
    const agentId = 'agentId' in result ? result.agentId : undefined
    if (agentId !== undefined) {
      const now = await $.clock.now()
      await update($, crew, prev => (members = addMember(prev, { id: agentId, type: e.subagentType }, now)))
    }

    return result
  }).catch(($, e, next) => next(e)) // never in the way of a spawn: the poll picks the agent up

  // Counts each subagent's tool calls in flight, so a busy mascot bounces.

  on('tool.call', async ($, e, next) => {
    const id = e.agentId
    if (id === undefined) {
      return next(e)
    }
    busy.set(id, (busy.get(id) ?? 0) + 1)
    try {
      return await next(e)
    } finally {
      const left = (busy.get(id) ?? 1) - 1
      if (left > 0) {
        busy.set(id, left)
      } else {
        busy.delete(id)
      }
    }
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const current = await read($, crew)
    members = current
    if (e.surface !== 'terminal' || e.props.hasSurvey || current.length === 0) {
      mounted = null
      return next(e)
    }

    const columns = Math.max(1, Math.min(512, e.props.bodyColumns))
    mounted = { requestId: e.requestId, columns }
    const { Box, Raster } = $.ui.resolve(e)
    const others = await next(e)
    const cells = frame(await $.clock.now(), 0, columns)

    return (
      <Box flexDirection="column">
        {others}
        <Raster key={RASTER_KEY} columns={columns} rows={ROWS} cells={cells} />
      </Box>
    )
  })
}
