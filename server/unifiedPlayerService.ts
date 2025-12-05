import { storage } from "./storage";
import { db } from "./db";
import type { InsertEspnPlayerData, InsertFpPlayerData, InsertDefenseVsPositionStats, InsertPlayerCrosswalk } from "@shared/schema";

const ESPN_BASE_URL = "https://lm-api-reads.fantasy.espn.com/apis/v3/games";

const NFL_TEAM_NAMES: Record<number, string> = {
  1: "ATL", 2: "BUF", 3: "CHI", 4: "CIN", 5: "CLE", 6: "DAL", 7: "DEN", 8: "DET",
  9: "GB", 10: "TEN", 11: "IND", 12: "KC", 13: "LV", 14: "LAR", 15: "MIA", 16: "MIN",
  17: "NE", 18: "NO", 19: "NYG", 20: "NYJ", 21: "PHI", 22: "ARI", 23: "PIT", 24: "LAC",
  25: "SF", 26: "SEA", 27: "TB", 28: "WAS", 29: "CAR", 30: "JAX", 33: "BAL", 34: "HOU"
};

const ESPN_POSITION_NAMES: Record<number, string> = {
  1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K", 16: "DEF"
};

function getNflTeamAbbr(teamId: number): string | null {
  return NFL_TEAM_NAMES[teamId] || null;
}

function getPositionName(positionId: number): string | null {
  return ESPN_POSITION_NAMES[positionId] || null;
}

// Normalize player name for matching (lowercase, remove special chars, collapse spaces)
function normalizePlayerName(name: string): string {
  return name.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Load player aliases from database for name translation
async function loadPlayerAliases(sport: string): Promise<Map<string, string>> {
  const aliasMap = new Map<string, string>();
  
  try {
    const { sql } = await import('drizzle-orm');
    const result = await db.execute(
      sql`SELECT alias_name, canonical_name FROM player_aliases WHERE sport = ${sport}`
    );
    
    for (const row of result.rows) {
      const alias = normalizePlayerName(String(row.alias_name));
      const canonical = normalizePlayerName(String(row.canonical_name));
      aliasMap.set(alias, canonical);
    }
    
    if (aliasMap.size > 0) {
      console.log(`Loaded ${aliasMap.size} player aliases for ${sport}`);
    }
  } catch (error) {
    console.log('No player aliases found or table not exists, skipping alias lookup');
  }
  
  return aliasMap;
}

// Apply alias translation to a player name
function applyAlias(fullName: string, aliasMap: Map<string, string>): string {
  const normalized = normalizePlayerName(fullName);
  return aliasMap.get(normalized) || normalized;
}

// Fetch FP roster status to identify players who are free agents or inactive
// Returns a Set of normalized player names that should be excluded from ESPN data
// Note: Currently NFL-only - other sports return empty set (no filtering)
async function getFpInactivePlayers(sport: string): Promise<Set<string>> {
  const inactiveNames = new Set<string>();
  
  // FP roster validation is currently NFL-only due to sport-specific team mappings
  // For other sports, return empty set (no inactive filtering)
  if (sport !== 'NFL') {
    console.log(`FP roster validation not implemented for ${sport}, skipping inactive filtering`);
    return inactiveNames;
  }
  
  const apiKey = process.env.FantasyProsApiKey;
  
  if (!apiKey) {
    console.log('Warning: FantasyProsApiKey not set, skipping FP roster validation');
    return inactiveNames;
  }
  
  try {
    const url = `https://api.fantasypros.com/public/v2/json/${sport}/players`;
    console.log('Fetching FP roster status for inactive player filtering...');
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'x-api-key': apiKey,
      }
    });
    
    if (!response.ok) {
      console.log(`Warning: FP roster fetch failed (${response.status}), proceeding without validation`);
      return inactiveNames;
    }
    
    const data = await response.json();
    const players = data.players || [];
    
    // Valid NFL teams - players not on these are considered inactive
    const validTeams = new Set([
      'ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE',
      'DAL', 'DEN', 'DET', 'GB', 'HOU', 'IND', 'JAX', 'KC',
      'LAC', 'LAR', 'LV', 'MIA', 'MIN', 'NE', 'NO', 'NYG',
      'NYJ', 'PHI', 'PIT', 'SEA', 'SF', 'TB', 'TEN', 'WAS',
      'JAC' // FP uses JAC for Jacksonville
    ]);
    
    // Fantasy-relevant positions only
    const fantasyPositions = new Set(['QB', 'RB', 'WR', 'TE', 'K', 'DST', 'DEF']);
    
    for (const p of players) {
      const position = (p.position_id || '').toUpperCase();
      if (!fantasyPositions.has(position)) continue;
      
      const teamId = (p.team_id || '').toUpperCase();
      const playerName = p.player_name || '';
      
      // If player is FA (free agent) or not on a valid team, they're inactive
      if (!teamId || teamId === 'FA' || !validTeams.has(teamId)) {
        inactiveNames.add(normalizePlayerName(playerName));
      }
    }
    
    console.log(`Identified ${inactiveNames.size} inactive/FA players from FP for filtering`);
    return inactiveNames;
  } catch (error) {
    console.log(`Warning: FP roster validation failed (${error}), proceeding without validation`);
    return inactiveNames;
  }
}

