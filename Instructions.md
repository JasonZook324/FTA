# Player Details Page - OPP and STATUS Column Fix

## Executive Summary

**Goal:** Populate the OPP (Opponent) and STATUS (Game Day/Time) columns on the Player Details page using data from The Odds API to show accurate NFL matchup information for each player.

**Example Target Output:**
```
Player: Jahmyr Gibbs (DET) | OPP: MIN | STATUS: Sun 12:00 PM (CST)
```

**Feasibility:** ✅ **100% ACHIEVABLE** - All required infrastructure and data sources are in place.

---

## Current State Analysis

### What's Working
1. ✅ **The Odds API Integration** (`server/oddsApiService.ts`)
   - Successfully fetches NFL matchup data
   - Stores in `nflVegasOdds` database table (Neon ep-old-fog)
   - Data includes: homeTeam, awayTeam, commenceTime, week, season
   - API Key configured: `ODDS_API_KEY=6280aed458cb09d5d5c86d51fada96ec`

2. ✅ **Team Abbreviation Mapping** (`server/kickerStreamingService.ts`)
   - `normalizeTeamAbbr()` function maps full names → abbreviations
   - Example: "Detroit Lions" → "DET", "Minnesota Vikings" → "MIN"

3. ✅ **Player Team Data** (`client/src/pages/players.tsx`)
   - Each player has `proTeamId` (ESPN team ID)
   - `getTeamName()` function maps proTeamId → abbreviation
   - Example: proTeamId=8 → "DET", proTeamId=16 → "MIN"

4. ✅ **Current Week Calculation**
   - `getCurrentNFLWeek()` calculates based on season start date
   - Consistent calculation across frontend and backend

### What's Broken

#### 1. **OPP Column** (Line 387-393: `getOpponent()`)
```typescript
const getOpponent = (playerData: any) => {
  const player = playerData.player || playerData;
  
  // ESPN Fantasy API doesn't provide opponent data in player endpoints
  // This would require NFL schedule data from a different source
  return "N/A";  // ❌ HARDCODED - NOT IMPLEMENTED
};
```

**Problem:** Returns hardcoded "N/A" instead of actual opponent abbreviation.

#### 2. **STATUS Column** (Line 139-143: `getGameTime()`)
```typescript
const getGameTime = (playerData: any) => {
  const player = playerData.player || playerData;
  // For now, return a placeholder time
  return "Sun 1:00 PM";  // ❌ HARDCODED - NOT IMPLEMENTED
};
```

**Problem:** Returns hardcoded "Sun 1:00 PM" instead of actual game day/time with timezone.

---

## Root Cause Analysis

### Why It's Not Working

1. **No Data Bridge**: The `nflVegasOdds` table contains matchup data, but there's no mechanism to:
   - Fetch this data to the frontend
   - Map player teams to their opponents
   - Convert game times to readable format with timezones

2. **Missing API Endpoint**: No route exists to retrieve current week's matchups in a format useful for the Players page

3. **No Lookup Service**: The frontend lacks a service to:
   - Store/cache matchup data
   - Look up opponents by team abbreviation
   - Format game times with proper timezones

4. **Team Name Normalization Gap**: The Odds API returns full names ("Detroit Lions") but we need abbreviations ("DET") for matching

---

## Database Schema (Neon ep-old-fog)

### `nflVegasOdds` Table (Already Exists)
```typescript
{
  id: varchar (UUID),
  season: integer,           // 2025
  week: integer,             // 1-18
  gameId: text,              // External API game ID
  homeTeam: text,            // "Detroit Lions"
  awayTeam: text,            // "Minnesota Vikings"
  commenceTime: timestamp,   // 2025-11-01T17:00:00Z (UTC)
  homeMoneyline: integer,
  awayMoneyline: integer,
  homeSpread: text,
  awaySpread: text,
  overUnder: text,
  bookmaker: text,
  createdAt: timestamp,
  updatedAt: timestamp
}
```

**Index:** `uniqueGameBookmaker` on (season, week, gameId, bookmaker)

---

## Solution Architecture

### Overview
Create a complete data pipeline from Neon database → Backend API → Frontend lookup service → UI display

