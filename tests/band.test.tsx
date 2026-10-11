import type { AgentInfo } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

const BAND = {
  plugin: 'subagent-crew',
  surface: 'terminal',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: true,
    maxRows: 20,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

test('the band is hidden with no subagents and shows the crew once one runs', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  let agents: AgentInfo[] = []
  on('agent.list', () => ({ value: agents }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const empty = await $.ui.mount(BAND)
  expect(await empty.find({ type: 'Raster' })).toBeUndefined()
  await empty.unmount()

  agents = [{ id: 'a1', type: 'Explore', description: 'look around', status: 'running' }]
  await clock.advance(400)

  const band = await $.ui.mount(BAND)
  expect(await band.find({ type: 'Raster', key: 'crew' })).toBeDefined()
  await band.unmount()
})
