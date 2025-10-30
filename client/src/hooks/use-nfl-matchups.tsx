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