export async function refreshEspnPlayers(
  sport: string = 'NFL',
  season: number = 2025
): Promise<{ success: boolean; recordCount: number; error?: string }> {
  try {
    console.log(`Refreshing ESPN ${sport} players for ${season}...`);

    // First, fetch FP roster status to filter out inactive players
    // FP is the authority on current roster status
    const fpInactivePlayers = await getFpInactivePlayers(sport);
    
    // Clear stale ESPN data before fetching fresh data
    // This ensures inactive players from previous runs are removed
    const deletedCount = await storage.deleteEspnPlayerData(sport, season);
    console.log(`Cleared ${deletedCount} existing ESPN player records for ${sport} ${season}`);

    // Fetch players using a high limit - ESPN API doesn't support per-team filtering
    // We'll fetch a large batch and filter to rostered players on our side
    const url = `${ESPN_BASE_URL}/ffl/seasons/${season}/segments/0/leaguedefaults/1?view=kona_player_info`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'X-Fantasy-Filter': JSON.stringify({
          "players": {
            "filterSlotIds": {"value": [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23]},
            "limit": 5000,
            "sortPercOwned": {"sortPriority": 1, "sortAsc": false}
          }
        })
      }
    });

    if (!response.ok) {
      throw new Error(`ESPN API Error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const players = data.players || [];
    
    console.log(`ESPN API returned ${players.length} total players`);

    if (players.length === 0) {
      return { success: false, recordCount: 0, error: 'No players returned from ESPN API' };
    }

    const playerRecords: InsertEspnPlayerData[] = [];
    let skippedFreeAgents = 0;
    let skippedInactive = 0;

    for (const playerEntry of players) {
      const player = playerEntry.player || playerEntry;
      const ownership = player.ownership || playerEntry.ownership || {};
      
      const espnPlayerId = player.id;
      if (!espnPlayerId) continue;

      const fullName = player.fullName || `${player.firstName || ''} ${player.lastName || ''}`.trim();
      if (!fullName) continue;

      const teamId = player.proTeamId || player.teamId;
      const team = teamId ? getNflTeamAbbr(teamId) : null;
      const position = player.defaultPositionId ? getPositionName(player.defaultPositionId) : null;

      // Skip players not on one of the 32 NFL teams (free agents per ESPN)
      if (!team) {
        skippedFreeAgents++;
        continue;
      }
      
      // Skip players that FP marks as inactive/FA (ESPN has stale roster data)
      // This ensures we only include players that are actually on active rosters
      const normalizedName = normalizePlayerName(fullName);
      if (fpInactivePlayers.has(normalizedName)) {
        skippedInactive++;
        continue;
      }

      let injuryStatus: string | null = null;
      if (player.injured) {
        injuryStatus = player.injuryStatus || 'INJURED';
      } else if (player.injuryStatus) {
        injuryStatus = player.injuryStatus;
      }

      const stats = player.stats || [];
      const currentStats = stats.find((s: any) => s.statSourceId === 0 && s.statSplitTypeId === 1) || {};

      // Extract latest weekly outlook from ESPN
      let latestOutlook: string | null = null;
      let outlookWeek: number | null = null;
      const outlooks = player.outlooks?.outlooksByWeek;
      if (outlooks && typeof outlooks === 'object') {
        // Get the highest week number with an outlook (most recent)
        const weeks = Object.keys(outlooks).map(Number).filter(n => !isNaN(n)).sort((a, b) => b - a);
        if (weeks.length > 0) {
          outlookWeek = weeks[0];
          latestOutlook = outlooks[String(outlookWeek)] || null;
        }
      }
      
      // Parse newsDate from ESPN's lastNewsDate (milliseconds since epoch)
      let newsDate: Date | null = null;
      if (player.lastNewsDate && typeof player.lastNewsDate === 'number') {
        newsDate = new Date(player.lastNewsDate);
      }

      playerRecords.push({
        espnPlayerId,
        sport,
        season,
        firstName: player.firstName || null,
        lastName: player.lastName || null,
        fullName,
        team,
        position,
        jerseyNumber: player.jersey ? parseInt(player.jersey) : null,
        injuryStatus,
        percentOwned: ownership.percentOwned ?? null,
        percentStarted: ownership.percentStarted ?? null,
        averagePoints: currentStats.appliedAverage ?? null,
        totalPoints: currentStats.appliedTotal ?? null,
        latestOutlook,
        outlookWeek,
        newsDate
      });
    }

    console.log(`Filtered to ${playerRecords.length} active players (skipped ${skippedFreeAgents} ESPN free agents, ${skippedInactive} FP-inactive players)`);
    
    if (playerRecords.length === 0) {
      return { success: false, recordCount: 0, error: 'No rostered players found after filtering' };
    }

    const result = await storage.bulkUpsertEspnPlayerData(playerRecords);
    
    console.log(`✓ ESPN players refresh complete: ${result.inserted} inserted, ${result.updated} updated`);
    return { 
      success: true, 
      recordCount: result.inserted + result.updated 
    };
  } catch (error: any) {
    console.error('Error refreshing ESPN players:', error);
    return { success: false, recordCount: 0, error: error.message };
  }
}

const FANTASY_PROS_API_KEY = process.env.FantasyProsApiKey;
const FP_BASE_URL = "https://api.fantasypros.com/public/v2/json";

async function fetchFromFantasyPros(endpoint: string): Promise<any> {
  if (!FANTASY_PROS_API_KEY) {
    throw new Error("Fantasy Pros API key not configured. Please add FantasyProsApiKey to your secrets.");
  }

  console.log(`Calling Fantasy Pros API: ${endpoint}`);

  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'x-api-key': FANTASY_PROS_API_KEY,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Fantasy Pros API error: ${response.status} - ${errorText.substring(0, 200)}`);
  }

  return response.json();
}

