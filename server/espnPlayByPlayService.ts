import { db } from "./db";
import { nflTeamStats } from "@shared/schema";
import { eq, and, isNull } from "drizzle-orm";

/**
 * ESPN Play-by-Play Service
 * Fetches play-by-play data from ESPN API and calculates red zone statistics
 * Red zone is defined as plays starting inside the opponent's 20-yard line
 */

const ESPN_SITE_API = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';
const ESPN_CORE_API = 'https://sports.core.api.espn.com/v2/sports/football/leagues/nfl';

interface RedZoneStats {
  teamId: string;
  teamAbbreviation: string;
  teamName: string;
  attempts: number;
  touchdowns: number;
  fieldGoals: number;
  tdRate: string | null;
}

interface RefreshResult {
  success: boolean;
  recordCount: number;
  error?: string;
}

/**
 * Get all NFL games for a specific season and week
 */
async function getGamesForWeek(season: number, week: number): Promise<any[]> {
  try {
    const url = `${ESPN_SITE_API}/scoreboard?seasontype=2&week=${week}&dates=${season}`;
    console.log(`Fetching games for ${season} week ${week}: ${url}`);
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`ESPN API error: ${response.statusText}`);
    }

    const data: any = await response.json();
    
    if (!data.events || data.events.length === 0) {
      console.log(`No games found for week ${week}`);
      return [];
    }

    console.log(`Found ${data.events.length} games for week ${week}`);
    return data.events;
  } catch (error) {
    console.error('Error fetching games:', error);
    throw error;
  }
}

/**
 * Get play-by-play data for a specific game
 */
