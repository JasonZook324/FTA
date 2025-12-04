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

export async function refreshEspnPlayers(
  sport: string = 'NFL',
  season: number = 2024
): Promise<{ success: boolean; recordCount: number; error?: string }> {
  try {
    console.log(`Refreshing ESPN ${sport} players for ${season}...`);

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

      // Skip players not on one of the 32 NFL teams (free agents)
      if (!team) {
        skippedFreeAgents++;
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
        injuryType: player.injury?.type || null,
        percentOwned: ownership.percentOwned ?? null,
        percentStarted: ownership.percentStarted ?? null,
        averagePoints: currentStats.appliedAverage ?? null,
        totalPoints: currentStats.appliedTotal ?? null
      });
    }

    console.log(`Filtered to ${playerRecords.length} rostered players (skipped ${skippedFreeAgents} free agents)`);
    
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

export async function refreshFpPlayers(
  sport: string = 'NFL',
  season: number = 2024
): Promise<{ success: boolean; recordCount: number; error?: string }> {
  try {
    console.log(`Refreshing FP ${sport} players for ${season} from FantasyPros API...`);

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
    const fantasyPositions = new Set(['QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'DST']);

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

      // Get position and skip non-fantasy positions (IDP players)
      const position = (p.player_position_id || p.position_id || p.position || '').toUpperCase();
      if (!position || !fantasyPositions.has(position)) {
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
        jerseyNumber: p.jersey || p.jersey_number || null,
        status: null,
        injuryStatus: null
      });
    }

    console.log(`Filtered to ${playerRecords.length} fantasy-relevant players (skipped ${skippedNonFantasy} IDP/non-fantasy positions)`);
    const result = await storage.bulkUpsertFpPlayerData(playerRecords);
    
    // After upserting, remove FP players that don't have an ESPN match
    // This ensures FP data only includes players that ESPN considers fantasy-relevant
    const deleteResult = await storage.deleteFpPlayersWithoutEspnMatch();
    console.log(`Removed ${deleteResult.deleted} FP players without ESPN match`);

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
  season: number = 2024,
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

function normalizeForCanonicalKey(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/\s+/g, '');
}

function createCanonicalKey(firstName: string | null, lastName: string | null, team: string | null, position: string | null): string {
  const parts = [
    normalizeForCanonicalKey(firstName || ''),
    normalizeForCanonicalKey(lastName || ''),
    normalizeForCanonicalKey(team || ''),
    normalizeForCanonicalKey(position || '')
  ];
  return parts.join('');
}

export async function buildCrosswalk(
  sport: string = 'NFL',
  season: number = 2024
): Promise<{ success: boolean; recordCount: number; matched: number; unmatched: number; error?: string }> {
  try {
    console.log(`Building player crosswalk for ${sport} ${season}...`);

    const espnPlayers = await storage.getEspnPlayerData(sport, season);
    const fpPlayers = await storage.getFpPlayerData(sport, season);

    if (espnPlayers.length === 0) {
      return { 
        success: false, 
        recordCount: 0, 
        matched: 0, 
        unmatched: 0, 
        error: `No ESPN players found for ${sport} ${season}. Run "Refresh ESPN Players" first.` 
      };
    }

    if (fpPlayers.length === 0) {
      return { 
        success: false, 
        recordCount: 0, 
        matched: 0, 
        unmatched: 0, 
        error: `No FP players found for ${sport} ${season}. Run "Refresh FP Players" first.` 
      };
    }

    const fpPlayerMap = new Map<string, typeof fpPlayers[0]>();
    for (const fp of fpPlayers) {
      const key = createCanonicalKey(fp.firstName, fp.lastName, fp.team, fp.position);
      fpPlayerMap.set(key, fp);
    }

    const crosswalkRecords: InsertPlayerCrosswalk[] = [];
    let matched = 0;
    let unmatched = 0;

    for (const espn of espnPlayers) {
      const canonicalKey = createCanonicalKey(espn.firstName, espn.lastName, espn.team, espn.position);
      const fpMatch = fpPlayerMap.get(canonicalKey);

      if (fpMatch) {
        crosswalkRecords.push({
          canonicalKey,
          sport,
          season,
          espnPlayerId: espn.espnPlayerId,
          fpPlayerId: fpMatch.fpPlayerId,
          matchConfidence: 'exact',
          manualOverride: false,
          notes: null
        });
        matched++;
      } else {
        crosswalkRecords.push({
          canonicalKey,
          sport,
          season,
          espnPlayerId: espn.espnPlayerId,
          fpPlayerId: null,
          matchConfidence: 'unmatched',
          manualOverride: false,
          notes: `No FP match found for ${espn.fullName} (${espn.team} ${espn.position})`
        });
        unmatched++;
      }
    }

    for (const fp of fpPlayers) {
      const canonicalKey = createCanonicalKey(fp.firstName, fp.lastName, fp.team, fp.position);
      const alreadyMatched = crosswalkRecords.find(r => r.fpPlayerId === fp.fpPlayerId);
      
      if (!alreadyMatched) {
        crosswalkRecords.push({
          canonicalKey,
          sport,
          season,
          espnPlayerId: null,
          fpPlayerId: fp.fpPlayerId,
          matchConfidence: 'unmatched',
          manualOverride: false,
          notes: `No ESPN match found for ${fp.fullName} (${fp.team} ${fp.position})`
        });
        unmatched++;
      }
    }

    console.log(`Processing ${crosswalkRecords.length} crosswalk records (${matched} matched, ${unmatched} unmatched)...`);
    const result = await storage.bulkUpsertPlayerCrosswalk(crosswalkRecords);

    console.log(`✓ Crosswalk build complete: ${result.inserted} inserted, ${result.updated} updated`);
    return { 
      success: true, 
      recordCount: result.inserted + result.updated,
      matched,
      unmatched
    };
  } catch (error: any) {
    console.error('Error building crosswalk:', error);
    return { success: false, recordCount: 0, matched: 0, unmatched: 0, error: error.message };
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
  season: number = 2024,
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