// Team nickname mapping for DST entries (matches ESPN's naming convention)
const TEAM_NICKNAMES: Record<string, string> = {
  'ARI': 'Cardinals', 'ATL': 'Falcons', 'BAL': 'Ravens', 'BUF': 'Bills',
  'CAR': 'Panthers', 'CHI': 'Bears', 'CIN': 'Bengals', 'CLE': 'Browns',
  'DAL': 'Cowboys', 'DEN': 'Broncos', 'DET': 'Lions', 'GB': 'Packers',
  'HOU': 'Texans', 'IND': 'Colts', 'JAX': 'Jaguars', 'KC': 'Chiefs',
  'LAC': 'Chargers', 'LAR': 'Rams', 'LV': 'Raiders', 'MIA': 'Dolphins',
  'MIN': 'Vikings', 'NE': 'Patriots', 'NO': 'Saints', 'NYG': 'Giants',
  'NYJ': 'Jets', 'PHI': 'Eagles', 'PIT': 'Steelers', 'SEA': 'Seahawks',
  'SF': '49ers', 'TB': 'Buccaneers', 'TEN': 'Titans', 'WAS': 'Commanders'
};

// Helper function to fetch DST players from FantasyPros dedicated DST endpoint
// Result type for DST fetch - either success with records or failure with missing teams
type FpDstResult = 
  | { success: true; records: InsertFpPlayerData[] }
  | { success: false; error: string; missingTeams: string[] };

// Note: This function is NFL-only as DST is a football-specific position
// Returns explicit success/failure - NO fallback data
async function fetchFpDstPlayers(sport: string, season: number, validTeams: Set<string>): Promise<FpDstResult> {
  const dstRecords: InsertFpPlayerData[] = [];
  const teamNormalization: Record<string, string> = { 'JAC': 'JAX' };
  
  // DST is NFL-only - other sports return success with empty records
  if (sport !== 'NFL') {
    console.log(`DST position not applicable for sport: ${sport}`);
    return { success: true, records: [] };
  }
  
  // Use FP's players endpoint with DST position filter
  // Must use same base URL format as main players endpoint (with /json/ in path)
  const dstEndpoint = `${FP_BASE_URL}/NFL/players?position=DST`;
  console.log(`Fetching DST players from: ${dstEndpoint}`);
  
  let dstData;
  try {
    dstData = await fetchFromFantasyPros(dstEndpoint);
  } catch (error) {
    return { 
      success: false, 
      error: `Failed to fetch DST data from FantasyPros: ${error}`,
      missingTeams: Array.from(validTeams)
    };
  }
  
  if (!dstData?.players || !Array.isArray(dstData.players)) {
    return { 
      success: false, 
      error: 'FantasyPros DST endpoint returned invalid data structure',
      missingTeams: Array.from(validTeams)
    };
  }
  
  console.log(`Received ${dstData.players.length} players from FantasyPros DST endpoint`);
  
  // Track how many we process vs skip for debugging
  let skippedNonDst = 0;
  
  for (const p of dstData.players) {
    const playerId = String(p.player_id || p.id || p.fpid);
    const playerName = p.player_name || p.name;
    if (!playerId || !playerName) continue;
    
    // CRITICAL: Verify this is actually a DST/DEF record
    // The FP API might return all players - we must filter
    const position = (p.player_position_id || p.position_id || p.position || '').toUpperCase();
    if (position !== 'DST' && position !== 'DEF') {
      skippedNonDst++;
      continue;
    }
    
    // Get and normalize team abbreviation
    let team = (p.player_team_id || p.team_id || p.team_abbr || p.team || '').toUpperCase();
    team = teamNormalization[team] || team;
    if (!team || !validTeams.has(team)) continue;
    
    // Normalize the name to ESPN format: "{Nickname} D/ST"
    // ESPN uses names like "Cardinals D/ST" for defenses
    const nickname = TEAM_NICKNAMES[team] || team;
    const normalizedName = `${nickname} D/ST`;
    
    dstRecords.push({
      fpPlayerId: playerId,
      sport,
      season,
      firstName: nickname,
      lastName: 'D/ST',
      fullName: normalizedName,
      team,
      position: 'DEF',
      jerseyNumber: null
    });
    
    // Log first few for verification
    if (dstRecords.length <= 3) {
      console.log(`  DST: ${normalizedName} (${team}) - FP ID: ${playerId}`);
    }
  }
  
  console.log(`Processed ${dstRecords.length} DST records from FP API (skipped ${skippedNonDst} non-DST records)`);
  
  // Check for completeness - all 32 teams must have DST data
  const foundTeams = new Set(dstRecords.map(r => r.team));
  const missingTeams = Array.from(validTeams).filter(t => !foundTeams.has(t));
  
  if (missingTeams.length > 0) {
    console.error(`INCOMPLETE DST DATA: Missing ${missingTeams.length} teams: ${missingTeams.join(', ')}`);
    return {
      success: false,
      error: `FantasyPros DST endpoint missing ${missingTeams.length} teams`,
      missingTeams
    };
  }
  
  console.log(`DST data complete: All 32 teams present`);
  return { success: true, records: dstRecords };
}

