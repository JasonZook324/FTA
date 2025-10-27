import { db } from "./db";
import { nflTeamStats } from "@shared/schema";
import { eq, and, isNull } from "drizzle-orm";

/**
 * ESPN NFL Stats API Service
 * Fetches team statistics from ESPN's unofficial NFL API
 * No authentication required
 */

const ESPN_BASE_URL = 'https://sports.core.api.espn.com/v2/sports/football/leagues/nfl';
const ESPN_SITE_API = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';

interface RefreshResult {
  success: boolean;
  recordCount: number;
  error?: string;
}

interface ESPNTeamStatistic {
  name: string;
  displayName: string;
  abbreviation: string;
  value: number;
  displayValue: string;
}

interface ESPNTeamStats {
  team: {
    id: string;
    abbreviation: string;
    displayName: string;
  };
  splits?: {
    categories?: Array<{
      name: string;
      displayName: string;
      stats: ESPNTeamStatistic[];
    }>;
  };
}

/**
 * Get all NFL teams with their IDs and abbreviations
 */
export async function getAllNFLTeams(): Promise<Array<{ id: number; abbreviation: string; name: string }>> {
  try {
    const response = await fetch(`${ESPN_SITE_API}/teams?limit=32`);
    
    if (!response.ok) {
      throw new Error(`ESPN API error: ${response.statusText}`);
    }

    const data: any = await response.json();
    
    if (!data.sports?.[0]?.leagues?.[0]?.teams) {
      throw new Error('Unexpected ESPN teams API response structure');
    }

    const teams = data.sports[0].leagues[0].teams.map((teamWrapper: any) => {
      const team = teamWrapper.team;
      return {
        id: parseInt(team.id),
        abbreviation: team.abbreviation,
        name: team.displayName || team.name
      };
    });

    console.log(`Found ${teams.length} NFL teams`);
    return teams;
  } catch (error) {
    console.error('Error fetching NFL teams:', error);
    throw error;
  }
}

/**
 * Get team statistics for a specific season and type
 */
export async function getTeamStatistics(
  teamId: number,
  season: number,
  seasonType: number = 2 // 1=pre, 2=regular, 3=post
): Promise<ESPNTeamStats | null> {
  try {
    const url = `${ESPN_BASE_URL}/seasons/${season}/types/${seasonType}/teams/${teamId}/statistics`;
    console.log(`Fetching stats: ${url}`);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error(`Failed to fetch stats for team ${teamId}: ${response.statusText}`);
      return null;
    }

    const data: any = await response.json();
    return data as ESPNTeamStats;
  } catch (error) {
    console.error(`Error fetching stats for team ${teamId}:`, error);
    return null;
  }
}

/**
 * Extract specific stat value from ESPN statistics
 */
function getStatValue(stats: ESPNTeamStatistic[], statName: string): number | null {
  const stat = stats.find(s => s.name === statName || s.abbreviation === statName);
  return stat ? stat.value : null;
}

/**
 * Calculate red zone TD rate
 */
function calculateRedZoneTdRate(attempts: number | null, touchdowns: number | null): string | null {
  if (!attempts || attempts === 0 || touchdowns === null) return null;
  return ((touchdowns / attempts) * 100).toFixed(2);
}

/**
 * Parse and transform ESPN stats to our schema format
 */
