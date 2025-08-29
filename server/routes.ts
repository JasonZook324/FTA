import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { 
  insertEspnCredentialsSchema,
  insertLeagueSchema,
  type EspnCredentials 
} from "@shared/schema";
import { z } from "zod";

// ESPN API service
class EspnApiService {
  private readonly baseUrl = "https://lm-api-reads.fantasy.espn.com/apis/v3/games";
  
  private getHeaders(credentials: EspnCredentials) {
    return {
      'Cookie': `espn_s2=${credentials.espnS2}; SWID=${credentials.swid};`,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json'
    };
  }

  async validateCredentials(credentials: EspnCredentials): Promise<boolean> {
    try {
      // Test with a simple league endpoint
      const response = await fetch(
        `${this.baseUrl}/ffl/seasons/2025/segments/0/leaguedefaults/1?view=mSettings`,
        { 
          method: 'GET',
          headers: this.getHeaders(credentials)
        }
      );
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  async getLeagueData(
    credentials: EspnCredentials, 
    sport: string, 
    season: number, 
    leagueId: string,
    views: string[] = ['mTeam', 'mSettings']
  ) {
    const viewParam = views.join(',');
    const url = `${this.baseUrl}/${sport}/seasons/${season}/segments/0/leagues/${leagueId}?view=${viewParam}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: this.getHeaders(credentials)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      if (response.status === 404) {
        throw new Error(`League not found or access denied. Please check: 1) League ID is correct, 2) You're a member of this league, 3) Season year is correct (try 2024 instead of 2025), 4) League is not archived`);
      }
      if (response.status === 401) {
        throw new Error(`ESPN authentication failed. Your credentials don't have access to this league. Please check: 1) You're actually a member of this league, 2) Your ESPN cookies haven't expired, 3) League isn't set to private/friends-only, 4) Try refreshing your ESPN cookies`);
      }
      throw new Error(`ESPN API Error: ${response.status} ${response.statusText} - ${errorText}`);
    }
    
    return response.json();
  }

  async getStandings(
    credentials: EspnCredentials,
    sport: string,
    season: number,
    leagueId: string
  ) {
    return this.getLeagueData(credentials, sport, season, leagueId, ['mStandings', 'mTeam']);
  }

  async getMatchups(
    credentials: EspnCredentials,
    sport: string,
    season: number,
    leagueId: string,
    week?: number
  ) {
    const views = ['mMatchup', 'mMatchupScore'];
    const weekParam = week ? `&scoringPeriodId=${week}` : '';
    const viewParam = views.join(',');
    const url = `${this.baseUrl}/${sport}/seasons/${season}/segments/0/leagues/${leagueId}?view=${viewParam}${weekParam}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: this.getHeaders(credentials)
    });
    
    if (!response.ok) {
      throw new Error(`ESPN API Error: ${response.status} ${response.statusText}`);
    }
    
    return response.json();
  }

  async getRosters(
    credentials: EspnCredentials,
    sport: string,
    season: number,
    leagueId: string
  ) {
    // Try multiple ESPN API approaches to get roster data
    console.log('Attempting to get roster data with multiple methods...');
    
    // Method 1: Current scoring period with specific roster views
    const currentWeek = new Date().getMonth() < 8 ? 1 : Math.ceil((new Date().getTime() - new Date(season, 8, 1).getTime()) / (7 * 24 * 60 * 60 * 1000));
    const mainUrl = `${this.baseUrl}/${sport}/seasons/${season}/segments/0/leagues/${leagueId}?view=mRoster&view=mTeam&view=mMatchup&scoringPeriodId=${currentWeek}&nocache=${Date.now()}`;
    
    console.log('Main roster API URL:', mainUrl);
    
    const response = await fetch(mainUrl, {
      method: 'GET',
      headers: this.getHeaders(credentials)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ESPN Roster API Error: ${response.status} ${response.statusText} - ${errorText}`);
    }
    
    const data = await response.json();
    console.log('Main API returned keys:', Object.keys(data));
    
    // Method 2: If no roster in main response, try boxscore approach
    if (!data.teams?.[0]?.roster && data.schedule) {
      console.log('No direct roster data, trying boxscore approach...');
      
      for (const matchup of data.schedule.slice(0, 3)) { // Try first few matchups
        if (matchup.home?.teamId) {
          const boxscoreUrl = `${this.baseUrl}/${sport}/seasons/${season}/segments/0/leagues/${leagueId}?view=mBoxscore&view=mMatchup&scoringPeriodId=${currentWeek}`;
          
          const boxResponse = await fetch(boxscoreUrl, {
            method: 'GET', 
            headers: this.getHeaders(credentials)
          });
          
          if (boxResponse.ok) {
            const boxData = await boxResponse.json();
            console.log('Boxscore API returned keys:', Object.keys(boxData));
            
            // Check if boxscore has lineup data
            if (boxData.schedule?.[0]?.home?.roster || boxData.schedule?.[0]?.away?.roster) {
              console.log('Found roster data in boxscore!');
              return boxData;
            }
          }
        }
      }
    }
    
    return data;
  }

  async getPlayers(
    credentials: EspnCredentials,
    sport: string,
    season: number
  ) {
    const url = `${this.baseUrl}/${sport}/seasons/${season}/segments/0/leaguedefaults/1?view=kona_player_info`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        ...this.getHeaders(credentials),
        'X-Fantasy-Filter': JSON.stringify({
          "players": {
            "filterSlotIds": {"value": [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23]},
            "limit": 1000,
            "sortPercOwned": {"sortPriority": 1, "sortAsc": false}
          }
        })
      }
    });
    
    if (!response.ok) {
      throw new Error(`ESPN API Error: ${response.status} ${response.statusText}`);
    }
    
    return response.json();
  }
}