// Enrich FP players with their latest news from fantasy_pros_news table
async function enrichFpPlayersWithNews(sport: string, season: number): Promise<number> {
  const { sql } = await import("drizzle-orm");
  
  // Get latest news per player (by player_id) and update fp_player_data
  // We match on fp_player_id = player_id from the news table
  // Season filter ensures we only update the specific season's data
  const result = await db.execute(sql`
    WITH latest_news AS (
      SELECT DISTINCT ON (player_id)
        player_id,
        headline,
        analysis,
        news_date
      FROM fantasy_pros_news
      WHERE sport = ${sport}
        AND player_id IS NOT NULL
      ORDER BY player_id, news_date DESC NULLS LAST, created_at DESC
    )
    UPDATE fp_player_data fpd
    SET 
      latest_headline = ln.headline,
      latest_analysis = ln.analysis,
      news_date = ln.news_date
    FROM latest_news ln
    WHERE fpd.fp_player_id = ln.player_id
      AND fpd.sport = ${sport}
      AND fpd.season = ${season}
  `);
  
  return result.rowCount || 0;
}

export async function refreshFpPlayers(
  sport: string = 'NFL',
  season: number = 2025
): Promise<{ success: boolean; recordCount: number; error?: string }> {
  try {
    console.log(`Refreshing FP ${sport} players for ${season} from FantasyPros API...`);

    // Clear stale FP data before fetching fresh data
    // This ensures we only have current, filtered fantasy-relevant players
    const deletedCount = await storage.deleteFpPlayerData(sport, season);
    console.log(`Cleared ${deletedCount} existing FP player records for ${sport} ${season}`);

    // Fetch players directly from FantasyPros API
    const endpoint = `${FP_BASE_URL}/${sport.toUpperCase()}/players`;
    const data = await fetchFromFantasyPros(endpoint);

    if (!data?.players || !Array.isArray(data.players)) {
      return { success: false, recordCount: 0, error: 'Invalid response from FantasyPros API' };
    }

    console.log(`Received ${data.players.length} players from FantasyPros API`);

    // Valid NFL teams for filtering (skip free agents)
    const validTeams = new Set([
      'ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE',
      'DAL', 'DEN', 'DET', 'GB', 'HOU', 'IND', 'JAX', 'KC',
      'LAC', 'LAR', 'LV', 'MIA', 'MIN', 'NE', 'NO', 'NYG',
      'NYJ', 'PHI', 'PIT', 'SEA', 'SF', 'TB', 'TEN', 'WAS'
    ]);

    // Team abbreviation normalization (FP uses different abbreviations)
    const teamNormalization: Record<string, string> = {
      'JAC': 'JAX',  // Jacksonville: FP uses JAC, ESPN uses JAX
    };

    // Fantasy-relevant positions only (matches ESPN's fantasy API)
    // Note: DEF/DST are handled separately by fetchFpDstPlayers with proper name formatting
    const fantasyPositions = new Set(['QB', 'RB', 'WR', 'TE', 'K']);

    const playerRecords: InsertFpPlayerData[] = [];
    let skippedNonFantasy = 0;

    for (const p of data.players) {
      const playerId = String(p.player_id || p.id || p.fpid);
      const playerName = p.player_name || p.name;
      if (!playerId || !playerName) continue;

      // Get team abbreviation, normalize it, and skip free agents
      let team = (p.player_team_id || p.team_id || p.team_abbr || p.team || '').toUpperCase();
      team = teamNormalization[team] || team;  // Normalize team abbreviation
      if (!team || !validTeams.has(team)) continue;

      // Get primary position
      const primaryPosition = (p.player_position_id || p.position_id || p.position || '').toUpperCase();
      
      // Check if player has ANY fantasy-relevant position
      // Some players like fullbacks are listed as LB but have RB in their positions array
      const allPositions: string[] = [];
      if (primaryPosition) allPositions.push(primaryPosition);
      if (Array.isArray(p.positions)) {
        for (const pos of p.positions) {
          // positions can be comma-separated like "LB,RB"
          const parts = String(pos).toUpperCase().split(',');
          allPositions.push(...parts);
        }
      }
      
      // Find the best fantasy-relevant position (prefer the primary if fantasy-relevant)
      let position = fantasyPositions.has(primaryPosition) ? primaryPosition : null;
      if (!position) {
        position = allPositions.find(pos => fantasyPositions.has(pos)) || null;
      }
      
      if (!position) {
        skippedNonFantasy++;
        continue;
      }

      const nameParts = playerName.split(' ');
      const firstName = nameParts[0] || null;
      const lastName = nameParts.slice(1).join(' ') || null;

      playerRecords.push({
        fpPlayerId: playerId,
        sport,
        season,
        firstName,
        lastName,
        fullName: playerName,
        team,
        position,
        jerseyNumber: p.jersey || p.jersey_number || null
      });
    }

    // Fetch DST players from FP's dedicated DST endpoint - NO fallback data
    console.log('Fetching DST players from FantasyPros...');
    const dstResult = await fetchFpDstPlayers(sport, season, validTeams);
    
    if (!dstResult.success) {
      console.error(`DST fetch failed: ${dstResult.error}`);
      console.error(`Missing teams: ${dstResult.missingTeams.join(', ')}`);
      return { 
        success: false, 
        recordCount: 0, 
        error: `${dstResult.error}. Missing teams: ${dstResult.missingTeams.join(', ')}` 
      };
    }
    
    playerRecords.push(...dstResult.records);

    console.log(`Filtered to ${playerRecords.length} fantasy-relevant players (skipped ${skippedNonFantasy} IDP/non-fantasy, added ${dstResult.records.length} DST)`);
    const result = await storage.bulkUpsertFpPlayerData(playerRecords);
    
    // NOTE: We no longer delete FP players without ESPN match pre-crosswalk
    // This was causing valid FP players with outdated team info to be deleted
    // before they could be matched by name+position in the crosswalk.
    // The crosswalk now handles matching more flexibly.
    
    // Enrich FP players with latest news from fantasy_pros_news table
    console.log('Enriching FP players with latest news...');
    const newsEnriched = await enrichFpPlayersWithNews(sport, season);
    console.log(`Enriched ${newsEnriched} players with news data`);

    console.log(`✓ FP players refresh complete: ${result.inserted} inserted, ${result.updated} updated`);
    return { 
      success: true, 
      recordCount: result.inserted + result.updated 
    };
  } catch (error: any) {
    console.error('Error refreshing FP players:', error);
    return { success: false, recordCount: 0, error: error.message };
  }
}

