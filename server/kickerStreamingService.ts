import { db } from "./db";
import { nflStadiums, nflVegasOdds, nflTeamStats } from "@shared/schema";
import { eq, and, isNotNull } from "drizzle-orm";

/**
 * Kicker Streaming Service
 * Analyzes available kickers and ranks them based on:
 * 1. Stadium conditions (dome/retractable = better weather protection)
 * 2. Vegas odds (underdog/high total = more FG opportunities)
 * 3. Red zone efficiency (low TD rate = team stalls, kicks more FGs)
 * 4. Opponent red zone defense (allows more FGs)
 */

export interface KickerRecommendation {
  playerName: string;
  nflTeam: string;
  nflTeamAbbr: string;
  opponent: string;
  isHome: boolean;
  totalScore: number;
  breakdown: {
    domeAdvantage: number;
    vegasScore: number;
    redZoneScore: number;
    oppDefenseScore: number;
  };
  factors: {
    inDome: boolean;
    roofType: string | null;
    isUnderdog: boolean;
    spread: string | null;
    overUnder: string | null;
    teamRedZoneTdRate: string | null;
    oppRedZoneTdRate: string | null;
  };
  projection: number; // Projected fantasy points
}

interface TeamMatchupData {
  team: string;
  teamAbbr: string;
  opponent: string;
  isHome: boolean;
  stadium: typeof nflStadiums.$inferSelect | null;
  odds: typeof nflVegasOdds.$inferSelect | null;
  teamStats: typeof nflTeamStats.$inferSelect | null;
  oppStats: typeof nflTeamStats.$inferSelect | null;
}

/**
 * Get all NFL matchups for a specific week with associated data
 */
async function getWeekMatchups(season: number, week: number): Promise<TeamMatchupData[]> {
  try {
    // Get all games with odds
    const oddsData = await db.query.nflVegasOdds.findMany({
      where: and(
        eq(nflVegasOdds.season, season),
        eq(nflVegasOdds.week, week)
      )
    });

    if (oddsData.length === 0) {
      console.log(`No Vegas odds found for season ${season} week ${week}`);
      return [];
    }

    // Get all stadiums
    const stadiums = await db.query.nflStadiums.findMany();
    const stadiumMap = new Map(stadiums.map(s => [s.teamAbbreviation, s]));

    // Get all team stats for this week
    const teamStats = await db.query.nflTeamStats.findMany({
      where: and(
        eq(nflTeamStats.season, season),
        eq(nflTeamStats.week, week)
      )
    });
    const statsMap = new Map(teamStats.map(s => [s.teamAbbreviation, s]));

    const matchups: TeamMatchupData[] = [];

    // Process each game (track unique games to avoid duplicates from multiple bookmakers)
    const processedGames = new Set<string>();
    
    for (const odds of oddsData) {
      const gameKey = `${odds.homeTeam}-${odds.awayTeam}`;
      if (processedGames.has(gameKey)) continue;
      processedGames.add(gameKey);

      // Add home team matchup
      matchups.push({
        team: odds.homeTeam,
        teamAbbr: normalizeTeamAbbr(odds.homeTeam),
        opponent: odds.awayTeam,
        isHome: true,
        stadium: stadiumMap.get(normalizeTeamAbbr(odds.homeTeam)) || null,
        odds: odds,
        teamStats: statsMap.get(normalizeTeamAbbr(odds.homeTeam)) || null,
        oppStats: statsMap.get(normalizeTeamAbbr(odds.awayTeam)) || null
      });

      // Add away team matchup
      matchups.push({
        team: odds.awayTeam,
        teamAbbr: normalizeTeamAbbr(odds.awayTeam),
        opponent: odds.homeTeam,
        isHome: false,
        stadium: stadiumMap.get(normalizeTeamAbbr(odds.homeTeam)) || null, // Away team plays at home team's stadium
        odds: odds,
        teamStats: statsMap.get(normalizeTeamAbbr(odds.awayTeam)) || null,
        oppStats: statsMap.get(normalizeTeamAbbr(odds.homeTeam)) || null
      });
    }

    console.log(`Found ${matchups.length} team matchups for week ${week}`);
    return matchups;
  } catch (error) {
    console.error('Error fetching week matchups:', error);
    return [];
  }
}

/**
 * Normalize team abbreviations to match across different data sources
 */
function normalizeTeamAbbr(teamName: string): string {
  // Map common variations to standard ESPN abbreviations
  const mapping: Record<string, string> = {
    'LA Rams': 'LAR',
    'Los Angeles Rams': 'LAR',
    'LA Chargers': 'LAC',
    'Los Angeles Chargers': 'LAC',
    'Washington': 'WSH',
    'Washington Commanders': 'WSH'
  };
  
  return mapping[teamName] || teamName;
}

/**
 * Calculate dome advantage score (0-30 points)
 */
function calculateDomeScore(stadium: typeof nflStadiums.$inferSelect | null): number {
  if (!stadium) return 0;
  
  if (stadium.roofType === 'dome') return 30;
  if (stadium.roofType === 'retractable') return 20;
  return 0;
}

/**
 * Calculate Vegas matchup score (0-30 points)
 * Factors: Underdog status, high over/under
 */
