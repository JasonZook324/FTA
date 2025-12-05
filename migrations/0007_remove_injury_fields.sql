-- Remove unused injury fields from player tables
-- Only keeping injury_status from ESPN (the only source of injury data)
-- injury_type will be covered by news/headlines
-- fp_status and fp_injury_status removed as ESPN is the source of truth for injury data

-- Drop columns from espn_player_data
ALTER TABLE espn_player_data DROP COLUMN IF EXISTS injury_type;

-- Drop columns from fp_player_data  
ALTER TABLE fp_player_data DROP COLUMN IF EXISTS status;
ALTER TABLE fp_player_data DROP COLUMN IF EXISTS injury_status;

-- Recreate the players_master view without the removed columns
DROP MATERIALIZED VIEW IF EXISTS players_master;

-- Use CTEs to get latest rankings, projections, and matchups per player
WITH latest_rankings AS (
  SELECT DISTINCT ON (player_id, sport, season)
    player_id,
    sport,
    season,
    rank,
    tier,
    rank_type,
    scoring_type,
    week
  FROM fantasy_pros_rankings
  WHERE rank_type = 'weekly'
  ORDER BY player_id, sport, season, week DESC NULLS LAST
),
latest_projections AS (
  SELECT DISTINCT ON (player_id, sport, season)
    player_id,
    sport,
    season,
    projected_points,
    opponent,
    stats,
    week,
    scoring_type
  FROM fantasy_pros_projections
  ORDER BY player_id, sport, season, week DESC NULLS LAST
),
latest_matchups AS (
  SELECT DISTINCT ON (team_abbr, season)
    team_abbr,
    season,
    opponent_abbr,
    game_time_utc,
    is_home,
    venue,
    game_day,
    week
  FROM nfl_matchups
  ORDER BY team_abbr, season, week DESC NULLS LAST
),
latest_defense_stats AS (
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
  
  -- ESPN-specific data (injury_status is the only injury field now)
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

INTO players_master
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
LEFT JOIN latest_matchups m 
  ON COALESCE(e.team, fp.team) = m.team_abbr 
  AND xw.season = m.season
LEFT JOIN latest_defense_stats dvp 
  ON m.opponent_abbr = dvp.defense_team 
  AND COALESCE(e.position, fp.position) = dvp.position 
  AND xw.sport = dvp.sport 
  AND xw.season = dvp.season;

-- Drop and recreate as materialized view
DROP TABLE players_master;

CREATE MATERIALIZED VIEW players_master AS
WITH latest_rankings AS (
  SELECT DISTINCT ON (player_id, sport, season)
    player_id,
    sport,
    season,
    rank,
    tier,
    rank_type,
    scoring_type,
    week
  FROM fantasy_pros_rankings
  WHERE rank_type = 'weekly'
  ORDER BY player_id, sport, season, week DESC NULLS LAST
),
latest_projections AS (
  SELECT DISTINCT ON (player_id, sport, season)
    player_id,
    sport,
    season,
    projected_points,
    opponent,
    stats,
    week,
    scoring_type
  FROM fantasy_pros_projections
  ORDER BY player_id, sport, season, week DESC NULLS LAST
),
latest_matchups AS (
  SELECT DISTINCT ON (team_abbr, season)
    team_abbr,
    season,
    opponent_abbr,
    game_time_utc,
    is_home,
    venue,
    game_day,
    week
  FROM nfl_matchups
  ORDER BY team_abbr, season, week DESC NULLS LAST
),
latest_defense_stats AS (
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
  
  -- ESPN-specific data (injury_status is the only injury field now)
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
LEFT JOIN latest_matchups m 
  ON COALESCE(e.team, fp.team) = m.team_abbr 
  AND xw.season = m.season
LEFT JOIN latest_defense_stats dvp 
  ON m.opponent_abbr = dvp.defense_team 
  AND COALESCE(e.position, fp.position) = dvp.position 
  AND xw.sport = dvp.sport 
  AND xw.season = dvp.season;

-- Create indexes on the materialized view for fast lookups
CREATE UNIQUE INDEX IF NOT EXISTS players_master_crosswalk_id ON players_master(crosswalk_id);
CREATE INDEX IF NOT EXISTS players_master_espn_id ON players_master(espn_player_id);
CREATE INDEX IF NOT EXISTS players_master_fp_id ON players_master(fp_player_id);
CREATE INDEX IF NOT EXISTS players_master_team ON players_master(team);
CREATE INDEX IF NOT EXISTS players_master_position ON players_master(position);
CREATE INDEX IF NOT EXISTS players_master_sport_season ON players_master(sport, season);