### Component Breakdown

#### 1. **Backend: New API Endpoint**
**File:** `server/routes.ts`

**Endpoint:** `GET /api/nfl/matchups/:season/:week`

**Purpose:** 
- Fetch current week's NFL matchups from `nflVegasOdds` table
- Normalize team names to abbreviations
- Group by game (handling multiple bookmakers)
- Return simplified matchup data

**Response Format:**
```typescript
{
  week: 9,
  season: 2025,
  matchups: [
    {
      homeTeam: "DET",
      awayTeam: "MIN",
      commenceTime: "2025-11-03T17:00:00Z",
      isHomeGame: true
    },
    // ... all games
  ]
}
```

#### 2. **Backend: Matchup Service**
**File:** `server/nflMatchupService.ts` (NEW FILE)

**Functions:**
```typescript
// Get current week matchups
async function getCurrentWeekMatchups(season: number, week: number)

// Normalize team name to abbreviation (reuse from kickerStreamingService)
function normalizeTeamAbbr(teamName: string): string

// Build opponent lookup map
function buildOpponentLookup(matchups): Map<string, MatchupInfo>
```

#### 3. **Frontend: Matchup Data Hook**
**File:** `client/src/hooks/use-nfl-matchups.tsx` (NEW FILE)

**Hook API:**
```typescript
const { 
  getOpponent,        // (teamAbbr: string) => string | null
  getGameTime,        // (teamAbbr: string) => string | null
  isHome              // (teamAbbr: string) => boolean
} = useNFLMatchups(season, week);
```

#### 4. **Frontend: Update Players Page**
**File:** `client/src/pages/players.tsx`

**Changes:**
```typescript
// Use the hook
const { getOpponent: lookupOpponent, getGameTime: lookupGameTime, isHome: lookupIsHome } = useNFLMatchups(2025, currentWeek);

// Update getOpponent function
const getOpponent = (playerData: any) => {
  const teamId = getProTeamId(playerData.player || playerData);
  const teamAbbr = getTeamName(teamId);
  const opponent = lookupOpponent(teamAbbr);
  
  if (!opponent) return "BYE";
  return lookupIsHome(teamAbbr) ? opponent : `@${opponent}`;
};

// Update getGameTime function
const getGameTime = (playerData: any) => {
  const teamId = getProTeamId(playerData.player || playerData);
  const teamAbbr = getTeamName(teamId);
  return lookupGameTime(teamAbbr) || "--";
};
```

#### 5. **Timezone Handling**
**File:** `client/src/lib/timezone-utils.ts` (NEW FILE)

**Function:**
```typescript
function formatGameTime(utcTimestamp: string, teamAbbr: string): string {
  // Maps team → stadium timezone
  // Formats: "Sun 12:00 PM CST"
}
```

---

## Implementation Plan

### Phase 1: Backend Setup

#### Task 1.1: Create NFL Matchup Service
**File:** `server/nflMatchupService.ts`

```typescript
import { db } from "./db";
import { nflVegasOdds } from "@shared/schema";
import { eq, and } from "drizzle-orm";

interface MatchupInfo {
  homeTeam: string;
  awayTeam: string;
  commenceTime: Date;
  gameId: string;
}

function normalizeTeamAbbr(teamName: string): string {
  const mapping: Record<string, string> = {
    'Detroit Lions': 'DET',
    'Minnesota Vikings': 'MIN',
    'Buffalo Bills': 'BUF',
    'Miami Dolphins': 'MIA',
    // ... all 32 teams
  };
  return mapping[teamName] || teamName;
}

export async function getCurrentWeekMatchups(season: number, week: number) {
  const oddsData = await db
    .select()
    .from(nflVegasOdds)
    .where(and(
      eq(nflVegasOdds.season, season),
      eq(nflVegasOdds.week, week)
    ));
  
  // Deduplicate by gameId (multiple bookmakers)
  const gameMap = new Map<string, MatchupInfo>();
  
  for (const game of oddsData) {
    if (!gameMap.has(game.gameId)) {
      gameMap.set(game.gameId, {
        homeTeam: normalizeTeamAbbr(game.homeTeam),
        awayTeam: normalizeTeamAbbr(game.awayTeam),
        commenceTime: game.commenceTime!,
        gameId: game.gameId
      });
    }
  }
  
  return Array.from(gameMap.values());
}
```

