-- Players Master Materialized View
-- Joins all player data sources into a unified view
-- See docs/unified-player-architecture.md for full documentation

DROP MATERIALIZED VIEW IF EXISTS players_master;

CREATE MATERIALIZED VIEW players_master AS
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
  e.injury_status as espn_injury_status,
  e.injury_type,
  e.percent_owned,
  e.percent_started,
  e.average_points,
  e.total_points,
  e.last_fetched_at as espn_last_fetched,
  
  -- FP-specific data
  fp.status as fp_status,
  fp.injury_status as fp_injury_status,
  
  -- Rankings (from existing fp_rankings table - latest weekly ranking)
  r.rank as fp_rank,
  r.tier as fp_tier,
  r.rank_type,
  r.scoring_type as ranking_scoring_type,
  
  -- Projections (from existing fp_projections table)
  p.projected_points,
  p.opponent as projection_opponent,
  p.stats as projection_stats,
  
  -- Matchup data (from nfl_matchups table)
  m.opponent_abbr,
  m.game_time_utc,
  m.is_home,
  m.venue,
  m.game_day,
  
  -- OPRK (from defense_vs_position_stats)
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
LEFT JOIN fantasy_pros_rankings r 
  ON xw.fp_player_id = r.player_id 
  AND xw.sport = r.sport 
  AND xw.season = r.season
  AND r.rank_type = 'weekly'
LEFT JOIN fantasy_pros_projections p 
  ON xw.fp_player_id = p.player_id 
  AND xw.sport = p.sport 
  AND xw.season = p.season
LEFT JOIN nfl_matchups m 
  ON COALESCE(e.team, fp.team) = m.team_abbr 
  AND xw.season = m.season
LEFT JOIN defense_vs_position_stats dvp 
  ON m.opponent_abbr = dvp.defense_team 
  AND COALESCE(e.position, fp.position) = dvp.position 
  AND xw.season = dvp.season;

-- Create indexes on the materialized view for fast lookups
CREATE UNIQUE INDEX IF NOT EXISTS players_master_crosswalk_id ON players_master(crosswalk_id);
CREATE INDEX IF NOT EXISTS players_master_espn_id ON players_master(espn_player_id);
CREATE INDEX IF NOT EXISTS players_master_fp_id ON players_master(fp_player_id);
CREATE INDEX IF NOT EXISTS players_master_team ON players_master(team);
CREATE INDEX IF NOT EXISTS players_master_position ON players_master(position);
CREATE INDEX IF NOT EXISTS players_master_sport_season ON players_master(sport, season);