const POSITIONS_FOR_OPRK = ['QB', 'RB', 'WR', 'TE'];
const ALL_NFL_TEAMS = [
  'ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE',
  'DAL', 'DEN', 'DET', 'GB', 'HOU', 'IND', 'JAX', 'KC',
  'LAC', 'LAR', 'LV', 'MIA', 'MIN', 'NE', 'NO', 'NYG',
  'NYJ', 'PHI', 'PIT', 'SEA', 'SF', 'TB', 'TEN', 'WAS'
];

export async function refreshDefenseStats(
  sport: string = 'NFL',
  season: number = 2025,
  scoringType: string = 'PPR'
): Promise<{ success: boolean; recordCount: number; error?: string }> {
  try {
    console.log(`Initializing defense vs position stats for ${sport} ${season} (${scoringType})...`);

    // Initialize defense stats with placeholder rankings for all team/position combinations
    // Real OPRK rankings require historical game-by-game data which is outside the scope of these 4 tables
    const statsRecords: InsertDefenseVsPositionStats[] = [];
    
    for (const position of POSITIONS_FOR_OPRK) {
      // Sort teams alphabetically and assign placeholder ranks
      const sortedTeams = [...ALL_NFL_TEAMS].sort();
      
      sortedTeams.forEach((team, index) => {
        statsRecords.push({
          sport,
          season,
          week: null,
          defenseTeam: team,
          position,
          gamesPlayed: 0,
          totalPointsAllowed: 0,
          avgPointsAllowed: 0,
          rank: index + 1, // Placeholder ranking (alphabetical order)
          scoringType
        });
      });
    }

    console.log(`Processing ${statsRecords.length} defense vs position stats (initialized with defaults)...`);
    const result = await storage.bulkUpsertDefenseVsPositionStats(statsRecords);

    console.log(`✓ Defense stats initialized: ${result.inserted} inserted, ${result.updated} updated`);
    console.log(`Note: OPRK rankings are placeholders. Real rankings can be populated separately.`);
    
    return { 
      success: true, 
      recordCount: result.inserted + result.updated 
    };
  } catch (error: any) {
    console.error('Error refreshing defense stats:', error);
    return { success: false, recordCount: 0, error: error.message };
  }
}

function normalizeNameForCanonicalKey(name: string): string {
  let normalized = name.toLowerCase().trim();
  
  const suffixes = [
    ' iv', ' iii', ' ii', ' v',
    ' jr.', ' jr', ' junior',
    ' sr.', ' sr', ' senior',
  ];
  
  for (const suffix of suffixes) {
    if (normalized.endsWith(suffix)) {
      normalized = normalized.slice(0, -suffix.length);
      break;
    }
  }
  
  return normalized
    .replace(/[^a-z0-9]/g, '')
    .replace(/\s+/g, '');
}