#### Task 1.2: Add API Route
**File:** `server/routes.ts` (add after line ~2800)

```typescript
import { getCurrentWeekMatchups } from "./nflMatchupService";

app.get("/api/nfl/matchups/:season/:week", async (req, res) => {
  try {
    const { season, week } = req.params;
    
    const matchups = await getCurrentWeekMatchups(
      parseInt(season),
      parseInt(week)
    );
    
    res.json({
      season: parseInt(season),
      week: parseInt(week),
      matchups: matchups.map(m => ({
        homeTeam: m.homeTeam,
        awayTeam: m.awayTeam,
        commenceTime: m.commenceTime.toISOString(),
        gameId: m.gameId
      }))
    });
  } catch (error: any) {
    console.error('Error fetching NFL matchups:', error);
    res.status(500).json({ message: error.message });
  }
});
```

### Phase 2: Frontend Setup

#### Task 2.1: Create Timezone Utility
**File:** `client/src/lib/timezone-utils.ts`

```typescript
const STADIUM_TIMEZONES: Record<string, string> = {
  "BUF": "America/New_York",
  "MIA": "America/New_York",
  "NE": "America/New_York",
  "NYJ": "America/New_York",
  "CHI": "America/Chicago",
  "DET": "America/Detroit",
  "MIN": "America/Chicago",
  "DAL": "America/Chicago",
  // ... all 32 teams
};

export function formatGameTime(
  utcTimestamp: string,
  teamAbbr: string
): string {
  const date = new Date(utcTimestamp);
  const timezone = STADIUM_TIMEZONES[teamAbbr] || "America/New_York";
  
  const formatter = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: timezone,
    timeZoneName: 'short'
  });
  
  return formatter.format(date);
  // Example: "Sun 12:00 PM CST"
}
```

#### Task 2.2: Create Matchup Hook
**File:** `client/src/hooks/use-nfl-matchups.tsx`

```typescript
import { useQuery } from "@tanstack/react-query";
import { formatGameTime } from "@/lib/timezone-utils";

export function useNFLMatchups(season: number, week: number) {
  const { data, isLoading } = useQuery({
    queryKey: ['/api/nfl/matchups', season, week],
    queryFn: async () => {
      const response = await fetch(`/api/nfl/matchups/${season}/${week}`);
      if (!response.ok) throw new Error('Failed to fetch matchups');
      return response.json();
    },
    staleTime: 1000 * 60 * 60, // 1 hour cache
  });

  // Build lookup maps
  const opponentMap = new Map<string, string>();
  const gameTimeMap = new Map<string, string>();
  const isHomeMap = new Map<string, boolean>();

  if (data?.matchups) {
    for (const matchup of data.matchups) {
      opponentMap.set(matchup.homeTeam, matchup.awayTeam);
      gameTimeMap.set(matchup.homeTeam, formatGameTime(matchup.commenceTime, matchup.homeTeam));
      isHomeMap.set(matchup.homeTeam, true);

      opponentMap.set(matchup.awayTeam, matchup.homeTeam);
      gameTimeMap.set(matchup.awayTeam, formatGameTime(matchup.commenceTime, matchup.awayTeam));
      isHomeMap.set(matchup.awayTeam, false);
    }
  }

  return {
    getOpponent: (teamAbbr: string): string | null => opponentMap.get(teamAbbr) || null,
    getGameTime: (teamAbbr: string): string | null => gameTimeMap.get(teamAbbr) || null,
    isHome: (teamAbbr: string): boolean => isHomeMap.get(teamAbbr) || false,
    isLoading
  };
}
```

#### Task 2.3: Update Players Page
**File:** `client/src/pages/players.tsx`

**Add import at top (~line 12):**
```typescript
import { useNFLMatchups } from "@/hooks/use-nfl-matchups";
```

