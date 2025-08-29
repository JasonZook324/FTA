// ESPN Fantasy API v3 utilities and helpers
export const ESPN_BASE_URL = "https://lm-api-reads.fantasy.espn.com/apis/v3/games";

export const SPORT_CODES = {
  ffl: "Football (NFL)",
  fba: "Basketball (NBA)", 
  fhk: "Hockey (NHL)",
  flb: "Baseball (MLB)"
} as const;

export const VIEW_PARAMETERS = {
  // League Information
  TEAM_INFO: "mTeam",
  ROSTER: "mRoster", 
  MATCHUP: "mMatchup",
  SETTINGS: "mSettings",
  STANDINGS: "mStandings",
  
  // Player Data
  PLAYER_INFO: "kona_player_info",
  PLAYER_WATCHLIST: "players_wl",
  PLAYER_CARD: "kona_playercard",
  
  // Draft Information
  DRAFT_DETAIL: "mDraftDetail",
  DRAFT: "mDraft",
  
  // Scoring & Matchups
  MATCHUP_SCORE: "mMatchupScore",
  BOXSCORE: "mBoxscore",
  SCOREBOARD: "mScoreboard"
} as const;

export const LINEUP_SLOT_IDS = {
  QB: 0,
  RB: 2,
  WR: 4,
  TE: 6,
  FLEX: 23,
  K: 17,
  DST: 16,
  BENCH: 20,
  IR: 21
} as const;

export const buildEspnUrl = (
  sport: string,
  season: number,
  leagueId: string,
  views: string[] = [],
  additionalParams: Record<string, string> = {}
) => {
  const baseUrl = `${ESPN_BASE_URL}/${sport}/seasons/${season}/segments/0/leagues/${leagueId}`;
  const params = new URLSearchParams();
  
  if (views.length > 0) {
    params.append('view', views.join(','));
  }
  
  Object.entries(additionalParams).forEach(([key, value]) => {
    params.append(key, value);
  });
  
  return `${baseUrl}${params.toString() ? '?' + params.toString() : ''}`;
};

export const buildPlayersUrl = (sport: string, season: number) => {
  return `${ESPN_BASE_URL}/${sport}/seasons/${season}/segments/0/leaguedefaults/1?view=${VIEW_PARAMETERS.PLAYER_INFO}`;
};

export const buildHistoricalUrl = (leagueId: string, season: number) => {
  return `${ESPN_BASE_URL}/ffl/leagueHistory/${leagueId}?seasonId=${season}`;
};

export const getPlayerFilterHeader = (limit = 1000) => {
  return JSON.stringify({
    "players": {
      "filterSlotIds": {
        "value": [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23]
      },
      "limit": limit,
      "sortPercOwned": {
        "sortPriority": 1,
        "sortAsc": false
      }
    }
  });
};

export const parseTeamRecord = (team: any) => {
  const record = team.record?.overall;
  return {
    wins: record?.wins || 0,
    losses: record?.losses || 0,
    ties: record?.ties || 0,
    pointsFor: record?.pointsFor || 0,
    pointsAgainst: record?.pointsAgainst || 0,
    winPercentage: record ? (record.wins / (record.wins + record.losses + record.ties)) : 0
  };
};

export const parsePlayerPosition = (positionId: number): string => {
  const positions: Record<number, string> = {
    0: "QB",
    1: "QB", 
    2: "RB",
    3: "RB/WR",
    4: "WR",
    5: "WR/TE",
    6: "TE",
    7: "OP",
    8: "DT",
    9: "DE",
    10: "LB",
    11: "DL",
    12: "CB",
    13: "S",
    14: "DB",
    15: "DP",
    16: "D/ST",
    17: "K",
    18: "P",
    19: "HC",
    20: "Bench",
    21: "IR"
  };
  return positions[positionId] || "UNK";
};
