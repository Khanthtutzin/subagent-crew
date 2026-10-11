# subagent-crew

A Claude Code mod that shows your running subagents as little pixel Claude mascots above the prompt.

Each subagent gets a mascot while it works. The mascot wanders and hops, bounces faster while its agent runs a tool, and celebrates or flops when the agent finishes before walking off. When no subagents are running, the band takes up no space.

## Install

Type this at the prompt of a Claude Code terminal session:

```
/plugin install subagent-crew --marketplace Khanthtutzin/subagent-crew
```

Answer `y` to add the marketplace, then pick a scope (user scope is the default). The mod is active right away.

## What you see

- **One mascot per subagent**, labelled with its agent type (`explore`, `plan`, `general`, ...).
- **Every mascot wears its own color.** The first one wears Claude orange; the rest take sage, lavender, gold, rose, sky, teal, lime, sand and slate in turn.
- **Every mascot holds its own item.** Each agent type has a favourite item (magnifier for Explore, clipboard for Plan, book for claude-code-guide, hammer for statusline-setup, mug for general-purpose). A mascot gets its type's favourite if it's free, otherwise another free item: flag, balloon, pencil, flower or torch.
- **Motion:**
  - **Running:** wanders its lane and hops now and then.
  - **Using a tool:** bounces in place.
  - **Waiting:** stands still.
- **Finishing:** `done!` gets a hop with sparkles; `failed` flops grey. After about 1.5 seconds the mascot walks off, and it's gone within 4 seconds.
- **Many agents:** up to 6 mascots at once, with a `+N` count for the rest. A narrow terminal shows fewer.

The band is 4 terminal rows tall and draws below anything other mods put above the prompt.

## Requirements

- Claude Code with function-hook mods; built and tested on 2.1.296. The mod API is early access and may change between releases.
- **Terminal only.** The band uses the terminal's cell grid, so the desktop app and IDE extensions don't show it.

## Develop

```
claude --plugin-dir ./subagent-crew   # run a session with the mod loaded from this folder
claude plugin validate ./subagent-crew
claude plugin test ./subagent-crew
```

Once Claude Code has loaded the mod from disk it writes the API types to `.claude-plugin/types/`, and `tsc -p .` type-checks against them.

| File | What it does |
| --- | --- |
| `hooks/register.tsx` | The hooks: polls `$.agent.list()`, tracks tool calls per subagent, and draws and animates the band |
| `hooks/crew.ts` | Who is on the band, lanes, movement and poses |
| `hooks/sprites.ts` | Pixel art and Raster encoding |
| `hooks/skins.ts` | Colors, items, and per-type labels |

## License

MIT