**Add hook usage (~line 21):**
```typescript
const currentNFLWeek = getCurrentNFLWeek();
const { getOpponent: lookupOpponent, getGameTime: lookupGameTime, isHome: lookupIsHome } = useNFLMatchups(2025, currentNFLWeek);
```

**Replace getOpponent (line 387-393):**
```typescript
const getOpponent = (playerData: any) => {
  const player = playerData.player || playerData;
  const teamId = getProTeamId(player);
  if (!teamId) return "BYE";
  
  const teamAbbr = getTeamName(teamId);
  const opponent = lookupOpponent(teamAbbr);
  if (!opponent) return "BYE";
  
  return lookupIsHome(teamAbbr) ? opponent : `@${opponent}`;
};
```

**Replace getGameTime (line 139-143):**
```typescript
const getGameTime = (playerData: any) => {
  const player = playerData.player || playerData;
  const teamId = getProTeamId(player);
  if (!teamId) return "--";
  
  const teamAbbr = getTeamName(teamId);
  return lookupGameTime(teamAbbr) || "--";
};
```

### Phase 3: Testing

#### Test Cases
1. **Basic Display** - Verify OPP shows correct opponents with @ for away games
2. **Game Times** - Verify STATUS shows formatted times with correct timezones
3. **Bye Weeks** - Verify BYE/-- displayed when no matchup
4. **Timezone Accuracy** - Verify EST/CST/PST/MST show correctly
5. **Data Refresh** - Verify updates when week changes

---

## Data Flow Diagram

```
The Odds API → oddsApiService.ts → nflVegasOdds (Neon DB)
                                          ↓
                          nflMatchupService.ts (normalizes teams)
                                          ↓
                          GET /api/nfl/matchups/:season/:week
                                          ↓
                          useNFLMatchups hook (builds lookup maps)
                                          ↓
                          players.tsx (getOpponent/getGameTime)
                                          ↓
                          UI: OPP="MIN" STATUS="Sun 12:00 PM CST"
```

---

## File Changes Summary

### New Files (3)
1. `server/nflMatchupService.ts` - Matchup data service (~100 lines)
2. `client/src/hooks/use-nfl-matchups.tsx` - React hook (~80 lines)
3. `client/src/lib/timezone-utils.ts` - Timezone utility (~70 lines)

### Modified Files (2)
1. `server/routes.ts` - Add API endpoint (~25 lines)
2. `client/src/pages/players.tsx` - Update 2 functions (~20 lines)

**Total: ~295 lines of code**

---

## Why This Will Work

✅ **All Infrastructure Exists**
- Odds API integration working
- Database table populated
- Team mapping functions available
- Player team IDs accessible

✅ **Simple Data Flow**
- Fetch from DB → Build maps → Display
- O(1) lookup performance
- React Query caching (1 hour)

✅ **No External Dependencies**
- No new npm packages
- Uses existing patterns
- Follows project conventions

✅ **Fully Testable**
- Each component independent
- Clear error handling
- Database queries verifiable

---

## Success Criteria

**OPP Column:**
- Shows opponent abbreviation (e.g., "MIN")
- Adds "@" for away games (e.g., "@MIN")
- Shows "BYE" for bye weeks

**STATUS Column:**
- Shows day and time (e.g., "Sun 12:00 PM")
- Includes timezone (e.g., "CST")
- Shows "--" for bye weeks

**Performance:**
- Page load < 2 seconds
- 1-hour cache duration
- No redundant API calls

---

## Timeline & Risk

**Effort Estimate:** ~5 hours
- Backend: 2 hours
- Frontend: 2 hours
- Testing: 1 hour

**Risk Level:** LOW
- All data available
- No complex algorithms
- Proven patterns

**Dependencies:**
- ODDS_API_KEY configured ✅
- nflVegasOdds table populated (run Jobs page refresh)
- Neon database accessible ✅

---

## Conclusion

This feature is **100% achievable** with existing infrastructure. All required data exists in the Neon database (ep-old-fog), accessed via The Odds API integration. The implementation follows established patterns and requires no new external dependencies.

**Next Step:** Implement Phase 1 (Backend) to create the API endpoint and matchup service.