function calculateVegasScore(
  matchup: TeamMatchupData
): number {
  if (!matchup.odds) return 0;
  
  let score = 0;
  
  // Check if team is underdog (more likely to kick FGs)
  const isUnderdog = matchup.isHome 
    ? parseFloat(matchup.odds.homeSpread || "0") > 0
    : parseFloat(matchup.odds.awaySpread || "0") > 0;
  
  if (isUnderdog) {
    score += 15; // Underdogs tend to kick more FGs
  }
  
  // High over/under means more scoring opportunities
  const overUnder = parseFloat(matchup.odds.overUnder || "0");
  if (overUnder >= 50) {
    score += 15;
  } else if (overUnder >= 47) {
    score += 10;
  } else if (overUnder >= 44) {
    score += 5;
  }
  
  return score;
}

/**
 * Calculate red zone efficiency score (0-25 points)
 * Lower TD rate = team stalls in red zone = more FG attempts
 */
function calculateRedZoneScore(stats: typeof nflTeamStats.$inferSelect | null): number {
  if (!stats || !stats.redZoneTdRate) return 0;
  
  const tdRate = parseFloat(stats.redZoneTdRate);
  
  // Lower TD rate is better for kickers (more FGs)
  if (tdRate < 40) return 25; // Terrible red zone offense = lots of FGs
  if (tdRate < 50) return 20;
  if (tdRate < 55) return 15;
  if (tdRate < 60) return 10;
  if (tdRate < 65) return 5;
  return 0;
}

/**
 * Calculate opponent defense score (0-15 points)
 * Opponent allows more FGs in red zone = good for kicker
 */
function calculateOppDefenseScore(oppStats: typeof nflTeamStats.$inferSelect | null): number {
  if (!oppStats || !oppStats.oppRedZoneTdRate) return 0;
  
  const oppTdRate = parseFloat(oppStats.oppRedZoneTdRate);
  
  // Lower opponent TD rate = defense forces more FGs
  if (oppTdRate < 40) return 15;
  if (oppTdRate < 50) return 12;
  if (oppTdRate < 55) return 9;
  if (oppTdRate < 60) return 6;
  if (oppTdRate < 65) return 3;
  return 0;
}

/**
 * Calculate projected fantasy points based on scoring factors
 */
function calculateProjection(totalScore: number): number {
  // Base projection starts at 6 points (typical week)
  // Add 0.05 points per score point
  return Math.round((6 + (totalScore * 0.05)) * 10) / 10;
}

/**
 * Get kicker streaming recommendations for a specific week
 */
export async function getKickerRecommendations(
  season: number,
  week: number
): Promise<KickerRecommendation[]> {
  try {
    console.log(`Generating kicker recommendations for ${season} week ${week}...`);
    
    // Get all team matchups with data
    const matchups = await getWeekMatchups(season, week);
    
    if (matchups.length === 0) {
      console.log('No matchup data available');
      return [];
    }

    // Score each matchup
    const recommendations: KickerRecommendation[] = matchups.map(matchup => {
      const domeScore = calculateDomeScore(matchup.stadium);
      const vegasScore = calculateVegasScore(matchup);
      const redZoneScore = calculateRedZoneScore(matchup.teamStats);
      const oppDefenseScore = calculateOppDefenseScore(matchup.oppStats);
      
      const totalScore = domeScore + vegasScore + redZoneScore + oppDefenseScore;
      
      // Determine underdog status
      const isUnderdog = matchup.isHome 
        ? parseFloat(matchup.odds?.homeSpread || "0") > 0
        : parseFloat(matchup.odds?.awaySpread || "0") > 0;
      
      return {
        playerName: `${matchup.team} Kicker`, // Will be replaced with actual kicker name
        nflTeam: matchup.team,
        nflTeamAbbr: matchup.teamAbbr,
        opponent: matchup.opponent,
        isHome: matchup.isHome,
        totalScore,
        breakdown: {
          domeAdvantage: domeScore,
          vegasScore,
          redZoneScore,
          oppDefenseScore
        },
        factors: {
          inDome: (matchup.stadium?.roofType === 'dome' || matchup.stadium?.roofType === 'retractable') ?? false,
          roofType: matchup.stadium?.roofType || null,
          isUnderdog,
          spread: (matchup.isHome ? matchup.odds?.homeSpread : matchup.odds?.awaySpread) || null,
          overUnder: matchup.odds?.overUnder || null,
          teamRedZoneTdRate: matchup.teamStats?.redZoneTdRate || null,
          oppRedZoneTdRate: matchup.oppStats?.oppRedZoneTdRate || null
        },
        projection: calculateProjection(totalScore)
      };
    });

    // Sort by total score (highest first)
    recommendations.sort((a, b) => b.totalScore - a.totalScore);
    
    console.log(`Generated ${recommendations.length} kicker recommendations`);
    console.log(`Top 3: ${recommendations.slice(0, 3).map(r => `${r.nflTeam} (${r.totalScore})`).join(', ')}`);
    
    return recommendations;
  } catch (error) {
    console.error('Error generating kicker recommendations:', error);
    throw error;
  }
}