function normalizeForCanonicalKey(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/\s+/g, '');
}

// Create canonical key with team+position (for exact matching)
function createCanonicalKey(firstName: string | null, lastName: string | null, team: string | null, position: string | null): string {
  const fullName = `${firstName || ''} ${lastName || ''}`.trim();
  const normalizedName = normalizeNameForCanonicalKey(fullName);
  const normalizedTeam = normalizeForCanonicalKey(team || '');
  const normalizedPosition = normalizeForCanonicalKey(position || '');
  
  return `${normalizedName}${normalizedTeam}${normalizedPosition}`;
}

// Create a name+position only key (for fuzzy matching when teams differ)
function createNamePositionKey(firstName: string | null, lastName: string | null, position: string | null): string {
  const fullName = `${firstName || ''} ${lastName || ''}`.trim();
  const normalizedName = normalizeNameForCanonicalKey(fullName);
  const normalizedPosition = normalizeForCanonicalKey(position || '');
  
  return `${normalizedName}${normalizedPosition}`;
}

// Normalize position for matching (DEF/DST equivalence)
function normalizePosition(pos: string | null): string {
  const p = (pos || '').toUpperCase();
  if (p === 'DST') return 'DEF';
  return p;
}

// Create a name+team only key (for cross-position matching)
function createNameTeamKey(firstName: string | null, lastName: string | null, team: string | null): string {
  const fullName = `${firstName || ''} ${lastName || ''}`.trim();
  const normalizedName = normalizeNameForCanonicalKey(fullName);
  const normalizedTeam = normalizeForCanonicalKey(team || '');
  
  return `${normalizedName}${normalizedTeam}`;
}

