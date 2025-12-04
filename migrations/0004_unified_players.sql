-- Unified Player Data Tables Migration
-- See docs/unified-player-architecture.md for full documentation

-- 1. ESPN Player Data - Cached snapshots from ESPN API
CREATE TABLE IF NOT EXISTS espn_player_data (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  espn_player_id INTEGER NOT NULL,
  sport TEXT NOT NULL,
  season INTEGER NOT NULL,
  first_name TEXT,
  last_name TEXT,
  full_name TEXT NOT NULL,
  team TEXT,
  position TEXT,
  jersey_number INTEGER,
  injury_status TEXT,
  injury_type TEXT,
  percent_owned REAL,
  percent_started REAL,
  average_points REAL,
  total_points REAL,
  last_fetched_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS espn_player_data_unique 
ON espn_player_data(sport, season, espn_player_id);

-- 2. FantasyPros Player Data - Separate from existing fantasy_pros_players
CREATE TABLE IF NOT EXISTS fp_player_data (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  fp_player_id TEXT NOT NULL,
  sport TEXT NOT NULL,
  season INTEGER NOT NULL,
  first_name TEXT,
  last_name TEXT,
  full_name TEXT NOT NULL,
  team TEXT,
  position TEXT,
  jersey_number INTEGER,
  status TEXT,
  injury_status TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS fp_player_data_unique 
ON fp_player_data(sport, season, fp_player_id);

-- 3. Defense vs Position Stats - For calculating OPRK
CREATE TABLE IF NOT EXISTS defense_vs_position_stats (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  sport TEXT NOT NULL,
  season INTEGER NOT NULL,
  week INTEGER,
  defense_team TEXT NOT NULL,
  position TEXT NOT NULL,
  games_played INTEGER,
  total_points_allowed REAL,
  avg_points_allowed REAL,
  rank INTEGER,
  scoring_type TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS defense_vs_position_unique 
ON defense_vs_position_stats(sport, season, week, defense_team, position, scoring_type);

-- 4. Player Crosswalk - Maps ESPN IDs to FantasyPros IDs
CREATE TABLE IF NOT EXISTS player_crosswalk (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_key TEXT NOT NULL,
  sport TEXT NOT NULL,
  season INTEGER NOT NULL,
  espn_player_id INTEGER,
  fp_player_id TEXT,
  match_confidence TEXT NOT NULL,
  manual_override BOOLEAN DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS player_crosswalk_unique 
ON player_crosswalk(sport, season, canonical_key);

CREATE INDEX IF NOT EXISTS player_crosswalk_espn 
ON player_crosswalk(sport, season, espn_player_id);

CREATE INDEX IF NOT EXISTS player_crosswalk_fp 
ON player_crosswalk(sport, season, fp_player_id);
