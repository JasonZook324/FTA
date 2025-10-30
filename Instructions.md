# Player Details Page - OPP and STATUS Column Fix

## Executive Summary

**Goal:** Populate the OPP (Opponent) and STATUS (Game Day/Time) columns on the Player Details page using pre-processed matchup data stored in the database.

**Example Target Output:**
```
Player: Jahmyr Gibbs (DET) | OPP: @MIN | STATUS: Sun 12:00 PM (CST)
```

**Architecture:** Weekly job processes raw odds data → normalized matchup table → fast frontend lookups

**Feasibility:** ✅ **100% ACHIEVABLE** - Optimized for minimal API calls and maximum performance.

---

## Architecture Overview

### Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│ 1. WEEKLY REFRESH (Jobs Page)                                │
│                                                               │
│ The Odds API → nflVegasOdds (raw data)                      │
│                        ↓                                      │
│              Process & Normalize Job                         │
│         (normalize team names, dedupe bookmakers)            │
│                        ↓                                      │
│              nflMatchups (processed data)                    │
│         One row per team, pre-normalized abbrevs             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ 2. USER PAGE LOAD (Fast, no processing)                      │
│                                                               │
│ Player Details Page → GET /api/nfl/matchups/:season/:week   │
│                        ↓                                      │
│              nflMatchups table (simple SELECT)               │
│                        ↓                                      │
│              useNFLMatchups hook (build maps)                │
│                        ↓                                      │
│              UI Display: OPP + STATUS columns                │
└─────────────────────────────────────────────────────────────┘
```

### Key Benefits

✅ **Minimal API Calls**: The Odds API queried only once per week (Jobs page refresh)
✅ **Fast Page Loads**: No real-time processing, just simple database SELECT
✅ **Pre-Normalized Data**: Team abbreviations stored ready-to-use
✅ **Weekly Refresh**: User controls when matchup data updates via Jobs page
✅ **Cached Lookups**: Frontend builds O(1) maps from pre-processed data

---

## Current State Analysis

### What's Working
1. ✅ **The Odds API Integration** (`server/oddsApiService.ts`)
   - Successfully fetches NFL matchup data
   - Stores in `nflVegasOdds` database table (Neon ep-old-fog)
   - API Key configured: `ODDS_API_KEY=6280aed458cb09d5d5c86d51fada96ec`

2. ✅ **Team Abbreviation Mapping** (`server/kickerStreamingService.ts`)
   - `normalizeTeamAbbr()` function maps full names → abbreviations
   - Example: "Detroit Lions" → "DET", "Minnesota Vikings" → "MIN"

3. ✅ **Jobs Page Infrastructure** (`client/src/pages/jobs.tsx`)
   - NFL Kicker Streaming pipeline with sequential job execution
   - Visual progress tracking and status indicators

### What's Missing

#### 1. **Database Table for Processed Matchups**
- No `nflMatchups` table to store normalized matchup data
- Raw `nflVegasOdds` data requires processing on every query

#### 2. **Jobs Page Integration**
- No "Refresh NFL Matchups" job to process weekly data
- Users can't manually trigger matchup refresh

#### 3. **API Endpoint for Matchup Lookups**
- No endpoint to serve pre-processed matchup data
- Player Details page has no way to fetch opponent/game time info

#### 4. **Frontend Hooks and Components**
- OPP column returns hardcoded "N/A" (line 387-393)
- STATUS column returns hardcoded "Sun 1:00 PM" (line 139-143)

---

## Database Schema Changes

### New Table: `nflMatchups`

**Purpose:** Store pre-processed, normalized matchup data for fast lookups

**Schema:**
```typescript
export const nflMatchups = pgTable("nfl_matchups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  season: integer("season").notNull(),
  week: integer("week").notNull(),
  teamAbbr: text("team_abbr").notNull(),           // "DET", "MIN", etc.
  opponentAbbr: text("opponent_abbr").notNull(),   // "MIN", "DET", etc.
  gameTimeUtc: timestamp("game_time_utc").notNull(), // UTC timestamp
  isHome: boolean("is_home").notNull(),            // true = home game
  gameDay: text("game_day"),                       // "Sun", "Mon", "Thu"
  venue: text("venue"),                            // "Ford Field"
  bookmakerSource: text("bookmaker_source"),       // "draftkings"
  oddsSnapshotTs: timestamp("odds_snapshot_ts").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  uniqueTeamWeek: uniqueIndex("nfl_matchups_team_week").on(table.season, table.week, table.teamAbbr),
}));
```

**Key Features:**
- **One row per team per week** - DET vs MIN creates 2 rows (DET row, MIN row)
- **Pre-normalized abbreviations** - No runtime normalization needed
- **Unique constraint** - Prevents duplicate entries per team/week
- **Rich metadata** - Game day, venue, bookmaker source for future features

**Example Data:**
```sql
-- Detroit Lions home game vs Minnesota Vikings
INSERT INTO nfl_matchups VALUES (
  uuid(),
  2025,                          -- season
  9,                             -- week
  'DET',                         -- teamAbbr
  'MIN',                         -- opponentAbbr
  '2025-11-03T17:00:00Z',       -- gameTimeUtc
  true,                          -- isHome
  'Sun',                         -- gameDay
  'Ford Field',                  -- venue
  'draftkings',                  -- bookmakerSource
  NOW(),                         -- oddsSnapshotTs
  NOW(),                         -- createdAt
  NOW()                          -- updatedAt
);

