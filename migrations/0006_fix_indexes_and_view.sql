-- Corrective Migration: Add missing non-unique indexes and fix players_master view
-- Fixes issues identified in architect review

-- 1. Add missing team/position indexes (non-unique) for query performance
CREATE INDEX IF NOT EXISTS espn_player_data_team ON espn_player_data(sport, season, team);
CREATE INDEX IF NOT EXISTS espn_player_data_position ON espn_player_data(sport, season, position);
CREATE INDEX IF NOT EXISTS fp_player_data_team ON fp_player_data(sport, season, team);
CREATE INDEX IF NOT EXISTS fp_player_data_position ON fp_player_data(sport, season, position);

-- 2. Drop and recreate the materialized view with proper week filtering
DROP MATERIALIZED VIEW IF EXISTS players_master;

CREATE MATERIALIZED VIEW players_master AS
WITH 
-- Get the latest weekly ranking per player per season (subquery to avoid duplicates)
latest_rankings AS (
  SELECT DISTINCT ON (sport, season, player_id)
    sport,
    season,
    player_id,
    rank,
    tier,
    rank_type,
    scoring_type,
    week
  FROM fantasy_pros_rankings
  WHERE rank_type = 'weekly'
  ORDER BY sport, season, player_id, week DESC NULLS LAST
),
-- Get the latest projection per player per season (subquery to avoid duplicates)
latest_projections AS (
  SELECT DISTINCT ON (sport, season, player_id)
    sport,
    season,
    player_id,
    projected_points,
    opponent,
    stats,
    week,
    scoring_type
  FROM fantasy_pros_projections
  ORDER BY sport, season, player_id, week DESC NULLS LAST
),
-- Get the current week's matchup per team (use most recent week)
current_matchups AS (
  SELECT DISTINCT ON (season, team_abbr)
    season,
    team_abbr,
    opponent_abbr,
    game_time_utc,
    is_home,
    venue,
    game_day,
    week
  FROM nfl_matchups
  ORDER BY season, team_abbr, week DESC
),
-- Get the most recent defense vs position stats - PPR by default, fallback to any available
-- Uses DISTINCT ON without scoring_type to avoid row multiplication in joins
current_defense_stats AS (
  SELECT DISTINCT ON (sport, season, defense_team, position)
    sport,
    season,
    defense_team,
    position,
    rank,
    avg_points_allowed,
    scoring_type,
    week
  FROM defense_vs_position_stats
  ORDER BY sport, season, defense_team, position, 
    CASE scoring_type WHEN 'PPR' THEN 0 WHEN 'HALF' THEN 1 ELSE 2 END,
    week DESC NULLS LAST
)
SELECT 
  xw.id as crosswalk_id,
  xw.canonical_key,
  xw.sport,
  xw.season,
  xw.match_confidence,
  xw.manual_override,
  
  -- IDs from both systems
  e.espn_player_id,
  fp.fp_player_id,
  
  -- Player identity (prefer ESPN, fallback to FP)
  COALESCE(e.first_name, fp.first_name) as first_name,
  COALESCE(e.last_name, fp.last_name) as last_name,
  COALESCE(e.full_name, fp.full_name) as full_name,
  COALESCE(e.team, fp.team) as team,
  COALESCE(e.position, fp.position) as position,
  COALESCE(e.jersey_number, fp.jersey_number) as jersey_number,
  
  -- ESPN-specific data
  e.injury_status,
  e.percent_owned,
  e.percent_started,
  e.average_points,
  e.total_points,
  e.last_fetched_at as espn_last_fetched,
  
  -- Rankings (latest weekly ranking per player)
  r.rank as fp_rank,
  r.tier as fp_tier,
  r.rank_type,
  r.scoring_type as ranking_scoring_type,
  r.week as ranking_week,
  
  -- Projections (latest projection per player)
  p.projected_points,
  p.opponent as projection_opponent,
  p.stats as projection_stats,
  p.week as projection_week,
  p.scoring_type as projection_scoring_type,
  
  -- Matchup data (current week's matchup)
  m.opponent_abbr,
  m.game_time_utc,
  m.is_home,
  m.venue,
  m.game_day,
  m.week as matchup_week,
  
  -- OPRK (opponent rank from defense stats, matched by position and scoring type)
  dvp.rank as opponent_rank,
  dvp.avg_points_allowed as opponent_avg_allowed,
  dvp.scoring_type as oprk_scoring_type

FROM player_crosswalk xw
LEFT JOIN espn_player_data e 
  ON xw.espn_player_id = e.espn_player_id 
  AND xw.sport = e.sport 
  AND xw.season = e.season
LEFT JOIN fp_player_data fp 
  ON xw.fp_player_id = fp.fp_player_id 
  AND xw.sport = fp.sport 
  AND xw.season = fp.season
LEFT JOIN latest_rankings r 
  ON xw.fp_player_id = r.player_id 
  AND xw.sport = r.sport 
  AND xw.season = r.season
LEFT JOIN latest_projections p 
  ON xw.fp_player_id = p.player_id 
  AND xw.sport = p.sport 
  AND xw.season = p.season
LEFT JOIN current_matchups m 
  ON COALESCE(e.team, fp.team) = m.team_abbr 
  AND xw.season = m.season
LEFT JOIN current_defense_stats dvp 
  ON m.opponent_abbr = dvp.defense_team 
  AND COALESCE(e.position, fp.position) = dvp.position 
  AND xw.sport = dvp.sport
  AND xw.season = dvp.season;

-- Recreate indexes on the materialized view
CREATE UNIQUE INDEX IF NOT EXISTS players_master_crosswalk_id ON players_master(crosswalk_id);
CREATE INDEX IF NOT EXISTS players_master_espn_id ON players_master(espn_player_id);
CREATE INDEX IF NOT EXISTS players_master_fp_id ON players_master(fp_player_id);
CREATE INDEX IF NOT EXISTS players_master_team ON players_master(team);
CREATE INDEX IF NOT EXISTS players_master_position ON players_master(position);
CREATE INDEX IF NOT EXISTS players_master_sport_season ON players_master(sport, season);