export async function parseTeamStats(
  teamId: number,
  teamAbbreviation: string,
  teamName: string,
  season: number,
  week: number | null = null,
  seasonType: number = 2
): Promise<any | null> {
  try {
    const espnStats = await getTeamStatistics(teamId, season, seasonType);
    
    if (!espnStats || !espnStats.splits?.categories) {
      console.log(`No statistics available for team ${teamId}`);
      return null;
    }

    const categories = espnStats.splits.categories;

    // Find relevant stat categories
    const offenseStats = categories.find(c => c.name === 'offense' || c.name === 'offensive')?.stats || [];
    const defenseStats = categories.find(c => c.name === 'defense' || c.name === 'defensive')?.stats || [];
    const kickingStats = categories.find(c => c.name === 'kicking')?.stats || [];
    const generalStats = categories.find(c => c.name === 'general')?.stats || [];

    // Extract available stats (use ?? to preserve zero values)
    const gamesPlayed = getStatValue(generalStats, 'gamesPlayed') ?? getStatValue(generalStats, 'GP');
    
    // Red Zone stats (may not be available in ESPN API)
    const redZoneAttempts = getStatValue(offenseStats, 'redZoneAttempts') ?? getStatValue(offenseStats, 'RZA');
    const redZoneTouchdowns = getStatValue(offenseStats, 'redZoneTDs') ?? getStatValue(offenseStats, 'RZTD');
    const redZoneFieldGoals = getStatValue(offenseStats, 'redZoneFGs');
    
    // Opponent red zone stats
    const oppRedZoneAttempts = getStatValue(defenseStats, 'redZoneAttempts') ?? getStatValue(defenseStats, 'oppRZA');
    const oppRedZoneTouchdowns = getStatValue(defenseStats, 'redZoneTDs') ?? getStatValue(defenseStats, 'oppRZTD');
    const oppRedZoneFieldGoals = getStatValue(defenseStats, 'redZoneFGs');
    
    // Kicking stats
    const fieldGoalAttempts = getStatValue(kickingStats, 'fieldGoalAttempts') ?? getStatValue(kickingStats, 'FGA');
    const fieldGoalsMade = getStatValue(kickingStats, 'fieldGoalsMade') ?? getStatValue(kickingStats, 'FGM');
    const fieldGoalPercentage = fieldGoalAttempts !== null && fieldGoalAttempts > 0 && fieldGoalsMade !== null && fieldGoalsMade >= 0
      ? ((fieldGoalsMade / fieldGoalAttempts) * 100).toFixed(2)
      : null;
    
    // General stats
    const pointsScored = getStatValue(offenseStats, 'points') ?? getStatValue(generalStats, 'points') ?? getStatValue(generalStats, 'PF');
    const pointsAllowed = getStatValue(defenseStats, 'points') ?? getStatValue(generalStats, 'PA');

    // Calculate TD rates
    const redZoneTdRate = calculateRedZoneTdRate(redZoneAttempts, redZoneTouchdowns);
    const oppRedZoneTdRate = calculateRedZoneTdRate(oppRedZoneAttempts, oppRedZoneTouchdowns);

    return {
      season,
      week,
      teamAbbreviation,
      teamName,
      gamesPlayed,
      redZoneAttempts,
      redZoneTouchdowns,
      redZoneFieldGoals,
      redZoneTdRate,
      oppRedZoneAttempts,
      oppRedZoneTouchdowns,
      oppRedZoneFieldGoals,
      oppRedZoneTdRate,
      fieldGoalAttempts,
      fieldGoalsMade,
      fieldGoalPercentage,
      pointsScored,
      pointsAllowed,
    };
  } catch (error) {
    console.error(`Error parsing stats for team ${teamId}:`, error);
    return null;
  }
}

/**
 * Fetch and parse all NFL team stats for a given season
 */
export async function fetchAllTeamStats(
  season: number = 2025,
  week: number | null = null,
  seasonType: number = 2
): Promise<any[]> {
  try {
    console.log(`Fetching NFL team stats for ${season} season, week ${week || 'season totals'}...`);
    
    // Get all teams
    const teams = await getAllNFLTeams();
    
    // Fetch stats for each team
    const statsPromises = teams.map(team => 
      parseTeamStats(team.id, team.abbreviation, team.name, season, week, seasonType)
    );
    
    const allStats = await Promise.all(statsPromises);
    
    // Filter out null results (teams without stats)
    const validStats = allStats.filter(stat => stat !== null);
    
    console.log(`Successfully fetched stats for ${validStats.length}/${teams.length} teams`);
    
    return validStats;
  } catch (error) {
    console.error('Error fetching all team stats:', error);
    throw error;
  }
}

/**
 * Refresh NFL team stats and save to database
 */
export async function refreshNflTeamStats(
  season: number,
  week: number | null = null,
  seasonType: number = 2
): Promise<RefreshResult> {
  try {
    console.log(`Refreshing NFL team stats for ${season} season, week ${week || 'season totals'}...`);
    
    // Fetch all team stats from ESPN API
    const teamStats = await fetchAllTeamStats(season, week, seasonType);
    
    if (teamStats.length === 0) {
      console.warn('No team stats found from ESPN API');
      return { success: false, recordCount: 0, error: 'No stats available' };
    }
    
    // Delete existing stats for this season/week combination
    if (week !== null) {
      await db.delete(nflTeamStats)
        .where(and(
          eq(nflTeamStats.season, season),
          eq(nflTeamStats.week, week)
        ));
    } else {
      // For season totals, delete records where week IS NULL
      await db.delete(nflTeamStats)
        .where(and(
          eq(nflTeamStats.season, season),
          isNull(nflTeamStats.week)
        ));
    }
    
    let insertedCount = 0;
    
    // Insert each team's stats
    for (const stats of teamStats) {
      try {
        await db.insert(nflTeamStats).values(stats);
        insertedCount++;
      } catch (err) {
        console.error(`Failed to insert stats for ${stats.teamAbbreviation}:`, err);
      }
    }
    
    console.log(`✓ Successfully refreshed ${insertedCount} NFL team stats records`);
    return { success: true, recordCount: insertedCount };
  } catch (error: any) {
    console.error('Error refreshing NFL team stats:', error);
    return { success: false, recordCount: 0, error: error.message };
  }
}