const espnApiService = new EspnApiService();

export async function registerRoutes(app: Express): Promise<Server> {
  // ESPN Credentials routes
  app.post("/api/espn-credentials", async (req, res) => {
    try {
      const validatedData = insertEspnCredentialsSchema.parse(req.body);
      
      // Validate credentials with ESPN API
      const isValid = await espnApiService.validateCredentials({
        ...validatedData,
        id: '',
        isValid: true,
        createdAt: new Date(),
        lastValidated: null
      });

      if (!isValid) {
        return res.status(400).json({ 
          message: "Invalid ESPN credentials. Please check your espn_s2 and SWID cookies." 
        });
      }

      // Check if credentials already exist for this user
      const existing = await storage.getEspnCredentials(validatedData.userId);
      
      let credentials: EspnCredentials;
      if (existing) {
        credentials = await storage.updateEspnCredentials(validatedData.userId, {
          ...validatedData,
          isValid: true,
          lastValidated: new Date()
        }) as EspnCredentials;
      } else {
        credentials = await storage.createEspnCredentials({
          ...validatedData,
          lastValidated: new Date()
        });
      }

      res.json({ message: "ESPN credentials saved successfully", credentials });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return res.status(400).json({ message: "Invalid request data", errors: error.errors });
      }
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/espn-credentials/:userId", async (req, res) => {
    try {
      const credentials = await storage.getEspnCredentials(req.params.userId);
      if (!credentials) {
        return res.status(404).json({ message: "ESPN credentials not found" });
      }
      res.json(credentials);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/espn-credentials/:userId/validate", async (req, res) => {
    try {
      const credentials = await storage.getEspnCredentials(req.params.userId);
      if (!credentials) {
        return res.status(404).json({ message: "ESPN credentials not found" });
      }

      const isValid = await espnApiService.validateCredentials(credentials);
      await storage.updateEspnCredentials(req.params.userId, {
        isValid,
        lastValidated: new Date()
      });

      res.json({ isValid, lastValidated: new Date() });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // League routes
  app.get("/api/leagues/:userId", async (req, res) => {
    try {
      const leagues = await storage.getLeagues(req.params.userId);
      res.json(leagues);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/leagues/:userId/load", async (req, res) => {
    try {
      const { espnLeagueId, sport, season } = req.body;
      const userId = req.params.userId;

      if (!espnLeagueId || !sport || !season) {
        return res.status(400).json({ 
          message: "Missing required fields: espnLeagueId, sport, season" 
        });
      }

      const credentials = await storage.getEspnCredentials(userId);
      if (!credentials || !credentials.isValid) {
        return res.status(401).json({ 
          message: "Valid ESPN credentials required. Please configure authentication first." 
        });
      }

      // Fetch league data from ESPN
      console.log(`Attempting to load league: ${espnLeagueId}, sport: ${sport}, season: ${season}`);
      
      let leagueData;
      try {
        leagueData = await espnApiService.getLeagueData(
          credentials,
          sport,
          season,
          espnLeagueId,
          ['mTeam', 'mSettings']
        );
        console.log('League data loaded successfully');
      } catch (apiError: any) {
        console.error('ESPN API Error Details:', {
          message: apiError.message,
          url: `https://lm-api-reads.fantasy.espn.com/apis/v3/games/${sport}/seasons/${season}/segments/0/leagues/${espnLeagueId}?view=mTeam,mSettings`,
          sport,
          season,
          leagueId: espnLeagueId
        });
        throw apiError;
      }

      // Parse and store league information
      const leagueInfo = {
        userId,
        espnLeagueId,
        name: leagueData.settings?.name || `League ${espnLeagueId}`,
        sport,
        season: parseInt(season),
        teamCount: leagueData.teams?.length || 0,
        currentWeek: leagueData.scoringPeriodId || 1,
        playoffTeams: leagueData.settings?.playoffTeamCount || 6,
        scoringType: leagueData.settings?.scoringType || "Head-to-Head Points",
        tradeDeadline: leagueData.settings?.tradeDeadline || null,
        settings: leagueData.settings || {}
      };

      const league = await storage.createLeague(leagueInfo);

      // Store teams
      if (leagueData.teams) {
        for (const team of leagueData.teams) {
          await storage.createTeam({
            espnTeamId: team.id,
            leagueId: league.id,
            name: team.location + ' ' + team.nickname || `Team ${team.id}`,
            owner: team.owners?.[0]?.displayName || team.owners?.[0]?.firstName + ' ' + team.owners?.[0]?.lastName,
            abbreviation: team.abbrev,
            logoUrl: team.logo,
            wins: team.record?.overall?.wins || 0,
            losses: team.record?.overall?.losses || 0,
            ties: team.record?.overall?.ties || 0,
            pointsFor: team.record?.overall?.pointsFor?.toString() || "0",
            pointsAgainst: team.record?.overall?.pointsAgainst?.toString() || "0",
            streak: team.record?.overall?.streakType + team.record?.overall?.streakLength || null,
            rank: team.playoffSeed || team.draftDayProjectedRank || null
          });
        }
      }

      res.json({ league, teams: await storage.getTeams(league.id) });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Standings route
  app.get("/api/leagues/:leagueId/standings", async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.leagueId);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }

      const credentials = await storage.getEspnCredentials(league.userId);
      if (!credentials || !credentials.isValid) {
        return res.status(401).json({ message: "Valid ESPN credentials required" });
      }

      const standingsData = await espnApiService.getStandings(
        credentials,
        league.sport,
        league.season,
        league.espnLeagueId
      );

      res.json(standingsData);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Matchups route
  app.get("/api/leagues/:leagueId/matchups", async (req, res) => {
    try {
      const { week } = req.query;
      const league = await storage.getLeague(req.params.leagueId);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }

      const credentials = await storage.getEspnCredentials(league.userId);
      if (!credentials || !credentials.isValid) {
        return res.status(401).json({ message: "Valid ESPN credentials required" });
      }

      const matchupsData = await espnApiService.getMatchups(
        credentials,
        league.sport,
        league.season,
        league.espnLeagueId,
        week ? parseInt(week as string) : undefined
      );

      res.json(matchupsData);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Rosters route
  app.get("/api/leagues/:leagueId/rosters", async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.leagueId);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }

      const credentials = await storage.getEspnCredentials(league.userId);
      if (!credentials || !credentials.isValid) {
        return res.status(401).json({ message: "Valid ESPN credentials required" });
      }

      const rostersData = await espnApiService.getRosters(
        credentials,
        league.sport,
        league.season,
        league.espnLeagueId
      );

      res.json(rostersData);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Players route
  app.get("/api/players/:sport/:season", async (req, res) => {
    try {
      const { sport, season } = req.params;
      const { userId } = req.query;

      if (!userId) {
        return res.status(400).json({ message: "User ID required" });
      }

      const credentials = await storage.getEspnCredentials(userId as string);
      if (!credentials || !credentials.isValid) {
        return res.status(401).json({ message: "Valid ESPN credentials required" });
      }

      const playersData = await espnApiService.getPlayers(
        credentials,
        sport,
        parseInt(season)
      );

      res.json(playersData);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Teams route
  app.get("/api/leagues/:leagueId/teams", async (req, res) => {
    try {
      const teams = await storage.getTeams(req.params.leagueId);
      res.json(teams);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Waiver wire route - get available players not on any roster
  app.get("/api/leagues/:leagueId/waiver-wire", async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.leagueId);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }

      const credentials = await storage.getEspnCredentials(league.userId);
      if (!credentials || !credentials.isValid) {
        return res.status(401).json({ message: "Valid ESPN credentials required" });
      }

      // Get all players
      const playersData = await espnApiService.getPlayers(
        credentials,
        league.sport,
        league.season
      );

      // Get all rosters to identify taken players
      console.log('Fetching rosters for league:', league.espnLeagueId);
      const rostersData = await espnApiService.getRosters(
        credentials,
        league.sport,
        league.season,
        league.espnLeagueId
      );

      // Extract taken player IDs from all rosters
      const takenPlayerIds = new Set();

      // Parse roster data from multiple possible locations
      const extractPlayerIds = (roster: any, source: string) => {
        if (!roster?.entries) return;
        
        roster.entries.forEach((entry: any) => {
          const playerId = entry.playerPoolEntry?.player?.id || 
                          entry.player?.id || 
                          entry.playerId ||
                          entry.id;
          
          if (playerId) {
            takenPlayerIds.add(playerId);
            console.log(`Found taken player ID from ${source}:`, playerId);
          }
        });
      };

      // Method 1: Check teams directly
      if (rostersData.teams) {
        rostersData.teams.forEach((team: any, index: number) => {
          const roster = team.roster || team.rosterForCurrentScoringPeriod || team.rosterForMatchupPeriod;
          if (roster) {
            extractPlayerIds(roster, `team-${index}`);
          }
        });
      }

      // Method 2: Check schedule/matchups for roster data 
      if (rostersData.schedule) {
        rostersData.schedule.forEach((matchup: any, matchupIndex: number) => {
          ['home', 'away'].forEach(side => {
            const team = matchup[side];
            
            // Check multiple roster locations in matchup data
            const roster = team?.roster || 
                          team?.rosterForCurrentScoringPeriod || 
                          team?.rosterForMatchupPeriod;
            
            if (roster) {
              extractPlayerIds(roster, `matchup-${matchupIndex}-${side}`);
            }
          });
        });
      }

      // Method 3: Check if there's lineup data in a different structure
      if (rostersData.teams) {
        rostersData.teams.forEach((team: any, index: number) => {
          // Some ESPN responses have lineup data separately
          if (team.lineup) {
            team.lineup.forEach((player: any) => {
              if (player.playerId) {
                takenPlayerIds.add(player.playerId);
                console.log(`Found taken player ID from lineup-${index}:`, player.playerId);
              }
            });
          }
        });
      }

      console.log(`Found ${takenPlayerIds.size} taken players out of ${playersData.players?.length || 0} total players`);
      console.log('Sample taken player IDs:', Array.from(takenPlayerIds).slice(0, 5));
      console.log('Sample player IDs from players list:', playersData.players?.slice(0, 5).map((p: any) => p.id));

      // Filter out taken players to get waiver wire
      const waiverWirePlayers = playersData.players?.filter((player: any) => 
        !takenPlayerIds.has(player.id)
      ) || [];

      console.log(`After filtering: ${waiverWirePlayers.length} available players`);

      res.json({ 
        players: waiverWirePlayers,
        total: waiverWirePlayers.length,
        takenPlayers: takenPlayerIds.size
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Export waiver wire as CSV
  app.get("/api/leagues/:leagueId/waiver-wire/export", async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.leagueId);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }

      const credentials = await storage.getEspnCredentials(league.userId);
      if (!credentials || !credentials.isValid) {
        return res.status(401).json({ message: "Valid ESPN credentials required" });
      }

      // Get waiver wire players (reuse logic from above)
      const playersData = await espnApiService.getPlayers(
        credentials,
        league.sport,
        league.season
      );

      const rostersData = await espnApiService.getRosters(
        credentials,
        league.sport,
        league.season,
        league.espnLeagueId
      );

      // Use the same comprehensive roster detection logic as the main waiver wire route
      const takenPlayerIds = new Set();
      
      // Parse roster data from multiple possible locations
      const extractPlayerIds = (roster: any, source: string) => {
        if (!roster?.entries) return;
        
        roster.entries.forEach((entry: any) => {
          const playerId = entry.playerPoolEntry?.player?.id || 
                          entry.player?.id || 
                          entry.playerId ||
                          entry.id;
          
          if (playerId) {
            takenPlayerIds.add(playerId);
          }
        });
      };

      // Method 1: Check teams directly
      if (rostersData.teams) {
        rostersData.teams.forEach((team: any, index: number) => {
          const roster = team.roster || team.rosterForCurrentScoringPeriod || team.rosterForMatchupPeriod;
          if (roster) {
            extractPlayerIds(roster, `team-${index}`);
          }
        });
      }

      // Method 2: Check schedule/matchups for roster data 
      if (rostersData.schedule) {
        rostersData.schedule.forEach((matchup: any, matchupIndex: number) => {
          ['home', 'away'].forEach(side => {
            const team = matchup[side];
            
            // Check multiple roster locations in matchup data
            const roster = team?.roster || 
                          team?.rosterForCurrentScoringPeriod || 
                          team?.rosterForMatchupPeriod;
            
            if (roster) {
              extractPlayerIds(roster, `matchup-${matchupIndex}-${side}`);
            }
          });
        });
      }

      // Method 3: Check if there's lineup data in a different structure
      if (rostersData.teams) {
        rostersData.teams.forEach((team: any, index: number) => {
          // Some ESPN responses have lineup data separately
          if (team.lineup) {
            team.lineup.forEach((player: any) => {
              if (player.playerId) {
                takenPlayerIds.add(player.playerId);
              }
            });
          }
        });
      }

      const waiverWirePlayers = playersData.players?.filter((player: any) => 
        !takenPlayerIds.has(player.id)
      ) || [];


      // Helper functions to match frontend data mapping
      const getTeamName = (teamId: number): string => {
        const teamNames: Record<number, string> = {
          1: "ATL", 2: "BUF", 3: "CHI", 4: "CIN", 5: "CLE", 6: "DAL", 7: "DEN", 8: "DET",
          9: "GB", 10: "TEN", 11: "IND", 12: "KC", 13: "LV", 14: "LAR", 15: "MIA", 16: "MIN",
          17: "NE", 18: "NO", 19: "NYG", 20: "NYJ", 21: "PHI", 22: "ARI", 23: "PIT", 24: "LAC",
          25: "SF", 26: "SEA", 27: "TB", 28: "WAS", 29: "CAR", 30: "JAX", 33: "BAL", 34: "HOU"
        };
        return teamNames[teamId] || `Team ${teamId}`;
      };

      const getPositionName = (positionId: number): string => {
        const positions: Record<number, string> = {
          0: "QB", 1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K", 
          16: "DEF", 17: "K", 23: "FLEX"
        };
        return positions[positionId] || `POS_${positionId}`;
      };

      const getPlayerName = (playerData: any): string => {
        const player = playerData.player || playerData;
        return player.fullName || player.name || player.displayName || 
               (player.firstName && player.lastName ? `${player.firstName} ${player.lastName}` : 'Unknown Player');
      };

      const getPlayerPositionId = (playerData: any): number => {
        const player = playerData.player || playerData;
        return player.defaultPositionId ?? player.positionId ?? player.position ?? 0;
      };

      const getProTeamId = (playerData: any): number => {
        const player = playerData.player || playerData;
        return player.proTeamId;
      };

      const getOwnershipPercent = (playerData: any): string => {
        const player = playerData.player || playerData;
        return player.ownership?.percentOwned?.toFixed(1) || "0.0";
      };

      const getInjuryStatus = (playerData: any): string => {
        const player = playerData.player || playerData;
        return player.injured || player.injuryStatus === 'INJURED' ? 'Injured' : 'Active';
      };

      const getProjectedPoints = (playerData: any): string => {
        const player = playerData.player || playerData;
        const projection = player.stats?.find((stat: any) => stat.statSourceId === 1 && stat.statSplitTypeId === 1) ||
                          player.projectedStats ||
                          player.outlook?.projectedStats;
        
        if (projection?.appliedTotal !== undefined) {
          return projection.appliedTotal.toFixed(1);
        }
        if (projection?.total !== undefined) {
          return projection.total.toFixed(1);
        }
        return "-";
      };

      const getOpponent = (playerData: any): string => {
        const player = playerData.player || playerData;
        const opponent = player.opponent || 
                        player.nextOpponent ||
                        player.schedule?.find((game: any) => game.isThisWeek);
        
        if (opponent?.teamId) {
          return `vs ${getTeamName(opponent.teamId)}`;
        }
        if (opponent?.opponentTeamId) {
          return `vs ${getTeamName(opponent.opponentTeamId)}`;
        }
        return "-";
      };

      const csvHeader = "Player Name,Position,Team,Opponent,Projected Points,Ownership %,Status\n";
      const csvRows = waiverWirePlayers.map((playerData: any) => {
        const name = `"${getPlayerName(playerData)}"`;
        const position = getPositionName(getPlayerPositionId(playerData));
        const team = getProTeamId(playerData) ? getTeamName(getProTeamId(playerData)) : "Free Agent";
        const opponent = getOpponent(playerData);
        const projectedPoints = getProjectedPoints(playerData);
        const ownership = getOwnershipPercent(playerData);
        const status = getInjuryStatus(playerData);
        
        return `${name},${position},"${team}","${opponent}",${projectedPoints},${ownership}%,${status}`;
      }).join('\n');

      const csvContent = csvHeader + csvRows;


      // Set headers for file download with cache busting
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="waiver-wire-${Date.now()}.csv"`);
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.send(csvContent);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Export roster details for all teams
  app.get('/api/leagues/:id/roster-export', async (req, res) => {
    try {
      const leagueId = req.params.id;
      const league = await storage.getLeague(leagueId);
      
      if (!league) {
        return res.status(404).json({ message: 'League not found' });
      }

      const credentials = await storage.getESPNCredentials('default-user');
      if (!credentials) {
        return res.status(404).json({ message: 'ESPN credentials not found' });
      }

      // Get roster data using the same method as waiver wire
      const rostersUrl = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${league.season}/segments/0/leagues/${league.espnLeagueId}?view=mRoster&view=mTeam&view=mMatchup&scoringPeriodId=1`;
      const rostersResponse = await fetch(rostersUrl, {
        headers: { 'Cookie': `espn_s2=${credentials.espnS2}; SWID=${credentials.swid}` }
      });
      
      if (!rostersResponse.ok) {
        throw new Error(`Failed to fetch roster data: ${rostersResponse.status}`);
      }
      
      const rostersData = await rostersResponse.json();
      
      
      // Get players data for mapping
      const playersUrl = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${league.season}/players?view=players_wl&view=kona_player_info&scoringPeriodId=1`;
      const playersResponse = await fetch(playersUrl, {
        headers: { 'Cookie': `espn_s2=${credentials.espnS2}; SWID=${credentials.swid}` }
      });
      
      const playersData = playersResponse.ok ? await playersResponse.json() : { players: [] };
      
      // Create a map of player ID to player data for quick lookup
      const playerMap = new Map();
      if (playersData.players) {
        playersData.players.forEach((player: any) => {
          playerMap.set(player.id, player);
        });
      }

      // Helper functions (reuse from waiver wire)
      const getTeamName = (teamId: number): string => {
        const teamNames: Record<number, string> = {
          1: "ATL", 2: "BUF", 3: "CHI", 4: "CIN", 5: "CLE", 6: "DAL", 7: "DEN", 8: "DET",
          9: "GB", 10: "TEN", 11: "IND", 12: "KC", 13: "LV", 14: "LAR", 15: "MIA", 16: "MIN",
          17: "NE", 18: "NO", 19: "NYG", 20: "NYJ", 21: "PHI", 22: "ARI", 23: "PIT", 24: "LAC",
          25: "SF", 26: "SEA", 27: "TB", 28: "WAS", 29: "CAR", 30: "JAX", 33: "BAL", 34: "HOU"
        };
        return teamNames[teamId] || `Team ${teamId}`;
      };

      const getPositionName = (positionId: number): string => {
        const positions: Record<number, string> = {
          0: "QB", 1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K", 
          16: "DEF", 17: "K", 23: "FLEX"
        };
        return positions[positionId] || `POS_${positionId}`;
      };

      const getPlayerName = (playerData: any): string => {
        const player = playerData.player || playerData;
        return player.fullName || player.name || player.displayName || 
               (player.firstName && player.lastName ? `${player.firstName} ${player.lastName}` : 'Unknown Player');
      };

      const getPlayerPositionId = (playerData: any): number => {
        const player = playerData.player || playerData;
        return player.defaultPositionId ?? player.positionId ?? player.position ?? 0;
      };

      const getProTeamId = (playerData: any): number => {
        const player = playerData.player || playerData;
        return player.proTeamId;
      };

      const getProjectedPoints = (playerData: any): string => {
        const player = playerData.player || playerData;
        const projection = player.stats?.find((stat: any) => stat.statSourceId === 1 && stat.statSplitTypeId === 1) ||
                          player.projectedStats ||
                          player.outlook?.projectedStats;
        
        if (projection?.appliedTotal !== undefined) {
          return projection.appliedTotal.toFixed(1);
        }
        if (projection?.total !== undefined) {
          return projection.total.toFixed(1);
        }
        return "-";
      };

      const getInjuryStatus = (playerData: any): string => {
        const player = playerData.player || playerData;
        return player.injured || player.injuryStatus === 'INJURED' ? 'Injured' : 'Active';
      };

      // Collect all roster data
      const rosterData: any[] = [];
      
      // Extract roster data from teams and schedule/matchups
      const processRoster = (roster: any, fantasyTeamName: string, fantasyTeamId: number) => {
        if (!roster?.entries) return;
        
        roster.entries.forEach((entry: any) => {
          const playerId = entry.playerPoolEntry?.player?.id || 
                          entry.player?.id || 
                          entry.playerId ||
                          entry.id;
          
          if (playerId) {
            // Get player data from the players API or from the entry itself
            const playerData = playerMap.get(playerId) || entry.playerPoolEntry || entry;
            
            rosterData.push({
              fantasyTeam: fantasyTeamName,
              fantasyTeamId: fantasyTeamId,
              playerData: playerData,
              playerId: playerId
            });
          }
        });
      };

      // Method 1: Check teams directly
      if (rostersData.teams) {
        rostersData.teams.forEach((team: any) => {
          const roster = team.roster || team.rosterForCurrentScoringPeriod || team.rosterForMatchupPeriod;
          if (roster) {
            // More robust team name extraction
            const location = team.location || team.name || '';
            const nickname = team.nickname || team.mascot || '';
            const teamId = team.id || 'Unknown';
            
            let teamName = '';
            if (location && nickname) {
              teamName = `${location} ${nickname}`;
            } else if (location || nickname) {
              teamName = location || nickname;
            } else {
              teamName = `Team ${teamId}`;
            }
            
            processRoster(roster, teamName, team.id);
          }
        });
      }

      // Method 2: Check schedule/matchups for roster data if teams method didn't work
      if (rosterData.length === 0 && rostersData.schedule) {
        rostersData.schedule.forEach((matchup: any) => {
          ['home', 'away'].forEach(side => {
            const team = matchup[side];
            
            const roster = team?.roster || 
                          team?.rosterForCurrentScoringPeriod || 
                          team?.rosterForMatchupPeriod;
            
            if (roster) {
              // More robust team name extraction for schedule data
              const teamData = team.team || team;
              const location = teamData.location || teamData.name || '';
              const nickname = teamData.nickname || teamData.mascot || '';
              const teamId = team.teamId || teamData.id || 'Unknown';
              
              let teamName = '';
              if (location && nickname) {
                teamName = `${location} ${nickname}`;
              } else if (location || nickname) {
                teamName = location || nickname;
              } else {
                teamName = `Team ${teamId}`;
              }
              
              processRoster(roster, teamName, team.teamId || 0);
            }
          });
        });
      }

      // Generate CSV
      const csvHeader = "Fantasy Team,Player Name,Position,NFL Team,Projected Points,Status\n";
      const csvRows = rosterData.map((entry: any) => {
        const fantasyTeam = `"${entry.fantasyTeam}"`;
        const name = `"${getPlayerName(entry.playerData)}"`;
        const position = getPositionName(getPlayerPositionId(entry.playerData));
        const nflTeam = getProTeamId(entry.playerData) ? getTeamName(getProTeamId(entry.playerData)) : "Free Agent";
        const projectedPoints = getProjectedPoints(entry.playerData);
        const status = getInjuryStatus(entry.playerData);
        
        return `${fantasyTeam},${name},${position},"${nflTeam}",${projectedPoints},${status}`;
      }).join('\n');

      const csvContent = csvHeader + csvRows;


      // Set headers for file download with cache busting
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="roster-export-${Date.now()}.csv"`);
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.send(csvContent);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Export individual team roster
  app.get('/api/leagues/:id/teams/:teamId/roster-export', async (req, res) => {
    console.log(`Team export endpoint hit: leagueId=${req.params.id}, teamId=${req.params.teamId}`);
    try {
      const leagueId = req.params.id;
      const teamId = parseInt(req.params.teamId);
      console.log(`Parsed teamId: ${teamId}`);
      
      console.log(`Getting league: ${leagueId}`);
      const league = await storage.getLeague(leagueId);
      
      if (!league) {
        console.log(`League not found: ${leagueId}`);
        return res.status(404).json({ message: 'League not found' });
      }
      console.log(`League found:`, league);

      console.log(`Getting credentials for default-user`);
      const credentials = await storage.getESPNCredentials('default-user');
      if (!credentials) {
        console.log(`ESPN credentials not found`);
        return res.status(404).json({ message: 'ESPN credentials not found' });
      }
      console.log(`Credentials found`);

      console.log(`About to fetch roster data...`);

      // Get roster data using the same method as full roster export
      const rostersUrl = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${league.season}/segments/0/leagues/${league.espnLeagueId}?view=mRoster&view=mTeam&view=mMatchup&scoringPeriodId=1&nocache=${Date.now()}`;
      const rostersResponse = await fetch(rostersUrl, {
        headers: { 'Cookie': `espn_s2=${credentials.espnS2}; SWID=${credentials.swid}` }
      });
      
      if (!rostersResponse.ok) {
        throw new Error(`Failed to fetch roster data: ${rostersResponse.status}`);
      }
      
      const rostersData = await rostersResponse.json();
      
      // Find the specific team
      const team = rostersData.teams?.find((t: any) => t.id === teamId);
      if (!team) {
        return res.status(404).json({ message: 'Team not found' });
      }

      // Get players data for mapping
      const playersUrl = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${league.season}/players?view=players_wl&view=kona_player_info&scoringPeriodId=1`;
      const playersResponse = await fetch(playersUrl, {
        headers: { 'Cookie': `espn_s2=${credentials.espnS2}; SWID=${credentials.swid}` }
      });
      
      const playersData = playersResponse.ok ? await playersResponse.json() : { players: [] };
      
      // Create a map of player ID to player data for quick lookup
      const playerMap = new Map();
      if (playersData.players) {
        playersData.players.forEach((player: any) => {
          playerMap.set(player.id, player);
        });
      }

      // Helper functions (reuse from full roster export)
      const getNFLTeamName = (teamId: number): string => {
        const teamNames: Record<number, string> = {
          1: "ATL", 2: "BUF", 3: "CHI", 4: "CIN", 5: "CLE", 6: "DAL", 7: "DEN", 8: "DET",
          9: "GB", 10: "TEN", 11: "IND", 12: "KC", 13: "LV", 14: "LAR", 15: "MIA", 16: "MIN",
          17: "NE", 18: "NO", 19: "NYG", 20: "NYJ", 21: "PHI", 22: "ARI", 23: "PIT", 24: "LAC",
          25: "SF", 26: "SEA", 27: "TB", 28: "WAS", 29: "CAR", 30: "JAX", 33: "BAL", 34: "HOU"
        };
        return teamNames[teamId] || "FA";
      };

      const getPositionName = (positionId: number): string => {
        const positions: Record<number, string> = {
          0: "QB", 1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K", 
          16: "DEF", 17: "K", 23: "FLEX"
        };
        return positions[positionId] || `POS_${positionId}`;
      };

      const getPlayerName = (playerData: any): string => {
        const player = playerData.player || playerData;
        return player.fullName || player.name || player.displayName || 
               (player.firstName && player.lastName ? `${player.firstName} ${player.lastName}` : 'Unknown Player');
      };

      const getPlayerPositionId = (playerData: any): number => {
        const player = playerData.player || playerData;
        return player.defaultPositionId ?? player.positionId ?? player.position ?? 0;
      };

      const getProTeamId = (playerData: any): number => {
        const player = playerData.player || playerData;
        return player.proTeamId;
      };

      const getProjectedPoints = (playerData: any): string => {
        const player = playerData.player || playerData;
        const projection = player.stats?.find((stat: any) => stat.statSourceId === 1 && stat.statSplitTypeId === 1) ||
                          player.projectedStats ||
                          player.outlook?.projectedStats;
        
        if (projection?.appliedTotal !== undefined) {
          return projection.appliedTotal.toFixed(1);
        }
        if (projection?.total !== undefined) {
          return projection.total.toFixed(1);
        }
        return "-";
      };

      const getInjuryStatus = (playerData: any): string => {
        const player = playerData.player || playerData;
        return player.injured || player.injuryStatus === 'INJURED' ? 'Injured' : 'Active';
      };

      const getLineupSlotName = (slotId: number): string => {
        const slots: Record<number, string> = {
          0: "QB", 2: "RB", 4: "WR", 6: "TE", 17: "K", 16: "DEF",
          20: "Bench", 21: "IR", 23: "FLEX"
        };
        return slots[slotId] || `Slot_${slotId}`;
      };

      // Get team name
      const getTeamName = (team: any) => {
        const location = team.location || team.name || '';
        const nickname = team.nickname || team.mascot || '';
        
        if (location && nickname) {
          return `${location} ${nickname}`;
        } else if (location || nickname) {
          return location || nickname;
        } else {
          return `Team ${team.id}`;
        }
      };

      const fantasyTeamName = getTeamName(team);

      // Process team roster
      const roster = team.roster || team.rosterForCurrentScoringPeriod || team.rosterForMatchupPeriod;
      const rosterData: any[] = [];
      
      if (roster?.entries) {
        roster.entries.forEach((entry: any) => {
          const playerId = entry.playerPoolEntry?.player?.id || 
                          entry.player?.id || 
                          entry.playerId ||
                          entry.id;
          
          if (playerId) {
            // Get player data from the players API or from the entry itself
            const playerData = playerMap.get(playerId) || entry.playerPoolEntry || entry;
            
            rosterData.push({
              playerData: playerData,
              lineupSlotId: entry.lineupSlotId
            });
          }
        });
      }

      // Generate CSV
      const csvHeader = "Player Name,Position,NFL Team,Lineup Slot,Projected Points,Status\n";
      const csvRows = rosterData.map((entry: any) => {
        const name = `"${getPlayerName(entry.playerData)}"`;
        const position = getPositionName(getPlayerPositionId(entry.playerData));
        const nflTeam = getProTeamId(entry.playerData) ? getNFLTeamName(getProTeamId(entry.playerData)) : "FA";
        const lineupSlot = getLineupSlotName(entry.lineupSlotId);
        const projectedPoints = getProjectedPoints(entry.playerData);
        const status = getInjuryStatus(entry.playerData);
        
        return `${name},${position},"${nflTeam}","${lineupSlot}",${projectedPoints},${status}`;
      }).join('\n');

      const csvContent = csvHeader + csvRows;

      // Set headers for file download with cache busting
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="roster-${fantasyTeamName.replace(/[^a-zA-Z0-9]/g, '-')}-${Date.now()}.csv"`);
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.send(csvContent);
    } catch (error: any) {
      console.error('Team export error:', error);
      console.error('Error stack:', error.stack);
      res.status(500).json({ message: error.message });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