export async function buildCrosswalk(
  sport: string = 'NFL',
  season: number = 2025
): Promise<{ success: boolean; recordCount: number; matched: number; unmatched: number; teamMismatches: number; aliasMatched: number; crossPosMatched: number; error?: string }> {
  try {
    console.log(`Building player crosswalk for ${sport} ${season}...`);

    // Load player aliases for name translation
    const aliasMap = await loadPlayerAliases(sport);

    const espnPlayers = await storage.getEspnPlayerData(sport, season);
    const fpPlayers = await storage.getFpPlayerData(sport, season);

    if (espnPlayers.length === 0) {
      return { 
        success: false, 
        recordCount: 0, 
        matched: 0, 
        unmatched: 0, 
        teamMismatches: 0,
        aliasMatched: 0,
        crossPosMatched: 0,
        error: `No ESPN players found for ${sport} ${season}. Run "Refresh ESPN Players" first.` 
      };
    }

    if (fpPlayers.length === 0) {
      return { 
        success: false, 
        recordCount: 0, 
        matched: 0, 
        unmatched: 0, 
        teamMismatches: 0,
        aliasMatched: 0,
        crossPosMatched: 0,
        error: `No FP players found for ${sport} ${season}. Run "Refresh FP Players" first.` 
      };
    }

    // Build multiple maps for FP players:
    // 1. Exact match map (name+team+position)
    // 2. Fuzzy match map (name+position only, for team mismatch fallback)
    // 3. Cross-position map (name+team only, for position mismatch fallback)
    const fpExactMap = new Map<string, typeof fpPlayers[0]>();
    const fpFuzzyMap = new Map<string, typeof fpPlayers[0][]>();
    const fpCrossPosMap = new Map<string, typeof fpPlayers[0][]>();
    
    for (const fp of fpPlayers) {
      const fpFullName = `${fp.firstName || ''} ${fp.lastName || ''}`.trim();
      
      // Exact match map
      const exactKey = createCanonicalKey(fp.firstName, fp.lastName, fp.team, fp.position);
      fpExactMap.set(exactKey, fp);
      
      // For fuzzy matching, normalize position (DEF/DST)
      const fuzzyKey = createNamePositionKey(fp.firstName, fp.lastName, normalizePosition(fp.position));
      if (!fpFuzzyMap.has(fuzzyKey)) {
        fpFuzzyMap.set(fuzzyKey, []);
      }
      fpFuzzyMap.get(fuzzyKey)!.push(fp);
      
      // For cross-position matching (name+team only)
      const crossPosKey = createNameTeamKey(fp.firstName, fp.lastName, fp.team);
      if (!fpCrossPosMap.has(crossPosKey)) {
        fpCrossPosMap.set(crossPosKey, []);
      }
      fpCrossPosMap.get(crossPosKey)!.push(fp);
    }

    const crosswalkRecords: InsertPlayerCrosswalk[] = [];
    const matchedFpIds = new Set<string>();
    let exactMatched = 0;
    let fuzzyMatched = 0;
    let aliasMatched = 0;
    let crossPosMatched = 0;
    let unmatched = 0;

    // Pass 1: Match ESPN players to FP players
    for (const espn of espnPlayers) {
      const espnFullName = `${espn.firstName || ''} ${espn.lastName || ''}`.trim();
      const exactKey = createCanonicalKey(espn.firstName, espn.lastName, espn.team, espn.position);
      
      // Try exact match first (name+team+position)
      let fpMatch = fpExactMap.get(exactKey);
      let matchType: 'exact' | 'fuzzy' | 'alias' | 'cross_position' | 'unmatched' = 'exact';
      let matchNote: string | null = null;
      
      if (fpMatch) {
        matchedFpIds.add(fpMatch.fpPlayerId);
        exactMatched++;
      } else {
        // Try alias translation if available
        const translatedName = applyAlias(espnFullName, aliasMap);
        if (translatedName !== normalizePlayerName(espnFullName)) {
          // Name was translated via alias - try to find the FP player with translated name
          for (const fp of fpPlayers) {
            const fpFullName = `${fp.firstName || ''} ${fp.lastName || ''}`.trim();
            if (normalizePlayerName(fpFullName) === translatedName && 
                !matchedFpIds.has(fp.fpPlayerId)) {
              // Found alias match - prefer same team, same position
              if ((fp.team || '').toUpperCase() === (espn.team || '').toUpperCase()) {
                fpMatch = fp;
                matchedFpIds.add(fp.fpPlayerId);
                matchType = 'alias';
                matchNote = `Alias match: "${espnFullName}" → "${fpFullName}"`;
                aliasMatched++;
                break;
              }
            }
          }
        }
        
        if (!fpMatch) {
          // Try fuzzy match (name+position only, ignore team)
          const fuzzyKey = createNamePositionKey(espn.firstName, espn.lastName, normalizePosition(espn.position));
          const fuzzyMatches = fpFuzzyMap.get(fuzzyKey) || [];
          
          // Filter to unmatched FP players
          const availableMatches = fuzzyMatches.filter(fp => !matchedFpIds.has(fp.fpPlayerId));
          
          if (availableMatches.length === 1) {
            // Single match - use it with team mismatch note
            fpMatch = availableMatches[0];
            matchedFpIds.add(fpMatch.fpPlayerId);
            matchType = 'fuzzy';
            matchNote = `Team mismatch: ESPN(${espn.team}) vs FP(${fpMatch.team})`;
            fuzzyMatched++;
          } else if (availableMatches.length > 1) {
            // Multiple matches - try to find best match by team similarity
            const teamMatch = availableMatches.find(fp => 
              (fp.team || '').toUpperCase() === (espn.team || '').toUpperCase()
            );
            if (teamMatch) {
              fpMatch = teamMatch;
              matchedFpIds.add(fpMatch.fpPlayerId);
              exactMatched++;
            } else {
              // Use first available if no team match
              fpMatch = availableMatches[0];
              matchedFpIds.add(fpMatch.fpPlayerId);
              matchType = 'fuzzy';
              matchNote = `Team mismatch: ESPN(${espn.team}) vs FP(${fpMatch.team}). ${availableMatches.length} candidates.`;
              fuzzyMatched++;
            }
          }
        }
        
        // Pass 3: Try cross-position match (same name+team, different position)
        if (!fpMatch) {
          const crossPosKey = createNameTeamKey(espn.firstName, espn.lastName, espn.team);
          const crossPosMatches = fpCrossPosMap.get(crossPosKey) || [];
          
          // Filter to unmatched FP players
          const availableCrossPos = crossPosMatches.filter(fp => !matchedFpIds.has(fp.fpPlayerId));
          
          if (availableCrossPos.length === 1) {
            fpMatch = availableCrossPos[0];
            matchedFpIds.add(fpMatch.fpPlayerId);
            matchType = 'cross_position';
            matchNote = `Position mismatch: ESPN(${espn.position}) vs FP(${fpMatch.position})`;
            crossPosMatched++;
          } else if (availableCrossPos.length > 1) {
            // Multiple matches - pick the most likely (prefer fantasy-relevant positions)
            const positionPriority = ['WR', 'RB', 'QB', 'TE', 'K', 'DEF'];
            const sorted = [...availableCrossPos].sort((a, b) => {
              const aIdx = positionPriority.indexOf(a.position || '');
              const bIdx = positionPriority.indexOf(b.position || '');
              return (aIdx === -1 ? 99 : aIdx) - (bIdx === -1 ? 99 : bIdx);
            });
            fpMatch = sorted[0];
            matchedFpIds.add(fpMatch.fpPlayerId);
            matchType = 'cross_position';
            matchNote = `Position mismatch: ESPN(${espn.position}) vs FP(${fpMatch.position}). ${availableCrossPos.length} candidates.`;
            crossPosMatched++;
          }
        }
        
        if (!fpMatch) {
          matchType = 'unmatched';
          unmatched++;
        }
      }

      const canonicalKey = createCanonicalKey(espn.firstName, espn.lastName, espn.team, espn.position);
      
      crosswalkRecords.push({
        canonicalKey,
        sport,
        season,
        espnPlayerId: espn.espnPlayerId,
        fpPlayerId: fpMatch?.fpPlayerId || null,
        matchConfidence: matchType === 'alias' || matchType === 'cross_position' ? 'fuzzy' : matchType,
        manualOverride: false,
        notes: matchType === 'unmatched' 
          ? `No FP match found for ${espn.fullName} (${espn.team} ${espn.position})`
          : matchNote
      });
    }

    // Pass 2: Add unmatched FP players (FP-only)
    let fpOnly = 0;
    for (const fp of fpPlayers) {
      if (!matchedFpIds.has(fp.fpPlayerId)) {
        const canonicalKey = createCanonicalKey(fp.firstName, fp.lastName, fp.team, fp.position);
        crosswalkRecords.push({
          canonicalKey,
          sport,
          season,
          espnPlayerId: null,
          fpPlayerId: fp.fpPlayerId,
          matchConfidence: 'unmatched',
          manualOverride: false,
          notes: `FP-only: No ESPN match for ${fp.fullName} (${fp.team} ${fp.position})`
        });
        fpOnly++;
        unmatched++;
      }
    }

    const totalMatched = exactMatched + fuzzyMatched + aliasMatched + crossPosMatched;
    console.log(`Crosswalk matching: ${exactMatched} exact, ${aliasMatched} alias, ${crossPosMatched} cross-position, ${fuzzyMatched} team-mismatch, ${unmatched} unmatched (${fpOnly} FP-only)`);
    console.log(`Processing ${crosswalkRecords.length} crosswalk records...`);
    
    const result = await storage.bulkUpsertPlayerCrosswalk(crosswalkRecords);

    console.log(`✓ Crosswalk build complete: ${result.inserted} inserted, ${result.updated} updated`);
    return { 
      success: true, 
      recordCount: result.inserted + result.updated,
      matched: totalMatched,
      unmatched,
      teamMismatches: fuzzyMatched,
      aliasMatched,
      crossPosMatched
    };
  } catch (error: any) {
    console.error('Error building crosswalk:', error);
    return { success: false, recordCount: 0, matched: 0, unmatched: 0, teamMismatches: 0, aliasMatched: 0, crossPosMatched: 0, error: error.message };
  }
}

