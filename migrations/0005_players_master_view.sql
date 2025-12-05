-- Players Master Materialized View
-- Joins all player data sources into a unified view
-- See docs/unified-player-architecture.md for full documentation

DROP MATERIALIZED VIEW IF EXISTS players_master;

CREATE MATERIALIZED VIEW players_master AS
SELECT DISTINCT ON (xw.id)
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
  
  -- News data (from ESPN and FP)
  e.latest_outlook as espn_outlook,
  e.outlook_week as espn_outlook_week,
  e.news_date as espn_news_date,
  fp.latest_headline as fp_headline,
  fp.latest_analysis as fp_analysis,
  fp.news_date as fp_news_date,
  
  -- Rankings (from existing fp_rankings table - latest weekly ranking)
  r.rank as fp_rank,
  r.tier as fp_tier,
  r.rank_type,
  r.scoring_type as ranking_scoring_type,
  r.week as ranking_week,
  
  -- Projections (from existing fp_projections table)
  p.projected_points,
  p.opponent as projection_opponent,
  p.stats as projection_stats,
  p.week as projection_week,
  p.scoring_type as projection_scoring_type,
  
  -- Matchup data (from nfl_matchups table)
  m.opponent_abbr,
  m.game_time_utc,
  m.is_home,
  m.venue,
  m.game_day,
  m.week as matchup_week,
  
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
LEFT JOIN LATERAL (
  SELECT rank, tier, rank_type, scoring_type, week
  FROM fantasy_pros_rankings
  WHERE player_id = xw.fp_player_id 
    AND sport = xw.sport 
    AND season = xw.season
    AND rank_type = 'weekly'
  ORDER BY week DESC NULLS LAST
  LIMIT 1
) r ON true
LEFT JOIN LATERAL (
  SELECT projected_points, opponent, stats, week, scoring_type
  FROM fantasy_pros_projections
  WHERE player_id = xw.fp_player_id 
    AND sport = xw.sport 
    AND season = xw.season
  ORDER BY week DESC NULLS LAST
  LIMIT 1
) p ON true
LEFT JOIN LATERAL (
  SELECT opponent_abbr, game_time_utc, is_home, venue, game_day, week
  FROM nfl_matchups
  WHERE team_abbr = COALESCE(e.team, fp.team) 
    AND season = xw.season
  ORDER BY week DESC NULLS LAST
  LIMIT 1
) m ON true
LEFT JOIN defense_vs_position_stats dvp 
  ON m.opponent_abbr = dvp.defense_team 
  AND COALESCE(e.position, fp.position) = dvp.position 
  AND xw.season = dvp.season
ORDER BY xw.id;

-- Create indexes on the materialized view for fast lookups
CREATE UNIQUE INDEX IF NOT EXISTS players_master_crosswalk_id ON players_master(crosswalk_id);
CREATE INDEX IF NOT EXISTS players_master_espn_id ON players_master(espn_player_id);
CREATE INDEX IF NOT EXISTS players_master_fp_id ON players_master(fp_player_id);
CREATE INDEX IF NOT EXISTS players_master_team ON players_master(team);
CREATE INDEX IF NOT EXISTS players_master_position ON players_master(position);
CREATE INDEX IF NOT EXISTS players_master_sport_season ON players_master(sport, season);
