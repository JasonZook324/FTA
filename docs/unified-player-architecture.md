# Unified Player Data Architecture

**Created:** December 2024  
**Status:** Implementation In Progress

## Overview

This document describes the architecture for consolidating player data from multiple sources (ESPN API, FantasyPros API) into a unified player object. The system creates a master player table that combines player information, statistics, rankings, projections, news, and matchup data from both sources, with proper ID mapping between the two systems.

## Problem Statement

Currently:
- ESPN player data is fetched **live from API** every request (not persisted)
- FantasyPros data exists in separate tables (`fantasy_pros_players`, `fantasy_pros_rankings`, etc.)
- The `players` table in the schema is **dead code** (never actually used)
- No ESPN-to-FantasyPros player ID mapping exists
- Joining player data from multiple sources requires manual effort

## Architecture Decision

### Approach: 3 Source Tables + 1 Crosswalk + 1 Materialized View

```
┌─────────────────────┐     ┌─────────────────────┐
│   espn_player_data  │     │   fp_player_data    │
│   (ESPN API cache)  │     │ (FantasyPros cache) │
└──────────┬──────────┘     └──────────┬──────────┘
           │                           │
           └─────────┬─────────────────┘
                     │
           ┌─────────▼─────────┐
           │  player_crosswalk  │
           │  (ID mapping table)│
           └─────────┬─────────┘
                     │
           ┌─────────▼─────────┐     ┌─────────────────────────┐
           │   players_master   │◄────│ defense_vs_position_stats│
           │ (Materialized View)│     │    (for OPRK calc)       │
           └───────────────────┘     └─────────────────────────┘
```

## Table Schemas

### 1. `espn_player_data` - ESPN Source Table

Stores cached snapshots of ESPN API player data.

| Column | Type | Description |
|--------|------|-------------|
| id | varchar (PK) | UUID |
| espn_player_id | integer | ESPN's player ID (unique per sport/season) |
| sport | text | NFL, NBA, NHL, MLB |
| season | integer | e.g., 2025 |
| first_name | text | Player's first name |
| last_name | text | Player's last name |
| full_name | text | Full display name |
| team | text | Team abbreviation (normalized) |
| position | text | Primary position |
| jersey_number | integer | Jersey number |
| injury_status | text | ACTIVE, QUESTIONABLE, DOUBTFUL, OUT, IR |
| injury_type | text | Description of injury |
| percent_owned | real | Ownership percentage (0-100) |
| percent_started | real | Start percentage (0-100) |
| average_points | real | Average fantasy points per game |
| last_fetched_at | timestamp | When data was last fetched from ESPN |
| created_at | timestamp | Record creation time |
| updated_at | timestamp | Last update time |

**Indexes:**
- Unique: `(sport, season, espn_player_id)`
- B-tree: `(sport, season, team)`, `(sport, season, position)`

### 2. `fp_player_data` - FantasyPros Source Table

Stores FantasyPros player data (separate from existing `fantasy_pros_players` table to avoid confusion).

| Column | Type | Description |
|--------|------|-------------|
| id | varchar (PK) | UUID |
| fp_player_id | text | FantasyPros player ID |
| sport | text | NFL, NBA, NHL, MLB |
| season | integer | e.g., 2025 |
| first_name | text | Player's first name |
| last_name | text | Player's last name |
| full_name | text | Full display name |
| team | text | Team abbreviation (normalized) |
| position | text | Primary position |
| jersey_number | integer | Jersey number |
| status | text | Active, Injured, etc. |
| injury_status | text | Injury designation if injured |
| created_at | timestamp | Record creation time |
| updated_at | timestamp | Last update time |

**Indexes:**
- Unique: `(sport, season, fp_player_id)`
- B-tree: `(sport, season, team)`, `(sport, season, position)`

### 3. `defense_vs_position_stats` - For OPRK Calculation

Stores defense rankings by position for calculating Opponent Rank (OPRK).

| Column | Type | Description |
|--------|------|-------------|
| id | varchar (PK) | UUID |
| sport | text | NFL (primarily) |
| season | integer | e.g., 2025 |
| week | integer | Current week (null for season average) |
| defense_team | text | Team abbreviation |
| position | text | QB, RB, WR, TE |
| games_played | integer | Games played by this defense |
| total_points_allowed | real | Total fantasy points allowed to position |
| avg_points_allowed | real | Average FP allowed per game |
| rank | integer | 1-32 ranking (1 = best defense) |
| scoring_type | text | PPR, HALF_PPR, STD |
| created_at | timestamp | Record creation time |
| updated_at | timestamp | Last update time |

**How OPRK is Calculated:**
```
OPRK = Rank of (Average Fantasy Points Allowed Per Game to Position)

Example:
- Chiefs allow 22.5 avg fantasy points to QBs
- This is the 28th most in the league
- Chiefs OPRK vs QB = 28 (favorable matchup for opposing QBs)

Color coding:
- Green (22-32): Favorable matchup
- Black (11-21): Average matchup  
- Red (1-10): Tough matchup
```

### 4. `player_crosswalk` - ID Mapping Table

Maps ESPN player IDs to FantasyPros player IDs.