export async function refreshPlayersMaster(): Promise<{ success: boolean; rowCount: number; error?: string }> {
  try {
    console.log('Refreshing players_master materialized view...');
    const result = await storage.refreshPlayersMasterView();
    
    if (result.success) {
      console.log(`✓ Players master view refreshed with ${result.rowCount} rows`);
    }
    
    return result;
  } catch (error: any) {
    console.error('Error refreshing players master view:', error);
    return { success: false, rowCount: 0, error: error.message };
  }
}

export async function clearUnifiedPlayerData(): Promise<{ success: boolean; error?: string }> {
  try {
    console.log('Clearing unified player data tables...');
    
    const { espnPlayerData, fpPlayerData, defenseVsPositionStats, playerCrosswalk } = await import("@shared/schema");
    const { sql } = await import("drizzle-orm");
    
    // Clear tables in order (crosswalk first due to potential FK references)
    await db.delete(playerCrosswalk);
    await db.delete(defenseVsPositionStats);
    await db.delete(fpPlayerData);
    await db.delete(espnPlayerData);
    
    // Refresh the materialized view (will be empty)
    await db.execute(sql`REFRESH MATERIALIZED VIEW players_master`);
    
    console.log('✓ Unified player data tables cleared');
    return { success: true };
  } catch (error: any) {
    console.error('Error clearing unified player data:', error);
    return { success: false, error: error.message };
  }
}

export async function runAllUnifiedPlayerJobs(
  sport: string = 'NFL',
  season: number = 2025,
  scoringType: string = 'PPR'
): Promise<{ success: boolean; results: Record<string, any>; error?: string }> {
  const results: Record<string, any> = {};
  
  try {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`Running all unified player data jobs for ${sport} ${season}`);
    console.log(`${'='.repeat(50)}\n`);

    console.log('\n[1/5] Refreshing ESPN Players...');
    results.espnPlayers = await refreshEspnPlayers(sport, season);
    if (!results.espnPlayers.success) {
      throw new Error(`ESPN Players refresh failed: ${results.espnPlayers.error}`);
    }

    console.log('\n[2/5] Refreshing FP Players...');
    results.fpPlayers = await refreshFpPlayers(sport, season);
    if (!results.fpPlayers.success) {
      console.warn('FP Players refresh warning:', results.fpPlayers.error);
    }

    console.log('\n[3/5] Refreshing Defense Stats...');
    results.defenseStats = await refreshDefenseStats(sport, season, scoringType);
    if (!results.defenseStats.success) {
      console.warn('Defense stats refresh warning:', results.defenseStats.error);
    }

    console.log('\n[4/5] Building Crosswalk...');
    results.crosswalk = await buildCrosswalk(sport, season);
    if (!results.crosswalk.success) {
      console.warn('Crosswalk build warning:', results.crosswalk.error);
    }

    console.log('\n[5/5] Refreshing Players Master View...');
    results.playersMaster = await refreshPlayersMaster();
    if (!results.playersMaster.success) {
      console.warn('Players master refresh warning:', results.playersMaster.error);
    }

    console.log(`\n${'='.repeat(50)}`);
    console.log('All unified player data jobs completed');
    console.log(`${'='.repeat(50)}\n`);

    return { success: true, results };
  } catch (error: any) {
    console.error('Error running unified player jobs:', error);
    return { success: false, results, error: error.message };
  }
}
