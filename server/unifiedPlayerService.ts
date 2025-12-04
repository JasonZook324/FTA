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

    const url = `${ESPN_BASE_URL}/ffl/seasons/${season}/segments/0/leaguedefaults/1?view=kona_player_info`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'X-Fantasy-Filter': JSON.stringify({
          "players": {
            "filterSlotIds": {"value": [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23]},
            "limit": 2000,
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

    if (players.length === 0) {
      return { success: false, recordCount: 0, error: 'No players returned from ESPN API' };
    }

    const playerRecords: InsertEspnPlayerData[] = [];

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
      if (!team) continue;

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

    console.log(`Processing ${playerRecords.length} ESPN players...`);
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

export async function refreshFpPlayers(
  sport: string = 'NFL',
  season: number = 2024
): Promise<{ success: boolean; recordCount: number; error?: string }> {
  try {
    console.log(`Refreshing FP ${sport} players for ${season}...`);

    const { fantasyProsPlayers } = await import("@shared/schema");
    const { eq, and } = await import("drizzle-orm");

    const existingPlayers = await db
      .select()
      .from(fantasyProsPlayers)
      .where(and(
        eq(fantasyProsPlayers.sport, sport),
        eq(fantasyProsPlayers.season, season)
      ));

    if (existingPlayers.length === 0) {
      return { 
        success: false, 
        recordCount: 0, 
        error: `No FantasyPros players found for ${sport} ${season}. Run "Fantasy Pros Data → Refresh All" first.` 
      };
    }

    const playerRecords: InsertFpPlayerData[] = [];

    // Valid NFL teams for filtering
    const validTeams = new Set([
      'ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE',
      'DAL', 'DEN', 'DET', 'GB', 'HOU', 'IND', 'JAX', 'KC',
      'LAC', 'LAR', 'LV', 'MIA', 'MIN', 'NE', 'NO', 'NYG',
      'NYJ', 'PHI', 'PIT', 'SEA', 'SF', 'TB', 'TEN', 'WAS'
    ]);

    for (const player of existingPlayers) {
      // Skip players not on one of the 32 NFL teams (free agents)
      const team = player.team?.toUpperCase() || null;
      if (!team || !validTeams.has(team)) continue;

      const nameParts = (player.name || '').split(' ');
      const firstName = nameParts[0] || null;
      const lastName = nameParts.slice(1).join(' ') || null;

      playerRecords.push({
        fpPlayerId: player.playerId,
        sport: player.sport,
        season: player.season,
        firstName,
        lastName,
        fullName: player.name,
        team,
        position: player.position || null,
        jerseyNumber: player.jerseyNumber || null,
        status: player.status || null,
        injuryStatus: null
      });
    }

    console.log(`Processing ${playerRecords.length} FP players...`);
    const result = await storage.bulkUpsertFpPlayerData(playerRecords);

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
    console.log(`Calculating defense vs position stats for ${sport} ${season} (${scoringType})...`);

    const { fantasyProsProjections, nflMatchups } = await import("@shared/schema");
    const { eq, and, isNotNull } = await import("drizzle-orm");

    const projections = await db
      .select()
      .from(fantasyProsProjections)
      .where(and(
        eq(fantasyProsProjections.sport, sport),
        eq(fantasyProsProjections.season, season),
        eq(fantasyProsProjections.scoringType, scoringType),
        isNotNull(fantasyProsProjections.opponent)
      ));

    if (projections.length === 0) {
      return { 
        success: false, 
        recordCount: 0, 
        error: `No ${scoringType} projections found for ${sport} ${season}. Run "Fantasy Pros Data → Refresh All" with ${scoringType} scoring type first.` 
      };
    }

    const defenseStats: Map<string, { totalPoints: number; games: number }> = new Map();

    for (const projection of projections) {
      const opponent = projection.opponent;
      const position = projection.position;
      const points = parseFloat(projection.projectedPoints || '0');

      if (!opponent || !position || !POSITIONS_FOR_OPRK.includes(position)) continue;

      const defenseTeam = opponent.replace('@', '').replace('vs ', '').trim().toUpperCase();
      if (!ALL_NFL_TEAMS.includes(defenseTeam)) continue;

      const key = `${defenseTeam}-${position}`;
      const current = defenseStats.get(key) || { totalPoints: 0, games: 0 };
      current.totalPoints += points;
      current.games += 1;
      defenseStats.set(key, current);
    }

    const statsRecords: InsertDefenseVsPositionStats[] = [];
    
    for (const position of POSITIONS_FOR_OPRK) {
      const positionStats: Array<{ team: string; avgPoints: number; totalPoints: number; games: number }> = [];
      
      for (const team of ALL_NFL_TEAMS) {
        const key = `${team}-${position}`;
        const stats = defenseStats.get(key);
        
        if (stats && stats.games > 0) {
          positionStats.push({
            team,
            avgPoints: stats.totalPoints / stats.games,
            totalPoints: stats.totalPoints,
            games: stats.games
          });
        } else {
          positionStats.push({
            team,
            avgPoints: 0,
            totalPoints: 0,
            games: 0
          });
        }
      }

      positionStats.sort((a, b) => a.avgPoints - b.avgPoints);

      positionStats.forEach((stats, index) => {
        statsRecords.push({
          sport,
          season,
          week: null,
          defenseTeam: stats.team,
          position,
          gamesPlayed: stats.games,
          totalPointsAllowed: stats.totalPoints,
          avgPointsAllowed: stats.avgPoints,
          rank: index + 1,
          scoringType
        });
      });
    }

    console.log(`Processing ${statsRecords.length} defense vs position stats...`);
    const result = await storage.bulkUpsertDefenseVsPositionStats(statsRecords);

    console.log(`✓ Defense stats refresh complete: ${result.inserted} inserted, ${result.updated} updated`);
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