| Column | Type | Description |
|--------|------|-------------|
| id | varchar (PK) | UUID |
| canonical_key | text | Unique key: lowercase(first+last+team+position) |
| sport | text | NFL, NBA, NHL, MLB |
| season | integer | e.g., 2025 |
| espn_player_id | integer | ESPN's player ID (nullable) |
| fp_player_id | text | FantasyPros player ID (nullable) |
| match_confidence | text | exact, fuzzy, manual, unmatched |
| manual_override | boolean | True if manually corrected |
| notes | text | Admin notes for manual overrides |
| created_at | timestamp | Record creation time |
| updated_at | timestamp | Last update time |

**Indexes:**
- Unique: `(sport, season, canonical_key)`
- B-tree: `espn_player_id`, `fp_player_id`

**Match Confidence Levels:**

| Value | Meaning | Example |
|-------|---------|---------|
| `exact` | Perfect canonical key match | "Patrick Mahomes" + "KC" + "QB" matched exactly |
| `fuzzy` | Partial match, may need review | "Pat Mahomes" vs "Patrick Mahomes" |
| `manual` | Human verified/corrected | Admin linked after auto-match failed |
| `unmatched` | No match found | Player exists in one system only |

### 5. `players_master` - Materialized View

Unified view joining all player data sources.

```sql
CREATE MATERIALIZED VIEW players_master AS
SELECT 
  xw.id as crosswalk_id,
  xw.canonical_key,
  xw.sport,
  xw.season,
  xw.match_confidence,
  
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
  e.last_fetched_at as espn_last_fetched,
  
  -- FP-specific data
  fp.status as fp_status,
  fp.injury_status as fp_injury_status,
  
  -- Rankings (from fp_rankings table)
  r.rank as fp_rank,
  r.tier as fp_tier,
  r.rank_type,
  
  -- Projections (from fp_projections table)
  p.projected_points,
  p.opponent as matchup_opponent,
  p.stats as projection_stats,
  
  -- Matchup data (from nfl_matchups table)
  m.opponent_abbr,
  m.game_time_utc,
  m.is_home,
  m.venue,
  
  -- OPRK (from defense_vs_position_stats)
  dvp.rank as opponent_rank,
  dvp.avg_points_allowed as opponent_avg_allowed

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
```

## Canonical Key Generation

The canonical key is used to match players across systems:

```typescript
function generateCanonicalKey(
  firstName: string, 
  lastName: string, 
  team: string, 
  position: string
): string {
  // Normalize team abbreviation using shared/teamAbbreviations.ts
  const normalizedTeam = normalizeTeamAbbreviation(team);
  
  // Remove special characters, lowercase everything
  const cleanFirst = firstName.toLowerCase().replace(/[^a-z]/g, '');
  const cleanLast = lastName.toLowerCase().replace(/[^a-z]/g, '');
  const cleanPos = position.toUpperCase();
  
  return `${cleanFirst}${cleanLast}-${normalizedTeam}-${cleanPos}`;
  // Example: "patrickmahomes-kc-qb"
}
```

## Matching Algorithm

```
1. Build canonical_key for ESPN player
2. Build canonical_key for FP player
3. If exact match:
   - match_confidence = 'exact'
   - Link both IDs in crosswalk

4. If no exact match, try fuzzy matching:
   - Same last name + same team + same position
   - If found: match_confidence = 'fuzzy'

5. If still no match:
   - match_confidence = 'unmatched'
   - Store with only one ID populated

6. Manual override available for edge cases
```

## Jobs Page Integration

New "Unified Player Data" section with these jobs:

| # | Job | Endpoint | Description |
|---|-----|----------|-------------|
| 1 | Refresh ESPN Players | `/api/jobs/refresh-espn-players` | Fetch ESPN API → save to `espn_player_data` |
| 2 | Refresh FP Players | `/api/jobs/refresh-fp-players` | Fetch FantasyPros API → save to `fp_player_data` |
| 3 | Refresh Defense Stats | `/api/jobs/refresh-defense-stats` | Calculate OPRK data → save to `defense_vs_position_stats` |
| 4 | Build Crosswalk | `/api/jobs/build-crosswalk` | Match ESPN↔FP players → update `player_crosswalk` |
| 5 | Refresh Master View | `/api/jobs/refresh-players-master` | Execute `REFRESH MATERIALIZED VIEW players_master` |

**Run All**: Executes jobs 1-5 in sequence.

## Data Freshness Strategy

| Data Source | Refresh Frequency | Notes |
|-------------|-------------------|-------|
| ESPN Players | On-demand via job | Cached snapshots replace live fetches |
| FP Players | Daily/Weekly via job | Batch refresh from API |
| Defense Stats | Weekly via job | Recalculated from game data |
| Crosswalk | After player refreshes | Runs matching algorithm |
| Master View | After any source update | `REFRESH MATERIALIZED VIEW CONCURRENTLY` |

## Migration Notes

1. The old `players` table (dead code) should be **removed** from schema after this implementation
2. Existing `fantasy_pros_players` table remains for backward compatibility
3. New `fp_player_data` table is separate to avoid migration issues
4. Materialized view requires Neon PostgreSQL (confirmed supported)

## Future Enhancements

- [ ] Add confidence threshold filtering in queries
- [ ] Implement manual override UI for admin users
- [ ] Add refresh scheduling (cron jobs)
- [ ] Support for additional data sources
- [ ] Historical data tracking for player performance trends