-- Minnesota Vikings away game @ Detroit Lions
INSERT INTO nfl_matchups VALUES (
  uuid(),
  2025,
  9,
  'MIN',                         -- teamAbbr
  'DET',                         -- opponentAbbr
  '2025-11-03T17:00:00Z',       -- gameTimeUtc (same as DET)
  false,                         -- isHome (away game)
  'Sun',
  'Ford Field',
  'draftkings',
  NOW(),
  NOW(),
  NOW()
);
```

---

## Implementation Plan

### Phase 1: Database Setup

#### Task 1.1: Add Schema Definition
**File:** `shared/schema.ts` (add after nflTeamStats table, ~line 378)

```typescript
export const nflMatchups = pgTable("nfl_matchups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  season: integer("season").notNull(),
  week: integer("week").notNull(),
  teamAbbr: text("team_abbr").notNull(),
  opponentAbbr: text("opponent_abbr").notNull(),
  gameTimeUtc: timestamp("game_time_utc").notNull(),
  isHome: boolean("is_home").notNull(),
  gameDay: text("game_day"),
  venue: text("venue"),
  bookmakerSource: text("bookmaker_source"),
  oddsSnapshotTs: timestamp("odds_snapshot_ts").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  uniqueTeamWeek: uniqueIndex("nfl_matchups_team_week").on(table.season, table.week, table.teamAbbr),
}));

export const insertNflMatchupSchema = createInsertSchema(nflMatchups).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  oddsSnapshotTs: true,
});

export type NflMatchup = typeof nflMatchups.$inferSelect;
export type InsertNflMatchup = z.infer<typeof insertNflMatchupSchema>;
```

#### Task 1.2: Run Database Migration
```bash
npm run db:push --force
```

Expected output:
```
[✓] Changes applied to nfl_matchups table
```

#### Task 1.3: Update Storage Interface
**File:** `server/storage.ts`

**Add import (line ~11):**
```typescript
import { nflMatchups } from "@shared/schema";
```

**Add methods to IStorage interface (~line 88):**
```typescript
interface IStorage {
  // ... existing methods ...
  
  // NFL Matchups
  refreshNflMatchups(season: number, week: number): Promise<{ success: boolean; recordCount: number; error?: string }>;
  getNflMatchups(season: number, week: number): Promise<typeof nflMatchups.$inferSelect[]>;
}
```

**Add PgStorage implementation (~line 800):**
```typescript
// NFL Matchups methods
async refreshNflMatchups(season: number, week: number) {
  try {
    console.log(`Refreshing NFL matchups for ${season} week ${week}...`);
    
    // Step 1: Fetch raw odds data from nflVegasOdds
    const oddsData = await db
      .select()
      .from(nflVegasOdds)
      .where(and(
        eq(nflVegasOdds.season, season),
        eq(nflVegasOdds.week, week)
      ));
    
    if (oddsData.length === 0) {
      return { success: false, recordCount: 0, error: "No odds data found for this week. Run 'Refresh Vegas Odds' first." };
    }
    
    // Step 2: Deduplicate by gameId (multiple bookmakers = same game)
    const gameMap = new Map<string, typeof nflVegasOdds.$inferSelect>();
    for (const game of oddsData) {
      if (!gameMap.has(game.gameId)) {
        gameMap.set(game.gameId, game);
      }
    }
    
    // Step 3: Delete existing matchups for this week
    await db.delete(nflMatchups)
      .where(and(
        eq(nflMatchups.season, season),
        eq(nflMatchups.week, week)
      ));
    
    // Step 4: Process each game into 2 matchup records (home + away)
    const matchupRecords: InsertNflMatchup[] = [];
    
    for (const game of gameMap.values()) {
      if (!game.commenceTime) continue;
      
      // Normalize team names to abbreviations
      const homeAbbr = this.normalizeTeamName(game.homeTeam);
      const awayAbbr = this.normalizeTeamName(game.awayTeam);
      
      if (!homeAbbr || !awayAbbr) {
        console.warn(`⚠ Skipping game: couldn't normalize teams ${game.homeTeam} vs ${game.awayTeam}`);
        continue;
      }
      
      // Determine game day from UTC timestamp
      const gameDate = new Date(game.commenceTime);
      const gameDay = gameDate.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
      
      // Home team record
      matchupRecords.push({
        season,
        week,
        teamAbbr: homeAbbr,
        opponentAbbr: awayAbbr,
        gameTimeUtc: game.commenceTime,
        isHome: true,
        gameDay,
        bookmakerSource: game.bookmaker,
      });
      
      // Away team record
      matchupRecords.push({
        season,
        week,
        teamAbbr: awayAbbr,
        opponentAbbr: homeAbbr,
        gameTimeUtc: game.commenceTime,
        isHome: false,
        gameDay,
        bookmakerSource: game.bookmaker,
      });
    }
    
    // Step 5: Bulk insert
    if (matchupRecords.length > 0) {
      await db.insert(nflMatchups).values(matchupRecords);
    }
    
    console.log(`✓ Successfully created ${matchupRecords.length} matchup records for week ${week}`);
    return { success: true, recordCount: matchupRecords.length };
  } catch (error: any) {
    console.error('Error refreshing NFL matchups:', error);
    return { success: false, recordCount: 0, error: error.message };
  }
},

