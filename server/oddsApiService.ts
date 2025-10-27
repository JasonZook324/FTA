import { db } from "./db";
import { nflVegasOdds } from "@shared/schema";
import { eq, and } from "drizzle-orm";

const ODDS_API_KEY = process.env.ODDS_API_KEY;
const BASE_URL = "https://api.the-odds-api.com/v4";

interface RefreshResult {
  success: boolean;
  recordCount: number;
  error?: string;
}

async function fetchFromOddsApi(endpoint: string): Promise<any> {
  if (!ODDS_API_KEY) {
    throw new Error("Odds API key not configured");
  }

  console.log(`Calling Odds API: ${endpoint}`);

  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Odds API error (${response.status}):`, errorText);
    throw new Error(`Odds API error: ${response.status} ${response.statusText} - ${errorText.substring(0, 200)}`);
  }

  const data = await response.json();
  console.log(`Odds API response - games count:`, Array.isArray(data) ? data.length : 'N/A');
  return data;
}

export async function refreshNflOdds(season: number, week: number): Promise<RefreshResult> {
  try {
    console.log(`Refreshing NFL odds for ${season} week ${week}...`);
    
    // The Odds API endpoint for NFL
    // regions=us for US bookmakers, markets for spreads, totals, moneylines
    const endpoint = `${BASE_URL}/sports/americanfootball_nfl/odds?apiKey=${ODDS_API_KEY}&regions=us&markets=h2h,spreads,totals&oddsFormat=american`;
    const data = await fetchFromOddsApi(endpoint);

    if (!Array.isArray(data)) {
      throw new Error("Invalid response format from Odds API");
    }

    // Log sample game to see structure
    if (data.length > 0) {
      console.log(`Sample game from Odds API:`, JSON.stringify(data[0], null, 2));
    }

    // Delete existing odds for this season/week
    await db.delete(nflVegasOdds)
      .where(and(
        eq(nflVegasOdds.season, season),
        eq(nflVegasOdds.week, week)
      ));

    let insertedCount = 0;

    // Process each game
    for (const game of data) {
      if (!game.id || !game.home_team || !game.away_team || !game.bookmakers) {
        continue;
      }

      const gameId = game.id;
      const homeTeam = game.home_team;
      const awayTeam = game.away_team;
      const commenceTime = game.commence_time ? new Date(game.commence_time) : null;

      // Process each bookmaker's odds for this game
      for (const bookmaker of game.bookmakers) {
        if (!bookmaker.key || !bookmaker.markets) {
          continue;
        }

        let homeMoneyline = null;
        let awayMoneyline = null;
        let homeSpread = null;
        let awaySpread = null;
        let overUnder = null;

        // Extract markets data
        for (const market of bookmaker.markets) {
          if (market.key === 'h2h' && market.outcomes) {
            // Moneyline
            const homeOutcome = market.outcomes.find((o: any) => o.name === homeTeam);
            const awayOutcome = market.outcomes.find((o: any) => o.name === awayTeam);
            homeMoneyline = homeOutcome?.price || null;
            awayMoneyline = awayOutcome?.price || null;
          } else if (market.key === 'spreads' && market.outcomes) {
            // Spread
            const homeOutcome = market.outcomes.find((o: any) => o.name === homeTeam);
            const awayOutcome = market.outcomes.find((o: any) => o.name === awayTeam);
            homeSpread = homeOutcome?.point ? String(homeOutcome.point) : null;
            awaySpread = awayOutcome?.point ? String(awayOutcome.point) : null;
          } else if (market.key === 'totals' && market.outcomes) {
            // Over/Under - take the first point value
            const totalOutcome = market.outcomes[0];
            overUnder = totalOutcome?.point ? String(totalOutcome.point) : null;
          }
        }

        // Insert odds record
        try {
          await db.insert(nflVegasOdds).values({
            season,
            week,
            gameId,
            homeTeam,
            awayTeam,
            commenceTime,
            homeMoneyline,
            awayMoneyline,
            homeSpread,
            awaySpread,
            overUnder,
            bookmaker: bookmaker.key,
          });
          insertedCount++;
        } catch (err) {
          console.error(`Failed to insert odds for ${gameId} - ${bookmaker.key}:`, err);
        }
      }
    }

    console.log(`✓ Successfully refreshed ${insertedCount} NFL odds records`);
    return { success: true, recordCount: insertedCount };
  } catch (error: any) {
    console.error('Error refreshing NFL odds:', error);
    return { success: false, recordCount: 0, error: error.message };
  }
}

export async function getOddsApiUsage(): Promise<any> {
  try {
    if (!ODDS_API_KEY) {
      throw new Error("Odds API key not configured");
    }

    // Check remaining requests
    const endpoint = `${BASE_URL}/sports/americanfootball_nfl/odds?apiKey=${ODDS_API_KEY}&regions=us&markets=h2h&oddsFormat=american`;
    const response = await fetch(endpoint, {
      method: 'HEAD', // Use HEAD to check headers without downloading full response
    });

    const remaining = response.headers.get('x-requests-remaining');
    const used = response.headers.get('x-requests-used');
    
    return {
      remaining: remaining ? parseInt(remaining) : null,
      used: used ? parseInt(used) : null,
    };
  } catch (error: any) {
    console.error('Error checking Odds API usage:', error);
    return { remaining: null, used: null, error: error.message };
  }
}
