import { db } from "./db";
import { 
  fantasyProsPlayers, 
  fantasyProsRankings, 
  fantasyProsProjections, 
  fantasyProsNews,
  fantasyProsRefreshLog
} from "@shared/schema";
import { eq, and } from "drizzle-orm";

const FANTASY_PROS_API_KEY = process.env.FantasyProsApiKey;
const BASE_URL = "https://api.fantasypros.com/public/v2/json";

interface RefreshResult {
  success: boolean;
  recordCount: number;
  error?: string;
}

async function fetchFromFantasyPros(endpoint: string): Promise<any> {
  if (!FANTASY_PROS_API_KEY) {
    throw new Error("Fantasy Pros API key not configured");
  }

  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'x-api-key': FANTASY_PROS_API_KEY,
    },
  });

  if (!response.ok) {
    throw new Error(`Fantasy Pros API error: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

export async function refreshPlayers(sport: string, season: number): Promise<RefreshResult> {
  try {
    console.log(`Refreshing players for ${sport} ${season}...`);
    
    const endpoint = `${BASE_URL}/${sport}/players`;
    const data = await fetchFromFantasyPros(endpoint);

    if (!data?.players || !Array.isArray(data.players)) {
      throw new Error("Invalid response format from Fantasy Pros API");
    }

    // Delete existing players for this sport/season
    await db.delete(fantasyProsPlayers)
      .where(and(
        eq(fantasyProsPlayers.sport, sport),
        eq(fantasyProsPlayers.season, season)
      ));

    // Insert new players
    const players = data.players.map((p: any) => ({
      sport,
      season,
      playerId: String(p.player_id || p.id),
      name: p.player_name || p.name,
      team: p.team_abbr || p.team,
      position: p.position,
      status: p.status,
      jerseyNumber: p.jersey_number,
    }));

    if (players.length > 0) {
      await db.insert(fantasyProsPlayers).values(players);
    }

    // Log refresh
    await db.insert(fantasyProsRefreshLog).values({
      dataType: 'players',
      sport,
      season,
      recordCount: players.length,
      status: 'success',
    });

    console.log(`Successfully refreshed ${players.length} players for ${sport} ${season}`);
    return { success: true, recordCount: players.length };
  } catch (error: any) {
    console.error('Error refreshing players:', error);
    
    await db.insert(fantasyProsRefreshLog).values({
      dataType: 'players',
      sport,
      season,
      recordCount: 0,
      status: 'failed',
      errorMessage: error.message,
    });

    return { success: false, recordCount: 0, error: error.message };
  }
}

export async function refreshRankings(
  sport: string, 
  season: number, 
  week?: number, 
  position?: string,
  rankType: string = 'weekly',
  scoringType: string = 'PPR'
): Promise<RefreshResult> {
  try {
    console.log(`Refreshing rankings for ${sport} ${season} week ${week || 'season'}...`);
    
    let endpoint = `${BASE_URL}/${sport}/${season}/consensus-rankings?type=${rankType}&scoring=${scoringType}`;
    if (week) endpoint += `&week=${week}`;
    if (position) endpoint += `&position=${position}`;

    const data = await fetchFromFantasyPros(endpoint);

    if (!data?.players || !Array.isArray(data.players)) {
      throw new Error("Invalid response format from Fantasy Pros API");
    }

    // Delete existing rankings for this criteria
    const deleteConditions = [
      eq(fantasyProsRankings.sport, sport),
      eq(fantasyProsRankings.season, season),
      eq(fantasyProsRankings.rankType, rankType),
    ];
    
    if (week !== undefined) {
      deleteConditions.push(eq(fantasyProsRankings.week, week));
    }
    if (scoringType) {
      deleteConditions.push(eq(fantasyProsRankings.scoringType, scoringType));
    }

    await db.delete(fantasyProsRankings).where(and(...deleteConditions));

    // Insert new rankings
    const rankings = data.players.map((p: any) => ({
      sport,
      season,
      week: week || null,
      playerId: String(p.player_id || p.id),
      playerName: p.player_name || p.name,
      team: p.team_abbr || p.team,
      position: p.position,
      rankType,
      scoringType,
      rank: p.rank || p.ecr_rank,
      tier: p.tier,
      bestRank: p.rank_min || p.best_rank,
      worstRank: p.rank_max || p.worst_rank,
      avgRank: String(p.rank_ave || p.avg_rank || ''),
      stdDev: String(p.rank_std || p.std_dev || ''),
    }));

    if (rankings.length > 0) {
      await db.insert(fantasyProsRankings).values(rankings);
    }

    // Log refresh
    await db.insert(fantasyProsRefreshLog).values({
      dataType: 'rankings',
      sport,
      season,
      week: week || null,
      recordCount: rankings.length,
      status: 'success',
    });

    console.log(`Successfully refreshed ${rankings.length} rankings for ${sport} ${season}`);
    return { success: true, recordCount: rankings.length };
  } catch (error: any) {
    console.error('Error refreshing rankings:', error);
    
    await db.insert(fantasyProsRefreshLog).values({
      dataType: 'rankings',
      sport,
      season,
      week: week || null,
      recordCount: 0,
      status: 'failed',
      errorMessage: error.message,
    });

    return { success: false, recordCount: 0, error: error.message };
  }
}

export async function refreshProjections(
  sport: string,
  season: number,
  week?: number,
  position?: string,
  scoringType: string = 'PPR'
): Promise<RefreshResult> {
  try {
    console.log(`Refreshing projections for ${sport} ${season} week ${week || 'season'}...`);
    
    let endpoint = `${BASE_URL}/${sport.toLowerCase()}/${season}/projections?scoring=${scoringType}`;
    if (week) endpoint += `&week=${week}`;
    if (position) endpoint += `&position=${position}`;

    const data = await fetchFromFantasyPros(endpoint);

    if (!data?.players || !Array.isArray(data.players)) {
      throw new Error("Invalid response format from Fantasy Pros API");
    }

    // Delete existing projections for this criteria
    const deleteConditions = [
      eq(fantasyProsProjections.sport, sport),
      eq(fantasyProsProjections.season, season),
    ];
    
    if (week !== undefined) {
      deleteConditions.push(eq(fantasyProsProjections.week, week));
    }
    if (scoringType) {
      deleteConditions.push(eq(fantasyProsProjections.scoringType, scoringType));
    }

    await db.delete(fantasyProsProjections).where(and(...deleteConditions));

    // Insert new projections
    const projections = data.players.map((p: any) => ({
      sport,
      season,
      week: week || null,
      playerId: String(p.player_id || p.id),
      playerName: p.player_name || p.name,
      team: p.team_abbr || p.team,
      position: p.position,
      opponent: p.opponent,
      scoringType,
      projectedPoints: String(p.fpts || p.projected_points || '0'),
      stats: p.stats || p,
    }));

    if (projections.length > 0) {
      await db.insert(fantasyProsProjections).values(projections);
    }

    // Log refresh
    await db.insert(fantasyProsRefreshLog).values({
      dataType: 'projections',
      sport,
      season,
      week: week || null,
      recordCount: projections.length,
      status: 'success',
    });

    console.log(`Successfully refreshed ${projections.length} projections for ${sport} ${season}`);
    return { success: true, recordCount: projections.length };
  } catch (error: any) {
    console.error('Error refreshing projections:', error);
    
    await db.insert(fantasyProsRefreshLog).values({
      dataType: 'projections',
      sport,
      season,
      week: week || null,
      recordCount: 0,
      status: 'failed',
      errorMessage: error.message,
    });

    return { success: false, recordCount: 0, error: error.message };
  }
}

export async function refreshNews(sport: string, limit: number = 50): Promise<RefreshResult> {
  try {
    console.log(`Refreshing news for ${sport}...`);
    
    const endpoint = `${BASE_URL}/${sport}/news?limit=${limit}`;
    const data = await fetchFromFantasyPros(endpoint);

    if (!data?.news || !Array.isArray(data.news)) {
      throw new Error("Invalid response format from Fantasy Pros API");
    }

    // Insert news (skip duplicates based on news_id unique constraint)
    let insertedCount = 0;
    for (const item of data.news) {
      try {
        await db.insert(fantasyProsNews).values({
          sport,
          newsId: String(item.news_id || item.id),
          playerId: item.player_id ? String(item.player_id) : null,
          playerName: item.player_name,
          team: item.team_abbr || item.team,
          position: item.position,
          headline: item.headline || item.title,
          description: item.description || item.news,
          analysis: item.analysis,
          source: item.source,
          newsDate: item.updated ? new Date(item.updated) : null,
        });
        insertedCount++;
      } catch (err: any) {
        // Skip duplicates (unique constraint violation)
        if (!err.message?.includes('unique') && !err.message?.includes('duplicate')) {
          throw err;
        }
      }
    }

    // Log refresh
    await db.insert(fantasyProsRefreshLog).values({
      dataType: 'news',
      sport,
      recordCount: insertedCount,
      status: 'success',
    });

    console.log(`Successfully refreshed ${insertedCount} news items for ${sport}`);
    return { success: true, recordCount: insertedCount };
  } catch (error: any) {
    console.error('Error refreshing news:', error);
    
    await db.insert(fantasyProsRefreshLog).values({
      dataType: 'news',
      sport,
      recordCount: 0,
      status: 'failed',
      errorMessage: error.message,
    });

    return { success: false, recordCount: 0, error: error.message };
  }
}

// Convenience function to refresh all data for a sport/season
export async function refreshAllData(sport: string, season: number, week?: number): Promise<{
  players: RefreshResult;
  rankings: RefreshResult;
  projections: RefreshResult;
  news: RefreshResult;
}> {
  const results = {
    players: await refreshPlayers(sport, season),
    rankings: await refreshRankings(sport, season, week),
    projections: await refreshProjections(sport, season, week),
    news: await refreshNews(sport),
  };

  return results;
}