async getNflMatchups(season: number, week: number) {
  return await db
    .select()
    .from(nflMatchups)
    .where(and(
      eq(nflMatchups.season, season),
      eq(nflMatchups.week, week)
    ))
    .orderBy(nflMatchups.teamAbbr);
},

// Helper method to normalize team names
normalizeTeamName(fullName: string): string | null {
  const mapping: Record<string, string> = {
    // AFC East
    'Buffalo Bills': 'BUF',
    'Miami Dolphins': 'MIA',
    'New England Patriots': 'NE',
    'New York Jets': 'NYJ',
    // AFC North
    'Baltimore Ravens': 'BAL',
    'Cincinnati Bengals': 'CIN',
    'Cleveland Browns': 'CLE',
    'Pittsburgh Steelers': 'PIT',
    // AFC South
    'Houston Texans': 'HOU',
    'Indianapolis Colts': 'IND',
    'Jacksonville Jaguars': 'JAX',
    'Tennessee Titans': 'TEN',
    // AFC West
    'Denver Broncos': 'DEN',
    'Kansas City Chiefs': 'KC',
    'Las Vegas Raiders': 'LV',
    'Los Angeles Chargers': 'LAC',
    'LA Chargers': 'LAC',
    // NFC East
    'Dallas Cowboys': 'DAL',
    'New York Giants': 'NYG',
    'Philadelphia Eagles': 'PHI',
    'Washington Commanders': 'WAS',
    'Washington': 'WAS',
    // NFC North
    'Chicago Bears': 'CHI',
    'Detroit Lions': 'DET',
    'Green Bay Packers': 'GB',
    'Minnesota Vikings': 'MIN',
    // NFC South
    'Atlanta Falcons': 'ATL',
    'Carolina Panthers': 'CAR',
    'New Orleans Saints': 'NO',
    'Tampa Bay Buccaneers': 'TB',
    // NFC West
    'Arizona Cardinals': 'ARI',
    'Los Angeles Rams': 'LAR',
    'LA Rams': 'LAR',
    'San Francisco 49ers': 'SF',
    'Seattle Seahawks': 'SEA'
  };
  
  return mapping[fullName] || null;
},
```

**Add MemStorage stub (~line 1200):**
```typescript
async refreshNflMatchups(season: number, week: number) {
  return { success: false, recordCount: 0, error: "MemStorage not supported" };
},

async getNflMatchups(season: number, week: number) {
  return [];
},

