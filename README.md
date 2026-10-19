# 🥋 TankondoSB — World Taekwondo Live Scoring System

A single-operator live Taekwondo scoring web application with cloud synchronization and a venue TV scoreboard, built to the visual specification of World Taekwondo (WT) competition scoreboards.

![Stack](https://img.shields.io/badge/Stack-Vite%20%7C%20Vanilla%20JS%20%7C%20Supabase-amber)
![Build](https://img.shields.io/badge/Build-Passing%20(649ms)-brightgreen)
![Status](https://img.shields.io/badge/Production-Ready-blue)

---

## 🌟 Key Features

- **Three Dedicated Views**:
  - **Login / Portal (`/`)**: Secure operator authentication powered by Supabase GoTrue Auth.
  - **Match Setup (`/pages/setup/`)**: Configure athlete names, 3-letter country codes, division, weight class, round duration, and round count (best-of-3 / best-of-5). Automatically generates 1-click shareable links for the operator Control panel and the public TV Scoreboard.
  - **Control Panel (`/pages/control/?id=[matchId]`)**: Real-time scoring interface with +1 to +5 point buttons, -1 point correction, Gam-jeom penalty management (+1 to opponent), Undo last point, VR Challenge quota toggle, server-authoritative timer controls, and a synthesized arena buzzer horn.
  - **Venue Scoreboard (`/pages/scoreboard/?id=[matchId]`)**: Zero-auth broadcast TV layout with Orbitron typography, 2-digit padded score numerals, real-time timer with urgent red pulse in final 10 seconds, round win indicators (`R1`, `R2`, `R3`), Gam-jeom counters, VR challenge badges, and dynamic status pills (`LIVE`, `PAUSED`, `ROUND BREAK`, `FINAL DECISION`).
- **Web Audio API Buzzer**: Dual-oscillator square wave synthesizer simulating an arena horn — requires zero external MP3/WAV assets.
- **Operator Keyboard Shortcuts**: Rapid single-operator scoring during high-speed matches.
- **Throttled Timer Engine**: Server-authoritative timer synchronized with PostgreSQL timestamps, consuming zero CPU cycles when stopped/paused and eliminating DOM thrashing.

---

## 🚀 Getting Started

### 1. Prerequisites
- **Node.js** v18+ (tested on Node.js v24)
- **Supabase Account & Project**

### 2. Environment Configuration
Credentials are automatically read from `.env` in the project root:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-publishable-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-secret-key
```

### 3. Database Initialization
Run the PostgreSQL schema once in your Supabase project:

1. Open your **[Supabase Dashboard](https://supabase.com/dashboard/project/qdvuoqdhuntljartzloq)**.
2. Navigate to **SQL Editor** in the left sidebar.
3. Click **New Query**, paste the complete contents of [`sql/schema.sql`](./sql/schema.sql), and click **Run**.

The schema creates:
- 3 tables: `matches`, `score_events`, `round_results`
- Composite query performance indexes
- Row Level Security (RLS) policies allowing public live read on scoreboards while restricting scoring controls to the authorized operator
- Realtime publication subscriptions
- 9 PostgreSQL stored functions (`start_timer`, `pause_timer`, `add_score`, `undo_last_score`, `add_gam_jeom`, `remove_gam_jeom`, `toggle_vr`, `next_round`, `reset_match`)

---

## ⌨️ Operator Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| <kbd>Space</kbd> | Toggle Timer Start / Pause |
| <kbd>H</kbd> | Sound Arena Horn |
| <kbd>1</kbd> - <kbd>5</kbd> | Red Corner: Add +1 to +5 Points |
| <kbd>A</kbd> | Red Corner: Deduct 1 Point (-1) |
| <kbd>Z</kbd> | Red Corner: Issue Gam-jeom (+1 to Blue) |
| <kbd>X</kbd> | Red Corner: Toggle VR Challenge Quota |
| <kbd>6</kbd> - <kbd>0</kbd> | Blue Corner: Add +1 to +5 Points (6=+1, 7=+2, 8=+3, 9=+4, 0=+5) |
| <kbd>L</kbd> | Blue Corner: Deduct 1 Point (-1) |
| <kbd>M</kbd> | Blue Corner: Issue Gam-jeom (+1 to Red) |
| <kbd>N</kbd> | Blue Corner: Toggle VR Challenge Quota |
| <kbd>F</kbd> | Scoreboard: Toggle Native Fullscreen |
| <kbd>Esc</kbd> | Close Modals & Overlays |

---

## 📦 Production Build & Deployment

### Build Locally
```bash
npm install
npm run build
```
The output will be generated into the `dist/` directory in under 1 second.

### Deploy to Vercel
Configuration is included in [`vercel.json`](./vercel.json):
```bash
npx vercel --prod
```

### Deploy to Netlify
Configuration is included in [`netlify.toml`](./netlify.toml):
```bash
npx netlify deploy --prod --dir=dist
```
