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
    console.error(`Fantasy Pros API error (${response.status}):`, errorText);
    throw new Error(`Fantasy Pros API error: ${response.status} ${response.statusText} - ${errorText.substring(0, 200)}`);
  }

  const data = await response.json();
  console.log(`Fantasy Pros API response keys:`, Object.keys(data));
  console.log(`Fantasy Pros API response data count:`, Array.isArray(data.players) ? data.players.length : Array.isArray(data.news) ? data.news.length : 'N/A');
  return data;
}

export async function refreshPlayers(sport: string, season: number): Promise<RefreshResult> {
  try {
    console.log(`Refreshing players for ${sport} ${season}...`);
    
    const endpoint = `${BASE_URL}/${sport.toUpperCase()}/players`;
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

    // Insert new players - skip players without required data
    const players = data.players
      .filter((p: any) => {
        const hasId = p.player_id || p.id;
        const hasName = p.player_name || p.name;
        return hasId && hasName;
      })
      .map((p: any) => ({
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
    console.log(`Refreshing rankings for ${sport} ${season} week ${week || 'season'} position ${position || 'ALL'}...`);
    
    // If no position specified, fetch for all main positions
    const positions = position ? [position] : ['QB', 'RB', 'WR', 'TE', 'K', 'DST'];
    let totalRankings = 0;

    // Delete existing rankings for this criteria first
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
    if (position) {
      deleteConditions.push(eq(fantasyProsRankings.position, position));
    }

    await db.delete(fantasyProsRankings).where(and(...deleteConditions));

    // Fetch rankings for each position
    for (const pos of positions) {
      let endpoint = `${BASE_URL}/${sport.toUpperCase()}/${season}/consensus-rankings?type=${rankType}&scoring=${scoringType}&position=${pos}`;
      if (week) endpoint += `&week=${week}`;

      const data = await fetchFromFantasyPros(endpoint);

      if (!data?.players || !Array.isArray(data.players)) {
        console.warn(`No rankings data for position ${pos}`);
        continue;
      }

      // Insert new rankings - filter out players without required data
      const playersWithData = data.players.filter((p: any) => {
        const hasId = p.player_id || p.id;
        const hasName = p.player_name || p.name;
        const hasRank = p.rank || p.ecr_rank;
        const isValid = hasId && hasName && hasRank;
        
        if (!isValid && data.players.length < 10) { // Log first few if debugging small dataset
          console.log(`Filtering out player: id=${p.player_id || p.id}, name=${p.player_name || p.name}, rank=${p.rank || p.ecr_rank}`);
        }
        
        return isValid;
      });
      
      console.log(`Position ${pos}: ${data.players.length} players from API, ${playersWithData.length} passed validation`);
      
      const rankings = playersWithData.map((p: any) => ({
          sport,
          season,
          week: week || null,
          playerId: String(p.player_id || p.id),
          playerName: p.player_name || p.name,
          team: p.team_abbr || p.team,
          position: p.position || pos,
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
        totalRankings += rankings.length;
      }
    }

    // Log refresh
    await db.insert(fantasyProsRefreshLog).values({
      dataType: 'rankings',
      sport,
      season,
      week: week || null,
      recordCount: totalRankings,
      status: 'success',
    });

    console.log(`Successfully refreshed ${totalRankings} rankings for ${sport} ${season}`);
    return { success: true, recordCount: totalRankings };
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

    // Insert new projections - skip players without required data
    const projections = data.players
      .filter((p: any) => {
        const hasId = p.player_id || p.id;
        const hasName = p.player_name || p.name;
        const hasPoints = p.fpts || p.projected_points;
        return hasId && hasName && hasPoints;
      })
      .map((p: any) => ({
        sport,
        season,
        week: week || null,
        playerId: String(p.player_id || p.id),
        playerName: p.player_name || p.name,
        team: p.team_abbr || p.team,
        position: p.position,
        opponent: p.opponent,
        scoringType,
        projectedPoints: String(p.fpts || p.projected_points),
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
    
    const endpoint = `${BASE_URL}/${sport.toUpperCase()}/news?limit=${limit}`;
    const data = await fetchFromFantasyPros(endpoint);

    if (!data?.news || !Array.isArray(data.news)) {
      throw new Error("Invalid response format from Fantasy Pros API");
    }

    // Insert news - skip items without required data and duplicates
    let insertedCount = 0;
    for (const item of data.news) {
      // Skip items without required fields
      const hasNewsId = item.news_id || item.id;
      const hasHeadline = item.headline || item.title;
      
      if (!hasNewsId || !hasHeadline) {
        continue;
      }

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
