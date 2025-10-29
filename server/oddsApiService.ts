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

// NFL 2025 season week start dates (Thursdays)
const NFL_2025_WEEKS = [
  { week: 1, start: new Date('2024-09-05T00:00:00Z') },
  { week: 2, start: new Date('2024-09-12T00:00:00Z') },
  { week: 3, start: new Date('2024-09-19T00:00:00Z') },
  { week: 4, start: new Date('2024-09-26T00:00:00Z') },
  { week: 5, start: new Date('2024-10-03T00:00:00Z') },
  { week: 6, start: new Date('2024-10-10T00:00:00Z') },
  { week: 7, start: new Date('2024-10-17T00:00:00Z') },
  { week: 8, start: new Date('2024-10-24T00:00:00Z') },
  { week: 9, start: new Date('2024-10-31T00:00:00Z') },
  { week: 10, start: new Date('2024-11-07T00:00:00Z') },
  { week: 11, start: new Date('2024-11-14T00:00:00Z') },
  { week: 12, start: new Date('2024-11-21T00:00:00Z') },
  { week: 13, start: new Date('2024-11-28T00:00:00Z') },
  { week: 14, start: new Date('2024-12-05T00:00:00Z') },
  { week: 15, start: new Date('2024-12-12T00:00:00Z') },
  { week: 16, start: new Date('2024-12-19T00:00:00Z') },
  { week: 17, start: new Date('2024-12-26T00:00:00Z') },
  { week: 18, start: new Date('2025-01-02T00:00:00Z') },
];

function getNFLWeekFromDate(gameDate: Date): number | null {
  // Find the week this game belongs to
  for (let i = NFL_2025_WEEKS.length - 1; i >= 0; i--) {
    if (gameDate >= NFL_2025_WEEKS[i].start) {
      return NFL_2025_WEEKS[i].week;
    }
  }
  return null;
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
    let skippedCount = 0;

    // Process each game
    for (const game of data) {
      if (!game.id || !game.home_team || !game.away_team || !game.bookmakers) {
        continue;
      }

      const gameId = game.id;
      const homeTeam = game.home_team;
      const awayTeam = game.away_team;
      const commenceTime = game.commence_time ? new Date(game.commence_time) : null;
      
      // Calculate which week this game belongs to
      if (!commenceTime) {
        console.log(`⚠ Skipping game ${homeTeam} vs ${awayTeam} - no commence time`);
        skippedCount++;
        continue;
      }
      
      const gameWeek = getNFLWeekFromDate(commenceTime);
      if (gameWeek === null) {
        console.log(`⚠ Skipping game ${homeTeam} vs ${awayTeam} - couldn't determine week for ${commenceTime}`);
        skippedCount++;
        continue;
      }
      
      // Only store games for the requested week
      if (gameWeek !== week) {
        console.log(`⚠ Skipping game ${homeTeam} vs ${awayTeam} - belongs to week ${gameWeek}, not week ${week}`);
        skippedCount++;
        continue;
      }

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
            homeMoneyline = homeOutcome?.price ?? null;
            awayMoneyline = awayOutcome?.price ?? null;
          } else if (market.key === 'spreads' && market.outcomes) {
            // Spread - check for undefined, not truthiness, to preserve 0 values
            const homeOutcome = market.outcomes.find((o: any) => o.name === homeTeam);
            const awayOutcome = market.outcomes.find((o: any) => o.name === awayTeam);
            homeSpread = homeOutcome?.point !== undefined ? String(homeOutcome.point) : null;
            awaySpread = awayOutcome?.point !== undefined ? String(awayOutcome.point) : null;
          } else if (market.key === 'totals' && market.outcomes) {
            // Over/Under - take the first point value
            const totalOutcome = market.outcomes[0];
            overUnder = totalOutcome?.point !== undefined ? String(totalOutcome.point) : null;
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

    console.log(`✓ Successfully refreshed ${insertedCount} NFL odds records for week ${week}`);
    console.log(`ℹ Skipped ${skippedCount} games belonging to other weeks`);
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
