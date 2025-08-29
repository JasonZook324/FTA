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
      throw new Error(`ESPN API Error: ${response.status} ${response.statusText}`);
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
    return this.getLeagueData(credentials, sport, season, leagueId, ['mRoster', 'mTeam']);
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
      const leagueData = await espnApiService.getLeagueData(
        credentials,
        sport,
        season,
        espnLeagueId,
        ['mTeam', 'mSettings']
      );

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
      const rostersData = await espnApiService.getRosters(
        credentials,
        league.sport,
        league.season,
        league.espnLeagueId
      );

      // Extract taken player IDs from all rosters
      const takenPlayerIds = new Set();
      if (rostersData.teams) {
        rostersData.teams.forEach((team: any) => {
          if (team.roster?.entries) {
            team.roster.entries.forEach((entry: any) => {
              if (entry.playerPoolEntry?.player?.id) {
                takenPlayerIds.add(entry.playerPoolEntry.player.id);
              }
            });
          }
        });
      }

      // Filter out taken players to get waiver wire
      const waiverWirePlayers = playersData.players?.filter((player: any) => 
        !takenPlayerIds.has(player.id)
      ) || [];

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

      const takenPlayerIds = new Set();
      if (rostersData.teams) {
        rostersData.teams.forEach((team: any) => {
          if (team.roster?.entries) {
            team.roster.entries.forEach((entry: any) => {
              if (entry.playerPoolEntry?.player?.id) {
                takenPlayerIds.add(entry.playerPoolEntry.player.id);
              }
            });
          }
        });
      }

      const waiverWirePlayers = playersData.players?.filter((player: any) => 
        !takenPlayerIds.has(player.id)
      ) || [];

      // Convert to CSV format
      const getPositionName = (positionId: number): string => {
        const positions: Record<number, string> = {
          1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K", 16: "DEF"
        };
        return positions[positionId] || "UNK";
      };

      const csvHeader = "Player Name,Position,Team,Ownership %,Status\n";
      const csvRows = waiverWirePlayers.map((player: any) => {
        const name = `"${player.fullName || 'Unknown'}"`;
        const position = getPositionName(player.defaultPositionId);
        const team = player.proTeamId ? `Team ${player.proTeamId}` : "Free Agent";
        const ownership = player.ownership?.percentOwned?.toFixed(1) || "0.0";
        const status = player.injured ? "Injured" : "Active";
        return `${name},${position},"${team}",${ownership}%,${status}`;
      }).join('\n');

      const csvContent = csvHeader + csvRows;

      // Set headers for file download
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="waiver-wire-${league.name.replace(/[^a-zA-Z0-9]/g, '-')}-${league.season}.csv"`);
      res.send(csvContent);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
