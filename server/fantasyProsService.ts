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

    // Log a sample player to see available fields
    if (data.players.length > 0) {
      console.log(`Sample player from API:`, JSON.stringify(data.players[0], null, 2));
    }

    // Get injury data if available
    let injuryMap = new Map<string, any>();
    try {
      const injuryEndpoint = `${BASE_URL}/${sport.toUpperCase()}/injuries?year=${season}`;
      const injuryData = await fetchFromFantasyPros(injuryEndpoint);
      
      if (injuryData?.players && Array.isArray(injuryData.players)) {
        console.log(`Found ${injuryData.players.length} players with injury data`);
        if (injuryData.players.length > 0) {
          console.log(`Sample injury data:`, JSON.stringify(injuryData.players[0], null, 2));
        }
        
        // Create map of player_id to injury status
        injuryData.players.forEach((p: any) => {
          const playerId = String(p.player_id || p.id || p.fpid);
          injuryMap.set(playerId, {
            status: p.injury_status || p.status || p.injury_short,
            jerseyNumber: p.jersey || p.jersey_number || p.number,
          });
        });
      }
    } catch (err) {
      console.warn('Could not fetch injury data:', err);
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
        const hasId = p.player_id || p.id || p.fpid;
        const hasName = p.player_name || p.name;
        return hasId && hasName;
      })
      .map((p: any) => {
        const playerId = String(p.player_id || p.id || p.fpid);
        const injuryInfo = injuryMap.get(playerId);
        
        return {
          sport,
          season,
          playerId,
          name: p.player_name || p.name,
          team: p.player_team_id || p.team_id || p.team_abbr || p.team,
          position: p.player_position_id || p.position_id || p.position || p.player_positions,
          status: injuryInfo?.status || p.injury_status || p.status,
          jerseyNumber: injuryInfo?.jerseyNumber || p.jersey || p.jersey_number,
        };
      });

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

    // Fetch rankings for each position (with delay to avoid rate limiting)
    for (let i = 0; i < positions.length; i++) {
      const pos = positions[i];
      
      // Add 500ms delay between requests to avoid rate limiting (except first request)
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      let endpoint = `${BASE_URL}/${sport.toUpperCase()}/${season}/consensus-rankings?type=${rankType}&scoring=${scoringType}&position=${pos}`;
      if (week) endpoint += `&week=${week}`;

      const data = await fetchFromFantasyPros(endpoint);

      if (!data?.players || !Array.isArray(data.players)) {
        console.warn(`No rankings data for position ${pos}`);
        continue;
      }

      // Log sample player to see actual structure
      if (data.players.length > 0 && pos === 'QB') {
        console.log(`Sample ${pos} player from API:`, JSON.stringify(data.players[0], null, 2));
      }
      
      // Insert new rankings - filter out players without required data
      const playersWithData = data.players.filter((p: any) => {
        // Check all possible field name variations
        const hasId = p.player_id || p.id || p.playerId;
        const hasName = p.player_name || p.name || p.playerName;
        const hasRank = p.rank || p.ecr_rank || p.ecrRank || p.rank_ecr;
        const isValid = hasId && hasName && hasRank;
        
        if (!isValid) {
          console.log(`Filtering out player: id=${p.player_id || p.id || p.playerId}, name=${p.player_name || p.name || p.playerName}, rank=${p.rank || p.ecr_rank || p.ecrRank}`);
        }
        
        return isValid;
      });
      
      console.log(`Position ${pos}: ${data.players.length} players from API, ${playersWithData.length} passed validation`);
      
      const rankings = playersWithData.map((p: any) => ({
          sport,
          season,
          week: week || null,
          playerId: String(p.player_id || p.id || p.playerId),
          playerName: p.player_name || p.name || p.playerName,
          team: p.player_team_id || p.team_id || p.team_abbr || p.team || p.teamAbbr,
          position: p.player_position_id || p.position_id || p.player_positions || p.position || pos,
          rankType,
          scoringType,
          rank: p.rank || p.ecr_rank || p.ecrRank || p.rank_ecr,
          tier: p.tier,
          bestRank: p.rank_min || p.best_rank || p.rankMin || p.bestRank,
          worstRank: p.rank_max || p.worst_rank || p.rankMax || p.worstRank,
          avgRank: String(p.rank_ave || p.avg_rank || p.rankAve || p.avgRank || ''),
          stdDev: String(p.rank_std || p.std_dev || p.rankStd || p.stdDev || ''),
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

    // Log sample player to see actual structure
    if (data.players.length > 0) {
      console.log(`Sample projection player from API:`, JSON.stringify(data.players[0], null, 2));
    }

    // Insert new projections - skip players without required data
    const projections = data.players
      .filter((p: any) => {
        const hasId = p.fpid || p.player_id || p.id || p.playerId;
        const hasName = p.name || p.player_name || p.playerName;
        const hasPoints = p.stats?.points_ppr || p.stats?.points || p.fpts || p.projected_points;
        const isValid = hasId && hasName && hasPoints;
        
        if (!isValid) {
          console.log(`Filtering out projection: id=${p.fpid || p.player_id || p.id}, name=${p.name || p.player_name}, points=${p.stats?.points_ppr || p.stats?.points}`);
        }
        
        return isValid;
      })
      .map((p: any) => ({
        sport,
        season,
        week: week || null,
        playerId: String(p.fpid || p.player_id || p.id || p.playerId),
        playerName: p.name || p.player_name || p.playerName,
        team: p.team_id || p.team_abbr || p.team || p.teamAbbr,
        position: p.position_id || p.position,
        opponent: p.opponent || p.opp,
        scoringType,
        projectedPoints: String(p.stats?.points_ppr || p.stats?.points || p.fpts || p.projected_points),
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

    // News API uses 'items' array instead of 'news'
    const newsItems = data.items || data.news;
    
    if (!newsItems || !Array.isArray(newsItems)) {
      console.log('News API response structure:', Object.keys(data));
      throw new Error("Invalid response format from Fantasy Pros API - expected items or news array");
    }

    console.log(`Sample news item from API:`, JSON.stringify(newsItems[0], null, 2));

    // Insert news - skip items without required data and duplicates
    let insertedCount = 0;
    for (const item of newsItems) {
      // Skip items without required fields
      const hasNewsId = item.news_id || item.id;
      const hasHeadline = item.headline || item.title;
      
      if (!hasNewsId || !hasHeadline) {
        continue;
      }

      // News API only provides player_id and team_id, not player_name/position
      // Look up player details from fantasy_pros_players table if we have a player_id
      let playerName = null;
      let team = item.team_id || item.team_abbr || item.team;
      let position = null;

      if (item.player_id) {
        const { eq } = await import('drizzle-orm');
        const playerLookup = await db
          .select()
          .from(fantasyProsPlayers)
          .where(eq(fantasyProsPlayers.playerId, String(item.player_id)))
          .limit(1);

        if (playerLookup.length > 0) {
          const player = playerLookup[0];
          playerName = player.name;
          team = player.team || team; // Use player's team if available, otherwise use team_id from news
          position = player.position;
          console.log(`✓ Found player data for ID ${item.player_id}: ${playerName} (${position}, ${team})`);
        } else {
          console.log(`✗ No player found for ID ${item.player_id} - will have NULL values`);
        }
      }

      try {
        const newsData = {
          sport,
          newsId: String(item.news_id || item.id),
          playerId: item.player_id ? String(item.player_id) : null,
          playerName,
          team,
          position,
          headline: item.headline || item.title,
          description: item.description || item.desc || item.news,
          analysis: item.analysis || item.impact,
          source: item.source,
          newsDate: item.updated || item.created ? new Date(item.updated || item.created) : null,
        };

        // Use upsert to update existing records with new player data
        await db.insert(fantasyProsNews)
          .values(newsData)
          .onConflictDoUpdate({
            target: fantasyProsNews.newsId,
            set: {
              playerName,
              team,
              position,
              headline: newsData.headline,
              description: newsData.description,
              analysis: newsData.analysis,
              source: newsData.source,
              newsDate: newsData.newsDate,
            },
          });
        insertedCount++;
      } catch (err: any) {
        console.error('Error inserting/updating news item:', err);
        throw err;
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
