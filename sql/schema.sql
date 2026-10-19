-- ╔══════════════════════════════════════════════════════════════╗
-- ║  Taekwondo Scoring App — Supabase Schema                    ║
-- ║  Run this once in: Supabase Dashboard → SQL Editor          ║
-- ╚══════════════════════════════════════════════════════════════╝

-- ─── Enable UUID extension ──────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Tables ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS matches (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  match_code          text,
  division            text,
  gender              text,
  weight_class        text,
  round_seconds       int         NOT NULL DEFAULT 120,
  total_rounds        int         NOT NULL DEFAULT 3,
  red_name            text        NOT NULL,
  red_country         char(3),
  blue_name           text        NOT NULL,
  blue_country        char(3),
  status              text        NOT NULL DEFAULT 'setup'
                      CHECK (status IN ('setup','live','paused','round_break','finished')),
  current_round       int         NOT NULL DEFAULT 1,
  timer_status        text        NOT NULL DEFAULT 'idle'
                      CHECK (timer_status IN ('idle','running','paused')),
  timer_remaining_ms  int         NOT NULL DEFAULT 120000,
  timer_started_at    timestamptz,
  red_gam_jeom        int         NOT NULL DEFAULT 0,
  blue_gam_jeom       int         NOT NULL DEFAULT 0,
  red_vr_quota        int         NOT NULL DEFAULT 1,
  blue_vr_quota       int         NOT NULL DEFAULT 1,
  operator_id         uuid        NOT NULL REFERENCES auth.users(id),
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS score_events (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id     uuid        NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  round_number int         NOT NULL,
  corner       text        NOT NULL CHECK (corner IN ('red','blue')),
  points       int         NOT NULL,
  source       text        NOT NULL DEFAULT 'manual'
               CHECK (source IN ('manual','gam_jeom')),
  created_by   uuid        NOT NULL REFERENCES auth.users(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS round_results (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id     uuid        NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  round_number int         NOT NULL,
  red_score    int         NOT NULL DEFAULT 0,
  blue_score   int         NOT NULL DEFAULT 0,
  winner       text        CHECK (winner IN ('red','blue','tie')),
  closed_at    timestamptz NOT NULL DEFAULT now()
);

-- ─── High-Performance Indexes ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_matches_operator_created ON matches (operator_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_score_events_match_round ON score_events (match_id, round_number, corner);
CREATE INDEX IF NOT EXISTS idx_score_events_match_corner_created ON score_events (match_id, corner, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_score_events_match_source_created ON score_events (match_id, corner, source, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_round_results_match_winner ON round_results (match_id, winner);

-- ─── Enable Realtime on tables (Idempotent) ──────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'matches'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE matches;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'score_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE score_events;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'round_results'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE round_results;
  END IF;
END $$;

-- ─── Row Level Security ──────────────────────────────────────────────────────

ALTER TABLE matches       ENABLE ROW LEVEL SECURITY;
ALTER TABLE score_events  ENABLE ROW LEVEL SECURITY;
ALTER TABLE round_results ENABLE ROW LEVEL SECURITY;

-- Drop existing policies first (safe to re-run)
DROP POLICY IF EXISTS "operator_all"    ON matches;
DROP POLICY IF EXISTS "public_read"     ON matches;
DROP POLICY IF EXISTS "operator_insert" ON score_events;
DROP POLICY IF EXISTS "public_read"     ON score_events;
DROP POLICY IF EXISTS "operator_insert" ON round_results;
DROP POLICY IF EXISTS "public_read"     ON round_results;

-- matches: operator full access to their own; everyone can SELECT
CREATE POLICY "operator_all" ON matches FOR ALL
  USING     (auth.uid() = operator_id)
  WITH CHECK (auth.uid() = operator_id);

CREATE POLICY "public_read"  ON matches FOR SELECT
  USING (true);

-- score_events: operator can insert into their own match; everyone SELECT
CREATE POLICY "operator_insert" ON score_events FOR INSERT
  WITH CHECK (
    auth.uid() = created_by
    AND auth.uid() = (SELECT operator_id FROM matches WHERE id = match_id)
  );

CREATE POLICY "public_read"     ON score_events FOR SELECT
  USING (true);

-- round_results: operator can insert; everyone SELECT
CREATE POLICY "operator_insert" ON round_results FOR INSERT
  WITH CHECK (
    auth.uid() = (SELECT operator_id FROM matches WHERE id = match_id)
  );

CREATE POLICY "public_read"     ON round_results FOR SELECT
  USING (true);

-- ─── Scoring Functions ───────────────────────────────────────────────────────

-- 1. Start the match timer
CREATE OR REPLACE FUNCTION start_timer(p_match_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE matches
  SET
    timer_status     = 'running',
    timer_started_at = now(),
    status           = 'live'
  WHERE id = p_match_id AND operator_id = auth.uid();
END;
$$;

-- 2. Pause the match timer (freezes remaining_ms at current value)
CREATE OR REPLACE FUNCTION pause_timer(p_match_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  m matches%ROWTYPE;
BEGIN
  SELECT * INTO m FROM matches
  WHERE id = p_match_id AND operator_id = auth.uid();

  IF m.timer_status = 'running' THEN
    UPDATE matches
    SET
      timer_status       = 'paused',
      timer_remaining_ms = GREATEST(0,
        m.timer_remaining_ms -
        (EXTRACT(EPOCH FROM (now() - m.timer_started_at)) * 1000)::int
      ),
      timer_started_at   = NULL,
      status             = 'paused'
    WHERE id = p_match_id;
  END IF;
END;
$$;

-- 3. Award points to a corner
CREATE OR REPLACE FUNCTION add_score(p_match_id uuid, p_corner text, p_points int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO score_events (match_id, round_number, corner, points, source, created_by)
  SELECT id, current_round, p_corner, p_points, 'manual', auth.uid()
  FROM matches WHERE id = p_match_id AND operator_id = auth.uid();
END;
$$;

-- 4. Issue a gam-jeom (penalty) to a corner → +1 point to opponent
CREATE OR REPLACE FUNCTION add_gam_jeom(p_match_id uuid, p_corner text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  opponent text := CASE WHEN p_corner = 'red' THEN 'blue' ELSE 'red' END;
BEGIN
  -- Increment gam-jeom on penalized corner
  IF p_corner = 'red' THEN
    UPDATE matches SET red_gam_jeom  = red_gam_jeom  + 1
    WHERE id = p_match_id AND operator_id = auth.uid();
  ELSE
    UPDATE matches SET blue_gam_jeom = blue_gam_jeom + 1
    WHERE id = p_match_id AND operator_id = auth.uid();
  END IF;

  -- +1 point to opponent
  INSERT INTO score_events (match_id, round_number, corner, points, source, created_by)
  SELECT id, current_round, opponent, 1, 'gam_jeom', auth.uid()
  FROM matches WHERE id = p_match_id AND operator_id = auth.uid();
END;
$$;

-- 5. Close current round and advance (or finish match)
CREATE OR REPLACE FUNCTION next_round(p_match_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  m          matches%ROWTYPE;
  r_score    int;
  b_score    int;
  rnd_winner text;
  red_wins   int;
  blue_wins  int;
BEGIN
  SELECT * INTO m FROM matches
  WHERE id = p_match_id AND operator_id = auth.uid();

  -- Compute current round scores (clamped to min 0)
  SELECT GREATEST(0, COALESCE(SUM(points), 0)) INTO r_score
  FROM score_events
  WHERE match_id = p_match_id AND round_number = m.current_round AND corner = 'red';

  SELECT GREATEST(0, COALESCE(SUM(points), 0)) INTO b_score
  FROM score_events
  WHERE match_id = p_match_id AND round_number = m.current_round AND corner = 'blue';

  rnd_winner := CASE
    WHEN r_score > b_score THEN 'red'
    WHEN b_score > r_score THEN 'blue'
    ELSE 'tie'
  END;

  -- Record round result
  INSERT INTO round_results (match_id, round_number, red_score, blue_score, winner)
  VALUES (p_match_id, m.current_round, r_score, b_score, rnd_winner);

  -- Count round wins
  SELECT COUNT(*) INTO red_wins  FROM round_results WHERE match_id = p_match_id AND winner = 'red';
  SELECT COUNT(*) INTO blue_wins FROM round_results WHERE match_id = p_match_id AND winner = 'blue';

  -- Majority OR final round → finish; otherwise advance
  IF red_wins  > (m.total_rounds / 2)
  OR blue_wins > (m.total_rounds / 2)
  OR m.current_round >= m.total_rounds
  THEN
    UPDATE matches
    SET status = 'finished', timer_status = 'idle', timer_started_at = NULL
    WHERE id = p_match_id;
  ELSE
    UPDATE matches
    SET
      current_round      = current_round + 1,
      timer_remaining_ms = round_seconds * 1000,
      timer_started_at   = NULL,
      timer_status       = 'idle',
      status             = 'round_break',
      red_gam_jeom       = 0,
      blue_gam_jeom      = 0
    WHERE id = p_match_id;
  END IF;
END;
$$;

-- 6. Reset match to initial state (clears all score data)
CREATE OR REPLACE FUNCTION reset_match(p_match_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  m matches%ROWTYPE;
BEGIN
  SELECT * INTO m FROM matches
  WHERE id = p_match_id AND operator_id = auth.uid();

  DELETE FROM score_events  WHERE match_id = p_match_id;
  DELETE FROM round_results WHERE match_id = p_match_id;

  UPDATE matches
  SET
    status             = 'setup',
    current_round      = 1,
    timer_status       = 'idle',
    timer_remaining_ms = round_seconds * 1000,
    timer_started_at   = NULL,
    red_gam_jeom       = 0,
    blue_gam_jeom      = 0,
    red_vr_quota       = 1,
    blue_vr_quota      = 1
  WHERE id = p_match_id;
END;
$$;

-- 7. Undo / delete last score event for a corner
CREATE OR REPLACE FUNCTION undo_last_score(p_match_id uuid, p_corner text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_last_id uuid;
BEGIN
  -- Verify operator
  IF NOT EXISTS (SELECT 1 FROM matches WHERE id = p_match_id AND operator_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT id INTO v_last_id
  FROM score_events
  WHERE match_id = p_match_id AND corner = p_corner
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_last_id IS NOT NULL THEN
    DELETE FROM score_events WHERE id = v_last_id;
  END IF;
END;
$$;

-- 8. Deduct a gam-jeom penalty if issued by mistake
CREATE OR REPLACE FUNCTION remove_gam_jeom(p_match_id uuid, p_corner text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  opponent text := CASE WHEN p_corner = 'red' THEN 'blue' ELSE 'red' END;
  v_last_gj_id uuid;
BEGIN
  -- Decrement gam-jeom count (min 0)
  IF p_corner = 'red' THEN
    UPDATE matches SET red_gam_jeom = GREATEST(0, red_gam_jeom - 1)
    WHERE id = p_match_id AND operator_id = auth.uid();
  ELSE
    UPDATE matches SET blue_gam_jeom = GREATEST(0, blue_gam_jeom - 1)
    WHERE id = p_match_id AND operator_id = auth.uid();
  END IF;

  -- Remove the opponent +1 point that was awarded by that gam-jeom
  SELECT id INTO v_last_gj_id
  FROM score_events
  WHERE match_id = p_match_id AND corner = opponent AND source = 'gam_jeom'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_last_gj_id IS NOT NULL THEN
    DELETE FROM score_events WHERE id = v_last_gj_id;
  END IF;
END;
$$;

-- 9. Toggle VR challenge quota (used / available)
CREATE OR REPLACE FUNCTION toggle_vr(p_match_id uuid, p_corner text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF p_corner = 'red' THEN
    UPDATE matches SET red_vr_quota = CASE WHEN red_vr_quota > 0 THEN 0 ELSE 1 END
    WHERE id = p_match_id AND operator_id = auth.uid();
  ELSE
    UPDATE matches SET blue_vr_quota = CASE WHEN blue_vr_quota > 0 THEN 0 ELSE 1 END
    WHERE id = p_match_id AND operator_id = auth.uid();
  END IF;
END;
$$;