async function getPlayByPlay(eventId: string): Promise<any[]> {
  try {
    const url = `${ESPN_CORE_API}/events/${eventId}/competitions/${eventId}/plays?limit=500`;
    console.log(`Fetching plays for game ${eventId}`);
    
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Failed to fetch plays for game ${eventId}: ${response.statusText}`);
      return [];
    }

    const data: any = await response.json();
    
    if (!data.items || data.items.length === 0) {
      console.log(`No plays found for game ${eventId}`);
      return [];
    }

    // Fetch detailed play data for each play reference
    const plays = [];
    for (const item of data.items) {
      try {
        const playResponse = await fetch(item.$ref);
        if (playResponse.ok) {
          const play = await playResponse.json();
          plays.push(play);
        }
      } catch (err) {
        console.error(`Error fetching play ${item.id}:`, err);
      }
    }

    console.log(`Fetched ${plays.length} plays for game ${eventId}`);
    return plays;
  } catch (error) {
    console.error(`Error fetching play-by-play for game ${eventId}:`, error);
    return [];
  }
}

/**
 * Determine if a play is in the red zone (inside 20 yard line)
 */
function isRedZonePlay(play: any): boolean {
  return play.start?.yardsToEndzone !== undefined && play.start.yardsToEndzone <= 20 && play.start.yardsToEndzone > 0;
}

/**
 * Determine if a play resulted in a touchdown
 */
function isTouchdown(play: any): boolean {
  if (!play.scoringPlay || !play.type?.text) return false;
  
  const type = play.type.text.toLowerCase();
  return (
    type.includes('touchdown') ||
    type.includes('td') ||
    (play.scoringPlay && (play.scoreValue === 6 || play.scoreValue === 7))
  );
}

/**
 * Determine if a play was a field goal
 */
function isFieldGoal(play: any): boolean {
  if (!play.type?.text) return false;
  
  const type = play.type.text.toLowerCase();
  return (
    type.includes('field goal') && 
    !type.includes('missed') &&
    !type.includes('blocked')
  );
}

/**
 * Get the offensive team ID from a play
 */
function getOffenseTeamId(play: any): string | null {
  const offenseParticipant = play.teamParticipants?.find((tp: any) => tp.type === 'offense');
  return offenseParticipant?.id || play.team?.id || null;
}

/**
 * Get the defensive team ID from a play
 */
function getDefenseTeamId(play: any): string | null {
  const defenseParticipant = play.teamParticipants?.find((tp: any) => tp.type === 'defense');
  return defenseParticipant?.id || null;
}

/**
 * Calculate red zone statistics from play-by-play data
 */
function calculateRedZoneStats(plays: any[], teamMap: Map<string, { abbreviation: string; name: string }>): Map<string, RedZoneStats> {
  const statsMap = new Map<string, RedZoneStats>();

  // Initialize stats for all teams
  teamMap.forEach((teamInfo, teamId) => {
    statsMap.set(teamId, {
      teamId,
      teamAbbreviation: teamInfo.abbreviation,
      teamName: teamInfo.name,
      attempts: 0,
      touchdowns: 0,
      fieldGoals: 0,
      tdRate: null
    });
  });

  // Track red zone drives (group consecutive red zone plays)
  let currentDrive: { teamId: string | null; hasAttempt: boolean; hasTd: boolean; hasFg: boolean } = {
    teamId: null,
    hasAttempt: false,
    hasTd: false,
    hasFg: false
  };

  for (const play of plays) {
    const offenseTeamId = getOffenseTeamId(play);
    if (!offenseTeamId) continue;

    // Check if this is a red zone play
    if (isRedZonePlay(play)) {
      // If this is a new drive (different team or first red zone play)
      if (currentDrive.teamId !== offenseTeamId) {
        // Finalize previous drive
        if (currentDrive.teamId && currentDrive.hasAttempt) {
          const stats = statsMap.get(currentDrive.teamId);
          if (stats) {
            stats.attempts++;
            if (currentDrive.hasTd) stats.touchdowns++;
            if (currentDrive.hasFg) stats.fieldGoals++;
          }
        }
        
        // Start new drive
        currentDrive = {
          teamId: offenseTeamId,
          hasAttempt: true,
          hasTd: false,
          hasFg: false
        };
      } else {
        // Same drive, mark as having an attempt
        currentDrive.hasAttempt = true;
      }

      // Check outcome of this play
      if (isTouchdown(play)) {
        currentDrive.hasTd = true;
      } else if (isFieldGoal(play)) {
        currentDrive.hasFg = true;
      }
    } else {
      // Not a red zone play - if we were tracking a drive, finalize it
      if (currentDrive.teamId && currentDrive.hasAttempt) {
        const stats = statsMap.get(currentDrive.teamId);
        if (stats) {
          stats.attempts++;
          if (currentDrive.hasTd) stats.touchdowns++;
          if (currentDrive.hasFg) stats.fieldGoals++;
        }
        currentDrive = { teamId: null, hasAttempt: false, hasTd: false, hasFg: false };
      }
    }
  }

  // Finalize last drive if needed
  if (currentDrive.teamId && currentDrive.hasAttempt) {
    const stats = statsMap.get(currentDrive.teamId);
    if (stats) {
      stats.attempts++;
      if (currentDrive.hasTd) stats.touchdowns++;
      if (currentDrive.hasFg) stats.fieldGoals++;
    }
  }

  // Calculate TD rates
  statsMap.forEach(stats => {
    if (stats.attempts > 0) {
      stats.tdRate = ((stats.touchdowns / stats.attempts) * 100).toFixed(2);
    }
  });

  return statsMap;
}

/**
 * Get team information from ESPN API
 */
async function getTeamInfo(teamId: string): Promise<{ abbreviation: string; name: string } | null> {
  try {
    const url = `${ESPN_SITE_API}/teams/${teamId}`;
    const response = await fetch(url);
    
    if (!response.ok) return null;
    
    const data: any = await response.json();
    return {
      abbreviation: data.team?.abbreviation || '',
      name: data.team?.displayName || data.team?.name || ''
    };
  } catch (error) {
    console.error(`Error fetching team info for ${teamId}:`, error);
    return null;
  }
}

/**
 * Refresh red zone statistics for a specific week
 */
export async function refreshRedZoneStats(season: number, week: number): Promise<RefreshResult> {
  try {
    console.log(`Calculating red zone stats for ${season} week ${week}...`);
    
    // Get all games for this week
    const games = await getGamesForWeek(season, week);
    
    if (games.length === 0) {
      return { success: false, recordCount: 0, error: 'No games found for this week' };
    }

    // Map to store all plays and team info
    const allPlays: any[] = [];
    const teamMap = new Map<string, { abbreviation: string; name: string }>();

    // Fetch play-by-play for each game
    for (const game of games) {
      const eventId = game.id;
      const plays = await getPlayByPlay(eventId);
      allPlays.push(...plays);

      // Extract team info from the game
      if (game.competitions?.[0]?.competitors) {
        for (const competitor of game.competitions[0].competitors) {
          const teamId = competitor.team?.id || competitor.id;
          if (teamId && !teamMap.has(teamId)) {
            const teamInfo = await getTeamInfo(teamId);
            if (teamInfo) {
              teamMap.set(teamId, teamInfo);
            }
          }
        }
      }
    }

    console.log(`Collected ${allPlays.length} total plays from ${games.length} games`);
    console.log(`Found ${teamMap.size} teams`);

    // Calculate red zone stats
    const redZoneStats = calculateRedZoneStats(allPlays, teamMap);

    // Update database with red zone stats
    let updatedCount = 0;
    
    for (const [teamId, stats] of redZoneStats) {
      try {
        // Check if record exists
        const existing = await db.query.nflTeamStats.findFirst({
          where: and(
            eq(nflTeamStats.season, season),
            eq(nflTeamStats.week, week),
            eq(nflTeamStats.teamAbbreviation, stats.teamAbbreviation)
          )
        });

        if (existing) {
          // Update existing record with red zone stats
          await db.update(nflTeamStats)
            .set({
              redZoneAttempts: stats.attempts,
              redZoneTouchdowns: stats.touchdowns,
              redZoneFieldGoals: stats.fieldGoals,
              redZoneTdRate: stats.tdRate,
              updatedAt: new Date()
            })
            .where(eq(nflTeamStats.id, existing.id));
          updatedCount++;
        } else {
          // Insert new record with just red zone stats
          await db.insert(nflTeamStats).values({
            season,
            week,
            teamAbbreviation: stats.teamAbbreviation,
            teamName: stats.teamName,
            redZoneAttempts: stats.attempts,
            redZoneTouchdowns: stats.touchdowns,
            redZoneFieldGoals: stats.fieldGoals,
            redZoneTdRate: stats.tdRate
          });
          updatedCount++;
        }

        console.log(`✓ ${stats.teamAbbreviation}: ${stats.attempts} RZ attempts, ${stats.touchdowns} TDs, ${stats.fieldGoals} FGs (${stats.tdRate}% TD rate)`);
      } catch (err) {
        console.error(`Failed to update red zone stats for ${stats.teamAbbreviation}:`, err);
      }
    }

    console.log(`✓ Successfully updated ${updatedCount} team red zone stats`);
    return { success: true, recordCount: updatedCount };
  } catch (error: any) {
    console.error('Error refreshing red zone stats:', error);
    return { success: false, recordCount: 0, error: error.message };
  }
}
