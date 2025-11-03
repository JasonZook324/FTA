import { useQuery } from '@tanstack/react-query';

export interface NflMatchup {
  id: string;
  season: number;
  week: number;
  teamAbbr: string;
  opponentAbbr: string;
  gameTimeUtc: Date;
  isHome: boolean;
  gameDay: string;
  bookmakerSource: string | null;
  createdAt: Date | null;
}

/**
 * Hook to fetch NFL matchups for a specific season and week
 * Returns matchup data from the nflMatchups table populated by the Jobs page
 */
export function useNFLMatchups(season: number, week: number) {
  return useQuery<{ matchups: NflMatchup[] }>({
    queryKey: ['/api/nfl/matchups', season, week],
    enabled: !!(season && week),
    staleTime: 5 * 60 * 1000, // 5 minutes - matchups don't change frequently
  });
}

/**
 * Helper function to find opponent abbreviation for a given team
 */
export function getOpponent(matchups: NflMatchup[], teamAbbr: string): string | null {
  const matchup = matchups.find(m => m.teamAbbr === teamAbbr);
  return matchup ? (matchup.isHome ? `vs ${matchup.opponentAbbr}` : `@ ${matchup.opponentAbbr}`) : null;
}

/**
 * Helper function to get game time for a given team
 * Returns pre-formatted string like "Sun 1:00 PM ET" from the database
 */
export function getGameTime(matchups: NflMatchup[], teamAbbr: string): { gameTimeUtc: Date; gameDay: string } | null {
  const matchup = matchups.find(m => m.teamAbbr === teamAbbr);
  return matchup ? { gameTimeUtc: matchup.gameTimeUtc, gameDay: matchup.gameDay } : null;
}

/**
 * Hook to fetch NFL defensive rankings (OPRK) for a specific season and week
 * Returns team abbreviation -> defensive rank (1-32, lower = tougher defense)
 */
export function useDefensiveRankings(season: number, week: number) {
  return useQuery<{ rankings: Record<string, number> }>({
    queryKey: ['/api/nfl/defensive-rankings', season, week],
    enabled: !!(season && week),
    staleTime: 60 * 60 * 1000, // 1 hour - defensive rankings change infrequently
  });
}

/**
 * Helper function to get defensive rank for opponent
 * Returns rank 1-32 (1 = toughest defense, 32 = easiest defense)
 */
export function getOpponentRank(rankings: Record<string, number>, opponentAbbr: string | null): number | null {
  if (!opponentAbbr || !rankings) return null;
  
  // Strip "vs " or "@ " prefix if present
  const cleanAbbr = opponentAbbr.replace(/^(vs |@ )/, '');
  
  return rankings[cleanAbbr] ?? null;
}