normalizeTeamName(fullName: string): string | null {
  return null;
},
```

---

### Phase 2: Backend API Integration

#### Task 2.1: Add Jobs API Endpoint
**File:** `server/routes.ts` (add after existing NFL jobs endpoints, ~line 2500)

```typescript
// Refresh NFL Matchups job
app.post("/api/jobs/nfl-refresh-matchups", requireAuth, requireRole(2, 9), async (req: any, res) => {
  try {
    const { season, week } = req.body;
    
    if (!season || !week) {
      return res.status(400).json({ message: "Season and week required" });
    }
    
    const result = await storage.refreshNflMatchups(season, week);
    
    if (result.success) {
      res.json({
        message: `Successfully refreshed ${result.recordCount} matchup records for week ${week}`,
        recordCount: result.recordCount
      });
    } else {
      res.status(500).json({
        message: result.error || "Failed to refresh matchups"
      });
    }
  } catch (error: any) {
    console.error('Error in refresh matchups job:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get NFL Matchups (public endpoint for Player Details page)
app.get("/api/nfl/matchups/:season/:week", async (req, res) => {
  try {
    const { season, week } = req.params;
    
    const matchups = await storage.getNflMatchups(
      parseInt(season),
      parseInt(week)
    );
    
    res.json({
      season: parseInt(season),
      week: parseInt(week),
      matchups
    });
  } catch (error: any) {
    console.error('Error fetching NFL matchups:', error);
    res.status(500).json({ message: error.message });
  }
});
```

---

### Phase 3: Jobs Page Integration

#### Task 3.1: Add Refresh Matchups Job
**File:** `client/src/pages/jobs.tsx`

**Add state variable (~line 25):**
```typescript
const [matchupsRefreshing, setMatchupsRefreshing] = useState(false);
const [matchupsResult, setMatchupsResult] = useState<string>("");
```

**Add handler function (~line 200):**
```typescript
const handleRefreshMatchups = async (season: number, week: number) => {
  setMatchupsRefreshing(true);
  setMatchupsResult("");
  
  try {
    const response = await fetch('/api/jobs/nfl-refresh-matchups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ season, week })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      setMatchupsResult(`✓ ${data.message}`);
    } else {
      setMatchupsResult(`✗ Error: ${data.message}`);
    }
  } catch (error: any) {
    setMatchupsResult(`✗ Error: ${error.message}`);
  } finally {
    setMatchupsRefreshing(false);
  }
};
```

**Add UI section (add after NFL Kicker Streaming section, ~line 450):**
```typescript
{/* NFL Player Matchups Section */}
<Card data-testid="card-nfl-player-matchups">
  <CardHeader>
    <CardTitle className="flex items-center space-x-2">
      <CalendarIcon className="w-5 h-5" />
      <span>NFL Player Matchups</span>
    </CardTitle>
    <p className="text-sm text-muted-foreground">
      Process NFL matchup data for Player Details page (OPP and STATUS columns)
    </p>
  </CardHeader>
  <CardContent className="space-y-4">
    {/* Week selector */}
    <div className="flex items-center space-x-4">
      <label className="text-sm font-medium">Week:</label>
      <Select
        value={selectedWeek.toString()}
        onValueChange={(value) => setSelectedWeek(parseInt(value))}
        data-testid="select-matchups-week"
      >
        <SelectTrigger className="w-24">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Array.from({ length: 18 }, (_, i) => i + 1).map((week) => (
            <SelectItem key={week} value={week.toString()}>
              {week}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
    
    {/* Refresh button */}
    <Button
      onClick={() => handleRefreshMatchups(2025, selectedWeek)}
      disabled={matchupsRefreshing}
      className="w-full"
      data-testid="button-refresh-matchups"
    >
      {matchupsRefreshing ? (
        <>
          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
          Processing Matchups...
        </>
      ) : (
        <>
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh Matchups for Week {selectedWeek}
        </>
      )}
    </Button>
    
    {/* Result message */}
    {matchupsResult && (
      <div className={`p-3 rounded-md text-sm ${
        matchupsResult.startsWith('✓') 
          ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400'
          : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
      }`}>
        {matchupsResult}
      </div>
    )}
    
    {/* How it works */}
    <div className="bg-muted/50 p-4 rounded-md space-y-2">
      <h4 className="font-semibold text-sm">How It Works:</h4>
      <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
        <li>Fetches raw odds from nflVegasOdds table</li>
        <li>Normalizes team names to abbreviations (DET, MIN, etc.)</li>
        <li>Deduplicates bookmakers (keeps one entry per game)</li>
        <li>Creates 2 records per game (home team + away team)</li>
        <li>Stores in nflMatchups for fast Player Details lookups</li>
      </ol>
      <p className="text-xs text-muted-foreground mt-2">
        <strong>Note:</strong> Run "Refresh Vegas Odds" first to ensure odds data is available.
      </p>
    </div>
  </CardContent>
</Card>
```

**Add import (~line 10):**
```typescript
import { CalendarIcon } from "lucide-react";
```

---

### Phase 4: Frontend Implementation

#### Task 4.1: Create Timezone Utility
**File:** `client/src/lib/timezone-utils.ts` (NEW FILE)

```typescript
// Stadium timezone mapping for all 32 NFL teams
const STADIUM_TIMEZONES: Record<string, string> = {
  // EST - Eastern
  "BUF": "America/New_York",
  "MIA": "America/New_York", 
  "NE": "America/New_York",
  "NYJ": "America/New_York",
  "BAL": "America/New_York",
  "CLE": "America/New_York",
  "PIT": "America/New_York",
  "CIN": "America/New_York",
  "IND": "America/New_York",
  "JAX": "America/New_York",
  "TEN": "America/New_York",
  "ATL": "America/New_York",
  "CAR": "America/New_York",
  "TB": "America/New_York",
  "WAS": "America/New_York",
  "PHI": "America/New_York",
  "NYG": "America/New_York",
  
  // CST - Central
  "CHI": "America/Chicago",
  "DET": "America/Detroit",
  "GB": "America/Chicago",
  "MIN": "America/Chicago",
  "HOU": "America/Chicago",
  "DAL": "America/Chicago",
  "KC": "America/Chicago",
  "NO": "America/Chicago",
  
  // MST - Mountain
  "DEN": "America/Denver",
  
  // PST - Pacific  
  "LAC": "America/Los_Angeles",
  "LAR": "America/Los_Angeles",
  "SF": "America/Los_Angeles",
  "SEA": "America/Los_Angeles",
  "LV": "America/Los_Angeles",
  
  // AZ (no DST)
  "ARI": "America/Phoenix"
};

/**
 * Format UTC game time to local timezone with day
 * @param utcTimestamp - ISO timestamp string (e.g., "2025-11-03T17:00:00Z")
 * @param teamAbbr - Team abbreviation (e.g., "DET")
 * @returns Formatted string (e.g., "Sun 12:00 PM CST")
 */
export function formatGameTime(
  utcTimestamp: string,
  teamAbbr: string
): string {
  const date = new Date(utcTimestamp);
  const timezone = STADIUM_TIMEZONES[teamAbbr] || "America/New_York";
  
  const formatter = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',      // "Sun"
    hour: 'numeric',       // "12"
    minute: '2-digit',     // "00"
    hour12: true,          // "PM"
    timeZone: timezone,
    timeZoneName: 'short'  // "CST"
  });
  
  return formatter.format(date);
}
```

#### Task 4.2: Create Matchups Hook
**File:** `client/src/hooks/use-nfl-matchups.tsx` (NEW FILE)

```typescript
import { useQuery } from "@tanstack/react-query";
import { formatGameTime } from "@/lib/timezone-utils";

interface MatchupData {
  teamAbbr: string;
  opponentAbbr: string;
  gameTimeUtc: string;
  isHome: boolean;
  gameDay: string;
}

interface MatchupsResponse {
  season: number;
  week: number;
  matchups: MatchupData[];
}

/**
 * Fetch and cache NFL matchup data for opponent and game time lookups
 * @param season - NFL season (e.g., 2025)
 * @param week - NFL week (1-18)
 * @returns Lookup functions and loading state
 */
export function useNFLMatchups(season: number, week: number) {
  const { data, isLoading, error } = useQuery<MatchupsResponse>({
    queryKey: ['/api/nfl/matchups', season, week],
    queryFn: async () => {
      const response = await fetch(`/api/nfl/matchups/${season}/${week}`);
      if (!response.ok) {
        throw new Error('Failed to fetch NFL matchups');
      }
      return response.json();
    },
    staleTime: 1000 * 60 * 60, // Cache for 1 hour
    enabled: !!season && !!week,
  });

  // Build O(1) lookup maps
  const opponentMap = new Map<string, string>();
  const gameTimeMap = new Map<string, string>();
  const isHomeMap = new Map<string, boolean>();

  if (data?.matchups) {
    for (const matchup of data.matchups) {
      opponentMap.set(matchup.teamAbbr, matchup.opponentAbbr);
      gameTimeMap.set(
        matchup.teamAbbr,
        formatGameTime(matchup.gameTimeUtc, matchup.teamAbbr)
      );
      isHomeMap.set(matchup.teamAbbr, matchup.isHome);
    }
  }

  return {
    matchups: data?.matchups || [],
    isLoading,
    error,
    
    /**
     * Get opponent abbreviation for a team
     * @param teamAbbr - Team abbreviation (e.g., "DET")
     * @returns Opponent abbreviation or null if bye week
     */
    getOpponent: (teamAbbr: string): string | null => {
      return opponentMap.get(teamAbbr) || null;
    },
    
    /**
     * Get formatted game time for a team
     * @param teamAbbr - Team abbreviation (e.g., "DET")
     * @returns Formatted time (e.g., "Sun 12:00 PM CST") or null
     */
    getGameTime: (teamAbbr: string): string | null => {
      return gameTimeMap.get(teamAbbr) || null;
    },
    
    /**
     * Check if team is playing at home
     * @param teamAbbr - Team abbreviation (e.g., "DET")
     * @returns true if home game, false if away
     */
    isHome: (teamAbbr: string): boolean => {
      return isHomeMap.get(teamAbbr) || false;
    },
  };
}
```

#### Task 4.3: Update Players Page
**File:** `client/src/pages/players.tsx`

**Add import (~line 12):**
```typescript
import { useNFLMatchups } from "@/hooks/use-nfl-matchups";
```

**Add hook usage (~line 21, after other hooks):**
```typescript
// Fetch current week's NFL matchups for OPP/STATUS columns
const currentNFLWeek = getCurrentNFLWeek();
const { 
  getOpponent: lookupOpponent, 
  getGameTime: lookupGameTime,
  isHome: lookupIsHome,
  isLoading: matchupsLoading
} = useNFLMatchups(2025, currentNFLWeek);
```

**Replace getOpponent function (line 387-393):**
```typescript
// Helper function to get opponent team
const getOpponent = (playerData: any) => {
  const player = playerData.player || playerData;
  const teamId = getProTeamId(player);
  
  // No team ID = no opponent data
  if (!teamId) return "BYE";
  
  // Convert ESPN team ID to abbreviation
  const teamAbbr = getTeamName(teamId);
  
  // Look up opponent from matchup data
  const opponent = lookupOpponent(teamAbbr);
  
  // No opponent = bye week
  if (!opponent) return "BYE";
  
  // Add @ symbol for away games
  const isHome = lookupIsHome(teamAbbr);
  return isHome ? opponent : `@${opponent}`;
};
```

**Replace getGameTime function (line 139-143):**
```typescript
// Helper function to get game time/status
const getGameTime = (playerData: any) => {
  const player = playerData.player || playerData;
  const teamId = getProTeamId(player);
  
  // No team ID = no game time
  if (!teamId) return "--";
  
  // Convert ESPN team ID to abbreviation
  const teamAbbr = getTeamName(teamId);
  
  // Look up formatted game time
  const gameTime = lookupGameTime(teamAbbr);
  
  // Return formatted time or "--" for bye week
  return gameTime || "--";
};
```

---

## Testing Plan

### Phase 1: Database & Backend Testing

#### Test 1.1: Database Migration
```bash
# Run migration
npm run db:push --force

# Verify table created
# Should see nfl_matchups in table list
```

**Expected:**
- ✓ nfl_matchups table created
- ✓ Unique index on (season, week, teamAbbr)
- ✓ All columns present

#### Test 1.2: Jobs API Endpoint
```bash
# Test refresh matchups (requires Vegas odds data first)
curl -X POST http://localhost:5000/api/jobs/nfl-refresh-matchups \
  -H "Content-Type: application/json" \
  -d '{"season": 2025, "week": 9}'
```

**Expected Response:**
```json
{
  "message": "Successfully refreshed 32 matchup records for week 9",
  "recordCount": 32
}
```

**Verify in database:**
```sql
SELECT * FROM nfl_matchups WHERE season = 2025 AND week = 9;
-- Should see 32 rows (16 games × 2 teams)
```

#### Test 1.3: Get Matchups API
```bash
curl http://localhost:5000/api/nfl/matchups/2025/9
```

**Expected Response:**
```json
{
  "season": 2025,
  "week": 9,
  "matchups": [
    {
      "id": "...",
      "season": 2025,
      "week": 9,
      "teamAbbr": "DET",
      "opponentAbbr": "MIN",
      "gameTimeUtc": "2025-11-03T17:00:00Z",
      "isHome": true,
      "gameDay": "Sun"
    },
    // ... 31 more
  ]
}
```

### Phase 2: Jobs Page Testing

#### Test 2.1: UI Integration
1. Navigate to `/jobs` page
2. Scroll to "NFL Player Matchups" section
3. Select Week 9
4. Click "Refresh Matchups for Week 9"

**Expected:**
- ✓ Button shows loading spinner
- ✓ Success message: "✓ Successfully refreshed 32 matchup records for week 9"
- ✓ No errors in console

#### Test 2.2: Error Handling
1. Select Week 1 (no Vegas odds data)
2. Click "Refresh Matchups for Week 1"

**Expected:**
- ✗ Error message: "No odds data found for this week. Run 'Refresh Vegas Odds' first."

### Phase 3: Player Details Page Testing

#### Test 3.1: OPP Column
1. Navigate to `/players` page
2. Select league with NFL players
3. View player list

**Expected:**
- ✓ OPP column shows team abbreviations (e.g., "MIN", "@GB")
- ✓ Home games show opponent without @ (e.g., "MIN")
- ✓ Away games show opponent with @ (e.g., "@MIN")
- ✓ Bye weeks show "BYE"

#### Test 3.2: STATUS Column
**Expected:**
- ✓ Shows formatted day/time (e.g., "Sun 12:00 PM CST")
- ✓ Timezone matches team's stadium location
- ✓ Bye weeks show "--"

#### Test 3.3: Data Accuracy
Compare against NFL official schedule:
- ✓ Detroit Lions (DET) vs Minnesota Vikings (MIN) → OPP: "MIN"
- ✓ Minnesota Vikings (MIN) @ Detroit Lions (DET) → OPP: "@DET"
- ✓ Game time matches actual kickoff time in local timezone

#### Test 3.4: Edge Cases
- [ ] Team on bye week shows "BYE" / "--"
- [ ] Invalid team ID shows "BYE" / "--"
- [ ] Matchup data not refreshed shows "BYE" / "--"
- [ ] Page loads fast (< 1 second after initial fetch)

---

## Data Flow Summary

### Weekly Refresh Workflow (Jobs Page)

```
User Action: Click "Refresh Matchups for Week 9"
      ↓
POST /api/jobs/nfl-refresh-matchups { season: 2025, week: 9 }
      ↓
storage.refreshNflMatchups(2025, 9)
      ↓
1. Query nflVegasOdds for week 9 (raw data)
2. Deduplicate bookmakers → unique games
3. Normalize team names → abbreviations
   "Detroit Lions" → "DET"
   "Minnesota Vikings" → "MIN"
4. Create 2 records per game:
   - DET: opponent=MIN, isHome=true
   - MIN: opponent=DET, isHome=false
5. Delete old week 9 matchups
6. INSERT new matchups into nflMatchups table
      ↓
Response: { message: "32 records created" }
      ↓
User sees: "✓ Successfully refreshed 32 matchup records for week 9"
```

### Player Page Load Workflow (User-Facing)

```
User Action: Navigate to /players page
      ↓
useNFLMatchups(2025, 9) hook initializes
      ↓
GET /api/nfl/matchups/2025/9
      ↓
storage.getNflMatchups(2025, 9)
      ↓
SELECT * FROM nfl_matchups WHERE season=2025 AND week=9
      ↓
Response: 32 pre-processed matchup records
      ↓
Hook builds O(1) lookup maps:
  opponentMap: { "DET" → "MIN", "MIN" → "DET", ... }
  gameTimeMap: { "DET" → "Sun 12:00 PM EST", ... }
  isHomeMap: { "DET" → true, "MIN" → false, ... }
      ↓
For each player:
  1. Get proTeamId (e.g., 8 for DET)
  2. Convert to abbreviation: getTeamName(8) → "DET"
  3. Lookup opponent: opponentMap.get("DET") → "MIN"
  4. Lookup game time: gameTimeMap.get("DET") → "Sun 12:00 PM EST"
  5. Add @ for away: isHomeMap.get("DET") → true → "MIN" (no @)
      ↓
Display:
  OPP: "MIN"
  STATUS: "Sun 12:00 PM EST"
```

---

## Performance Optimization

### Why This Architecture is Fast

1. **Pre-Processed Data**
   - Team names normalized once (during weekly refresh)
   - No runtime string matching or normalization
   - Database stores ready-to-use abbreviations

2. **Minimal Database Queries**
   - One SELECT query per page load
   - Returns all 32 teams at once
   - Covers all players in league

3. **O(1) Lookups**
   - Hash map lookups (not array searches)
   - Instant opponent/time retrieval
   - No iteration over player list

4. **React Query Caching**
   - Matchups cached for 1 hour
   - Subsequent page loads use cache
   - No redundant API calls

5. **No API Rate Limiting**
   - The Odds API queried once per week (Jobs page)
   - User page loads hit database only
   - 500 free requests/month easily sufficient

### Performance Metrics

| Operation | Time | Notes |
|-----------|------|-------|
| Weekly refresh job | ~2-3 seconds | Processes 16 games → 32 records |
| GET /api/nfl/matchups | ~50-100ms | Simple SELECT query |
| Frontend lookup | ~0.1ms | Map.get() operation |
| Total page load impact | ~100ms | One-time API call + caching |

---

## File Changes Summary

### New Files (3)
1. `client/src/lib/timezone-utils.ts` - Timezone formatting (~70 lines)
2. `client/src/hooks/use-nfl-matchups.tsx` - React hook (~100 lines)
3. No new backend service file needed (logic in storage.ts)

### Modified Files (4)
1. `shared/schema.ts` - Add nflMatchups table definition (~25 lines)
2. `server/storage.ts` - Add refresh/get methods + normalize helper (~120 lines)
3. `server/routes.ts` - Add 2 API endpoints (~40 lines)
4. `client/src/pages/jobs.tsx` - Add matchups refresh UI (~80 lines)
5. `client/src/pages/players.tsx` - Update OPP/STATUS functions (~25 lines)

**Total: ~460 lines of code**

---

## Migration & Deployment

### Development Environment

```bash
# 1. Create database table
npm run db:push --force

# 2. Verify schema
npm run db:push
# Should output: "No changes detected"

# 3. Restart application
# (Auto-restart after db:push)

# 4. Test Jobs page
# Navigate to /jobs → Refresh Matchups for Week 9

# 5. Test Player Details page
# Navigate to /players → Verify OPP/STATUS columns
```

### Production Deployment (Render)

```bash
# 1. Ensure DATABASE_URL environment variable set
# Already configured: ep-old-fog Neon database

# 2. Run migration on deploy
npm run db:push --force

# 3. Refresh matchup data via Jobs page
# Manual step after deployment

# 4. Verify player details display correctly
```

---

## Troubleshooting Guide

### Issue 1: "No odds data found for this week"

**Cause:** Vegas odds not refreshed for selected week

**Solution:**
1. Go to Jobs page
2. Run "Refresh Vegas Odds" for the week first
3. Then run "Refresh Matchups" for the same week

### Issue 2: OPP/STATUS showing "BYE" or "--" for all players

**Cause:** Matchup data not loaded or week mismatch

**Debug:**
```bash
# Check if matchups exist in database
SELECT COUNT(*) FROM nfl_matchups WHERE season=2025 AND week=9;
# Should return 32 (or 26-30 if some teams on bye)

# Check API endpoint
curl http://localhost:5000/api/nfl/matchups/2025/9
# Should return array of matchups
```

**Solution:**
- Verify current week calculation matches data week
- Re-run "Refresh Matchups" job

### Issue 3: Timezone showing incorrectly

**Cause:** Team abbreviation not in timezone map

**Debug:**
Check `client/src/lib/timezone-utils.ts` for team abbreviation

**Solution:**
- Add missing team to STADIUM_TIMEZONES mapping
- Restart application

### Issue 4: "@" symbol not appearing for away games

**Cause:** isHome flag incorrect in database

**Debug:**
```sql
SELECT team_abbr, opponent_abbr, is_home 
FROM nfl_matchups 
WHERE season=2025 AND week=9 AND team_abbr='MIN';
```

**Solution:**
- Verify home/away logic in refresh job
- Re-run refresh to fix data

---

## Success Criteria

### Functional Requirements

✅ **OPP Column**
- Shows opponent team abbreviation (e.g., "MIN")
- Prefixes "@" for away games (e.g., "@MIN")
- Shows "BYE" for bye weeks
- Updates per current NFL week

✅ **STATUS Column**
- Shows day and time (e.g., "Sun 12:00 PM")
- Includes timezone abbreviation (e.g., "CST", "EST")
- Shows "--" for bye weeks
- Matches actual NFL schedule

✅ **Jobs Page Integration**
- "Refresh Matchups" button functional
- Week selector (1-18)
- Success/error feedback messages
- Sequential dependency (requires Vegas odds first)

### Performance Requirements

- Page load: < 2 seconds (with caching)
- Matchup lookup: O(1) time complexity
- Cache duration: 1 hour (React Query)
- No redundant API calls to The Odds API

### Data Accuracy

- 100% match with official NFL schedule
- Correct timezone for each stadium
- Accurate home/away designations
- Bye weeks properly handled

---

## Future Enhancements

### Potential Features

1. **Auto-Refresh Job**
   - Schedule automatic matchup refresh on Tuesdays
   - Email/notification when refresh complete

2. **Multi-Week Caching**
   - Pre-load matchups for weeks 1-18
   - Faster week navigation

3. **Venue Information**
   - Show stadium name in tooltip
   - Indoor/outdoor indicator

4. **Weather Integration**
   - Display weather forecast for outdoor games
   - Temperature, wind, precipitation

5. **Broadcast Information**
   - TV network (CBS, FOX, ESPN)
   - Start time variations (TNF, SNF, MNF)

---

## Conclusion

**Assessment:** ✅ **100% ACHIEVABLE** with optimized architecture

**Key Benefits:**
- Minimal API usage (weekly refresh only)
- Fast page loads (pre-processed data)
- Easy maintenance (Jobs page control)
- Scalable design (supports future features)

**Timeline Estimate:**
- Database setup: 1 hour
- Backend implementation: 2 hours
- Jobs page integration: 1 hour
- Frontend implementation: 2 hours
- Testing: 1 hour
- **Total: ~7 hours**

**Risk Level:** **LOW**
- All infrastructure exists
- Simple data pipeline
- No complex algorithms
- Well-defined dependencies

**Next Steps:**
1. Implement Phase 1: Database schema and migration
2. Implement Phase 2: Backend API endpoints
3. Implement Phase 3: Jobs page integration
4. Implement Phase 4: Frontend hooks and components
5. Test end-to-end workflow
6. Deploy to production

The feature is production-ready once implemented. The architecture minimizes API costs, maximizes performance, and provides user control through the Jobs page.
