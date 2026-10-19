# Taekwondo Scoring App — Build Plan

Oct 18, 2026 · @Guhan

## Overview

A single operator scores one match at a time from a cloud-hosted Control panel; a public Scoreboard page mirrors it live for the audience. Built for real club and event use, not just a demo.

Three screens share one backend:

- **Setup** — the operator creates a match (athletes, country codes, division, weight class, round time, round count) and gets back a Control link and a public Scoreboard link.
- **Control** — the operator's panel: +1 to +5 scoring, gam-jeom (+1 to the opponent), timer start/pause/reset, round advance, horn.
- **Scoreboard** — read-only, no login, built for a venue TV: live score, round, timer, gam-jeom.

No automatic multi-referee consensus voting in v1 — one operator enters every point directly (Scoring & timer logic, below). Multi-court and tournament management are also deferred (Build roadmap).

## Data model

Three tables carry the whole v1 system, and score is never a stored counter — only ever the sum of an append-only log, so corrections and a full point-by-point history come for free.

**matches** — one row per match, holding both its configuration and its live state

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid, PK |  |
| match\_code | text | e.g. "M-201" |
| division, gender, weight\_class | text |  |
| round\_seconds, total\_rounds | int | e.g. 120, 3 |
| red\_name, red\_country | text | country as a 3-letter code |
| blue\_name, blue\_country | text |  |
| status | text | setup / live / paused / round\_break / finished |
| current\_round | int |  |
| timer\_status | text | idle / running / paused |
| timer\_remaining\_ms | int | snapshot; combine with timer\_started\_at for the live countdown |
| timer\_started\_at | timestamptz | null when not running |
| red\_gam\_jeom, blue\_gam\_jeom | int | current round's count |
| red\_vr\_quota, blue\_vr\_quota | int | video-replay challenges left |
| operator\_id | uuid, FK → auth.users | who controls this match |
| created\_at | timestamptz |  |

**score\_events** — append-only; a corner's round score is `SUM(points)` over its rows

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid, PK |  |
| match\_id | uuid, FK → matches |  |
| round\_number | int |  |
| corner | text | red / blue |
| points | int | +1 to +5, or a negative correction |
| source | text | manual / gam\_jeom — leaves room for a future referee\_vote value |
| created\_by | uuid, FK → auth.users |  |
| created\_at | timestamptz |  |

**round\_results** — written once per round, when it closes

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid, PK |  |
| match\_id | uuid, FK → matches |  |
| round\_number | int |  |
| red\_score, blue\_score | int |  |
| winner | text | red / blue / tie |
| closed\_at | timestamptz |  |

## Scoring & timer logic

The timer is server-authoritative: the database stores only `timer_status`, `timer_remaining_ms`, and `timer_started_at` — every client computes its own countdown as `timer_remaining_ms - (now - timer_started_at)`, and only re-syncs when a new state arrives, so nothing needs a push every second.

Every write goes through a Postgres function, never a raw insert from the client — this keeps scoring atomic and makes a second open Control tab impossible to desync:

| Function | Does |
| --- | --- |
| `start_timer` | sets `timer_status='running'`, `timer_started_at=now()` |
| `pause_timer` | freezes `timer_remaining_ms` at the current countdown |
| `add_score(corner, points)` | inserts a `score_events` row |
| `add_gam_jeom(corner)` | +1 gam-jeom for `corner`, and a `score_events` row of +1 for the opponent — one transaction |
| `next_round` | writes the round's `round_results` row, resets the timer and gam-jeom counts, advances `current_round` |
| `reset_match` | clears state back to `status='setup'` |

&#91;embedded content: state flow · idle, running, decision, match end\]

A round that closes with the match still undecided loops back to idle for the next round; once a corner holds the majority of round wins, `next_round` sets `status='finished'` instead.

## Realtime architecture

Every write lands in Postgres first — no client ever talks to another client directly, so the Scoreboard, and any future second screen, can only ever show what the database actually holds.

&#91;embedded content: control → scoring RPC → Postgres → Realtime → scoreboard\]

The Control panel calls a scoring RPC (above), which writes to Postgres inside a transaction; Postgres' own replication stream feeds Supabase Realtime, which rebroadcasts the change to every subscriber on that match's channel — including the Scoreboard tab, and the Control panel itself, so a second operator device would also stay in sync. A client that reconnects mid-match just re-reads the current row from `matches` and `score_events` rather than waiting for the next event, so a dropped Wi-Fi connection at the venue never loses state.

## Screens & routes

Three routes, two access levels:

| Route | Who | Purpose |
| --- | --- | --- |
| `/setup` | Operator, signed in | Create a match; get back its Control and Scoreboard links |
| `/control/[matchId]` | Operator, signed in | Score, run the clock, advance rounds, sound the horn |
| `/scoreboard/[matchId]` | Public, no login | Live display for a venue TV or projector |

Row-level security enforces this at the database, not just in the UI: only the match's `operator_id` can call the scoring functions or write to `matches`, while `/scoreboard` reads through a public, read-only policy — so the link can be shared freely without exposing any write access.

## Visual theme

A hybrid: glass for the information surfaces, clay for anything tappable — so an operator's eyes can tell, without reading, what's a status and what's a button.

- **Base** — near-black background (`#0B0D12`), matching the reference's dark arena feel.
- **Glass** — score panels, chips, and the timer card: translucent fill, 1px semi-transparent border, light backdrop-blur, a faint inner highlight along the top edge.
- **Clay** — every button on the Control panel: soft rounded corners, a dual shadow (light from the top-left, dark from the bottom-right) that inverts briefly on tap for a pressed feel.
- **Corner colors** — red corner / Hong: `#C81E3A → #7A0F22` gradient; blue corner / Chung: `#1E5FC8 → #0F2E7A` gradient — used sparingly, as accents rather than full backgrounds, to keep the "simple" brief.
- **Accent** — amber/yellow (`#F5C518`) for the timer digits and primary actions (Start, Initialize Match), echoing the reference screens.
- **Type** — a 7-segment/digital face for the timer and score numerals; a clean geometric sans (Inter or Manrope) for every label.

The Scoreboard leans more glass — it's read, not touched. The Control panel leans more clay — it's operated under time pressure, so buttons should look unmistakably pressable.

## Build roadmap

Backend first, in this order — each phase produces something testable before the next begins:

1. **Schema + RLS** — the three tables above, with policies restricting match writes to its `operator_id` and opening `/scoreboard` reads to the public.
2. **Scoring engine** — the six Postgres functions (Scoring & timer logic), tested directly via SQL before any UI exists.
3. **Realtime wiring** — confirm a change from one Supabase client reaches a second one quickly, before building any screen around it.
4. **Setup** — match creation, generating the Control and Scoreboard links.
5. **Control panel** — wired to the real functions, glass + clay styling.
6. **Scoreboard** — public, read-only, TV-friendly layout.
7. **Theme pass** — apply the full glass + clay system consistently across all three screens.

Deliberately deferred to v2: referee-device consensus scoring (the `score_events.source` column already leaves room for a `referee_vote` type), multi-court / tournament and bracket management, and native Android referee controllers.
