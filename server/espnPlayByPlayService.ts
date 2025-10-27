import { db } from "./db";
import { nflTeamStats } from "@shared/schema";
import { eq, and } from "drizzle-orm";

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
  // Offensive stats
  attempts: number;
  touchdowns: number;
  fieldGoals: number;
  tdRate: string | null;
  // Defensive stats (opponent red zone)
  oppAttempts: number;
  oppTouchdowns: number;
  oppFieldGoals: number;
  oppTdRate: string | null;
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
 * Uses pagination to fetch all plays efficiently
 */
async function getPlayByPlay(eventId: string): Promise<any[]> {
  try {
    const plays = [];
    let pageIndex = 1;
    let hasMore = true;
    
    while (hasMore) {
      const url = `${ESPN_CORE_API}/events/${eventId}/competitions/${eventId}/plays?limit=100&page=${pageIndex}`;
      console.log(`Fetching plays page ${pageIndex} for game ${eventId}`);
      
      const response = await fetch(url);
      if (!response.ok) {
        console.error(`Failed to fetch plays page ${pageIndex} for game ${eventId}: ${response.statusText}`);
        break;
      }

      const data: any = await response.json();
      
      if (!data.items || data.items.length === 0) {
        break;
      }

      // The items are already full play objects with all data (not just refs)
      // If they ARE refs, we need to fetch them in parallel
      if (data.items[0].$ref) {
        // Fetch all plays on this page in parallel
        const playPromises = data.items.map(async (item: any) => {
          try {
            const playResponse = await fetch(item.$ref);
            if (playResponse.ok) {
              return await playResponse.json();
            }
          } catch (err) {
            console.error(`Error fetching play ${item.id}:`, err);
          }
          return null;
        });
        
        const pagePlays = await Promise.all(playPromises);
        plays.push(...pagePlays.filter(p => p !== null));
      } else {
        // Items already contain full play data
        plays.push(...data.items);
      }

      // Check if there are more pages
      hasMore = data.pageIndex < data.pageCount;
      pageIndex++;
      
      // Safety limit to prevent infinite loops
      if (pageIndex > 20) {
        console.warn(`Exceeded maximum page limit for game ${eventId}`);
        break;
      }
    }

    console.log(`Fetched ${plays.length} total plays for game ${eventId}`);
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
 * Calculate red zone statistics from play-by-play data for a single game
 * This processes one game at a time to prevent drive state bleed between games
 */
function calculateRedZoneStatsForGame(plays: any[], teamMap: Map<string, { abbreviation: string; name: string }>): Map<string, { offense: { attempts: number; tds: number; fgs: number }; defense: { attempts: number; tds: number; fgs: number } }> {
  const gameStats = new Map<string, { offense: { attempts: number; tds: number; fgs: number }; defense: { attempts: number; tds: number; fgs: number } }>();

  // Initialize stats for all teams in this game
  teamMap.forEach((teamInfo, teamId) => {
    gameStats.set(teamId, {
      offense: { attempts: 0, tds: 0, fgs: 0 },
      defense: { attempts: 0, tds: 0, fgs: 0 }
    });
  });

  // Track red zone drives
  let currentDrive: { 
    offenseTeamId: string | null; 
    defenseTeamId: string | null;
    hasAttempt: boolean; 
    hasTd: boolean; 
    hasFg: boolean;
  } = {
    offenseTeamId: null,
    defenseTeamId: null,
    hasAttempt: false,
    hasTd: false,
    hasFg: false
  };

  for (const play of plays) {
    const offenseTeamId = getOffenseTeamId(play);
    const defenseTeamId = getDefenseTeamId(play);
    
    if (!offenseTeamId || !defenseTeamId) continue;

    // Check if this is a red zone play
    if (isRedZonePlay(play)) {
      // If this is a new drive (different team or first red zone play)
      if (currentDrive.offenseTeamId !== offenseTeamId) {
        // Finalize previous drive
        if (currentDrive.offenseTeamId && currentDrive.defenseTeamId && currentDrive.hasAttempt) {
          const offenseStats = gameStats.get(currentDrive.offenseTeamId);
          const defenseStats = gameStats.get(currentDrive.defenseTeamId);
          
          if (offenseStats) {
            offenseStats.offense.attempts++;
            if (currentDrive.hasTd) offenseStats.offense.tds++;
            if (currentDrive.hasFg) offenseStats.offense.fgs++;
          }
          
          if (defenseStats) {
            defenseStats.defense.attempts++;
            if (currentDrive.hasTd) defenseStats.defense.tds++;
            if (currentDrive.hasFg) defenseStats.defense.fgs++;
          }
        }
        
        // Start new drive
        currentDrive = {
          offenseTeamId,
          defenseTeamId,
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
      if (currentDrive.offenseTeamId && currentDrive.defenseTeamId && currentDrive.hasAttempt) {
        const offenseStats = gameStats.get(currentDrive.offenseTeamId);
        const defenseStats = gameStats.get(currentDrive.defenseTeamId);
        
        if (offenseStats) {
          offenseStats.offense.attempts++;
          if (currentDrive.hasTd) offenseStats.offense.tds++;
          if (currentDrive.hasFg) offenseStats.offense.fgs++;
        }
        
        if (defenseStats) {
          defenseStats.defense.attempts++;
          if (currentDrive.hasTd) defenseStats.defense.tds++;
          if (currentDrive.hasFg) defenseStats.defense.fgs++;
        }
        
        currentDrive = { 
          offenseTeamId: null, 
          defenseTeamId: null,
          hasAttempt: false, 
          hasTd: false, 
          hasFg: false 
        };
      }
    }
  }

  // Finalize last drive if needed
  if (currentDrive.offenseTeamId && currentDrive.defenseTeamId && currentDrive.hasAttempt) {
    const offenseStats = gameStats.get(currentDrive.offenseTeamId);
    const defenseStats = gameStats.get(currentDrive.defenseTeamId);
    
    if (offenseStats) {
      offenseStats.offense.attempts++;
      if (currentDrive.hasTd) offenseStats.offense.tds++;
      if (currentDrive.hasFg) offenseStats.offense.fgs++;
    }
    
    if (defenseStats) {
      defenseStats.defense.attempts++;
      if (currentDrive.hasTd) defenseStats.defense.tds++;
      if (currentDrive.hasFg) defenseStats.defense.fgs++;
    }
  }

  return gameStats;
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

    // Aggregated stats across all games
    const weekStats = new Map<string, RedZoneStats>();

    // Process each game separately to prevent drive state bleed
    for (const game of games) {
      const eventId = game.id;
      console.log(`Processing game ${eventId}...`);
      
      // Get team info for this game
      const gameTeamMap = new Map<string, { abbreviation: string; name: string }>();
      if (game.competitions?.[0]?.competitors) {
        for (const competitor of game.competitions[0].competitors) {
          const teamId = competitor.team?.id || competitor.id;
          if (teamId) {
            const teamInfo = await getTeamInfo(teamId);
            if (teamInfo) {
              gameTeamMap.set(teamId, teamInfo);
              
              // Initialize week stats if not present
              if (!weekStats.has(teamId)) {
                weekStats.set(teamId, {
                  teamId,
                  teamAbbreviation: teamInfo.abbreviation,
                  teamName: teamInfo.name,
                  attempts: 0,
                  touchdowns: 0,
                  fieldGoals: 0,
                  tdRate: null,
                  oppAttempts: 0,
                  oppTouchdowns: 0,
                  oppFieldGoals: 0,
                  oppTdRate: null
                });
              }
            }
          }
        }
      }
      
      // Fetch play-by-play for this game
      const plays = await getPlayByPlay(eventId);
      
      if (plays.length === 0) {
        console.log(`No plays found for game ${eventId}, skipping`);
        continue;
      }
      
      // Calculate stats for this game
      const gameStats = calculateRedZoneStatsForGame(plays, gameTeamMap);
      
      // Aggregate into week stats
      gameStats.forEach((stats, teamId) => {
        const teamWeekStats = weekStats.get(teamId);
        if (teamWeekStats) {
          teamWeekStats.attempts += stats.offense.attempts;
          teamWeekStats.touchdowns += stats.offense.tds;
          teamWeekStats.fieldGoals += stats.offense.fgs;
          teamWeekStats.oppAttempts += stats.defense.attempts;
          teamWeekStats.oppTouchdowns += stats.defense.tds;
          teamWeekStats.oppFieldGoals += stats.defense.fgs;
        }
      });
    }

    console.log(`Collected stats from ${games.length} games`);
    console.log(`Found ${weekStats.size} teams`);

    // Calculate TD rates
    weekStats.forEach(stats => {
      if (stats.attempts > 0) {
        stats.tdRate = ((stats.touchdowns / stats.attempts) * 100).toFixed(2);
      }
      if (stats.oppAttempts > 0) {
        stats.oppTdRate = ((stats.oppTouchdowns / stats.oppAttempts) * 100).toFixed(2);
      }
    });

    // Update database with red zone stats
    let updatedCount = 0;
    
    for (const [teamId, stats] of weekStats) {
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
              oppRedZoneAttempts: stats.oppAttempts,
              oppRedZoneTouchdowns: stats.oppTouchdowns,
              oppRedZoneFieldGoals: stats.oppFieldGoals,
              oppRedZoneTdRate: stats.oppTdRate,
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
            redZoneTdRate: stats.tdRate,
            oppRedZoneAttempts: stats.oppAttempts,
            oppRedZoneTouchdowns: stats.oppTouchdowns,
            oppRedZoneFieldGoals: stats.oppFieldGoals,
            oppRedZoneTdRate: stats.oppTdRate
          });
          updatedCount++;
        }

        console.log(`✓ ${stats.teamAbbreviation}: OFF ${stats.attempts} RZ attempts, ${stats.touchdowns} TDs, ${stats.fieldGoals} FGs (${stats.tdRate}% TD) | DEF ${stats.oppAttempts} RZ attempts, ${stats.oppTouchdowns} TDs, ${stats.oppFieldGoals} FGs (${stats.oppTdRate}% TD)`);
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
