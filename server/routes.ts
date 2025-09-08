import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { 
  insertEspnCredentialsSchema,
  insertLeagueSchema,
  type EspnCredentials 
} from "@shared/schema";
import { z } from "zod";
import { geminiService } from './geminiService';

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
      console.log('ESPN API validation - testing credentials with user-provided league...');
      
      // Use the specific league ID and season provided by the user for validation
      if (!credentials.testLeagueId || !credentials.testSeason) {
        console.log('ESPN API validation - FAILED: No test league ID or season provided');
        return false;
      }
      
      const testUrl = `${this.baseUrl}/ffl/seasons/${credentials.testSeason}/segments/0/leagues/${credentials.testLeagueId}?view=mTeam`;
      console.log(`ESPN API test URL:`, testUrl);
      
      try {
        const response = await fetch(testUrl, { 
          method: 'GET',
          headers: this.getHeaders(credentials)
        });
        
        console.log(`ESPN API response status:`, response.status);
        
        // Invalid credentials return 401 Unauthorized - definitive proof credentials are bad
        if (response.status === 401) {
          console.log(`ESPN API validation - FAILED: Got 401 Unauthorized, credentials are invalid`);
          return false;
        }
        
        // Forbidden usually means authenticated but no access to this specific league
        if (response.status === 403) {
          console.log(`ESPN API validation - Got 403 Forbidden - credentials are valid but no access to this league`);
          return true;
        }
        
        // 200 means credentials are valid and have access
        if (response.status === 200) {
          console.log(`ESPN API validation - SUCCESS: Got 200, credentials are valid and have league access`);
          return true;
        }
        
        // 404 could mean invalid creds or league doesn't exist - check response details
        if (response.status === 404) {
          try {
            const errorData = await response.json();
            console.log(`ESPN API validation - Got 404, checking response:`, errorData);
            
            // Check if the error message indicates authentication issues
            if (errorData.messages && errorData.messages.some((msg: any) => 
                msg.message && (
                  msg.message.toLowerCase().includes('unauthorized') ||
                  msg.message.toLowerCase().includes('authentication') ||
                  msg.message.toLowerCase().includes('login') ||
                  msg.message.toLowerCase().includes('access denied')
                )
              )) {
              console.log(`ESPN API validation - FAILED: 404 with auth-related error, credentials are invalid`);
              return false;
            }
            
            // If it's just "not found" without auth errors, user may have provided wrong league/season
            // But credentials might still be valid - this is ambiguous
            console.log(`ESPN API validation - Got 404 but no clear auth error. League may not exist or user may not have access.`);
            console.log(`ESPN API validation - Assuming INVALID for security - user should verify League ID and Season are correct`);
            return false;
            
          } catch (parseError) {
            console.log(`ESPN API validation - Failed to parse 404 response:`, parseError);
            return false;
          }
        }
        
        // Other error codes
        if (!response.ok) {
          const errorText = await response.text();
          console.log(`ESPN API error: ${response.status} - ${errorText}`);
          return false;
        }
        
      } catch (requestError) {
        console.log(`ESPN API validation - request error:`, requestError);
        return false;
      }
      
      // Should not reach here, but assume invalid for safety
      console.log('ESPN API validation - FAILED: Unexpected code path, assuming invalid');
      return false;
      
    } catch (error) {
      console.log('ESPN API validation error:', error);
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
    // Try different view combinations to get schedule data
    const views = ['mMatchup', 'mMatchupScore', 'mTeam', 'mSchedule'];
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
    
    const data = await response.json();
    
    // If no schedule data, try alternative ESPN views for matchups
    if (!data.schedule) {
      const altViews = ['mBoxscore', 'mMatchup', 'mTeam'];
      const altUrl = `${this.baseUrl}/${sport}/seasons/${season}/segments/0/leagues/${leagueId}?view=${altViews.join(',')}${weekParam}`;
      
      const altResponse = await fetch(altUrl, {
        method: 'GET',
        headers: this.getHeaders(credentials)
      });
      
      if (altResponse.ok) {
        const altData = await altResponse.json();
        if (altData.schedule) {
          return altData;
        }
      }
    }
    
    return data;
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
      console.log('Received ESPN credentials request:', JSON.stringify(req.body, null, 2));
      const validatedData = insertEspnCredentialsSchema.parse(req.body);
      
      // Validate credentials with ESPN API
      console.log('Validating credentials with ESPN API...');
      const testCredentials = {
        ...validatedData,
        id: '',
        isValid: true,
        createdAt: new Date(),
        lastValidated: null
      };
      console.log('Test credentials object:', { userId: testCredentials.userId, espnS2: testCredentials.espnS2?.substring(0, 20) + '...', swid: testCredentials.swid });
      
      const isValid = await espnApiService.validateCredentials(testCredentials);
      console.log('ESPN API validation result:', isValid);

      if (!isValid) {
        console.log('ESPN credentials validation failed');
        return res.status(400).json({ 
          message: "Invalid ESPN credentials. Please check your espn_s2 and SWID cookies." 
        });
      }

      // Check if credentials already exist for this user
      let existing;
      try {
        existing = await storage.getEspnCredentials(validatedData.userId);
      } catch (dbError) {
        console.error('Database error when checking existing credentials:', dbError);
        return res.status(500).json({ 
          message: "Database connection error. Please try again in a moment." 
        });
      }
      
      let credentials: EspnCredentials;
      try {
        if (existing) {
          credentials = await storage.updateEspnCredentials(validatedData.userId, {
            ...validatedData,
            isValid: true,
            lastValidated: new Date()
          }) as EspnCredentials;
        } else {
          credentials = await storage.createEspnCredentials({
            ...validatedData
          });
        }
      } catch (dbError) {
        console.error('Database error when saving credentials:', dbError);
        return res.status(500).json({ 
          message: "Failed to save credentials due to database error. Please try again." 
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
      console.error('Database error in GET credentials:', error);
      res.status(500).json({ message: "Database connection error. Please refresh the page and try again." });
    }
  });

  // Reload league data (delete existing and re-import)
  app.post("/api/espn-credentials/:userId/reload-league", async (req, res) => {
    try {
      const userId = req.params.userId;
      console.log(`Reload league request for user: ${userId}`);
      
      const credentials = await storage.getEspnCredentials(userId);
      if (!credentials || !credentials.isValid) {
        console.log(`Invalid or missing credentials for user: ${userId}`);
        return res.status(401).json({ message: "Valid ESPN credentials required" });
      }

      if (!credentials.testLeagueId || !credentials.testSeason) {
        console.log(`Missing league ID or season: ${credentials.testLeagueId}, ${credentials.testSeason}`);
        return res.status(400).json({ message: "League ID and season required" });
      }

      console.log(`Deleting existing leagues for user: ${userId}`);
      // Delete existing league and team data for this user
      const existingLeagues = await storage.getLeagues(userId);
      console.log(`Found ${existingLeagues.length} existing leagues to delete`);
      for (const league of existingLeagues) {
        console.log(`Deleting league: ${league.id} - ${league.name}`);
        await storage.deleteLeague(league.id);
      }

      console.log(`Fetching fresh league data from ESPN API...`);
      // Reload league data using the FIXED logic - get both league and roster data for complete team info
      const leagueData = await espnApiService.getLeagueData(
        credentials,
        'ffl',
        credentials.testSeason,
        credentials.testLeagueId,
        ['mTeam', 'mSettings']
      );

      // Also fetch roster data to get complete team names
      console.log(`Fetching roster data for complete team names...`);
      const rosterData = await espnApiService.getRosters(
        credentials,
        'ffl', 
        credentials.testSeason,
        credentials.testLeagueId
      );
      
      console.log(`ESPN API returned league: ${leagueData.settings?.name}, teams: ${leagueData.teams?.length}, members: ${leagueData.members?.length}`);
      
      // Parse and store league information
      const leagueInfo = {
        userId,
        espnLeagueId: credentials.testLeagueId,
        name: leagueData.settings?.name || `League ${credentials.testLeagueId}`,
        sport: 'ffl',
        season: credentials.testSeason,
        teamCount: leagueData.teams?.length || 0,
        currentWeek: leagueData.scoringPeriodId || 1,
        playoffTeams: leagueData.settings?.playoffTeamCount || 6,
        scoringType: leagueData.settings?.scoringType || "Head-to-Head Points",
        tradeDeadline: leagueData.settings?.tradeDeadline || null,
        settings: leagueData.settings || {}
      };

      console.log(`Creating new league with ${leagueInfo.teamCount} teams`);
      const league = await storage.createLeague(leagueInfo);

      // Store teams using the FIXED logic with roster data for full team names
      if (leagueData.teams) {    
        console.log(`Processing ${leagueData.teams.length} teams...`);
        console.log('First team structure from league data:', JSON.stringify(leagueData.teams[0], null, 2));
        if (rosterData.teams && rosterData.teams.length > 0) {
          console.log('First team structure from roster data:', JSON.stringify(rosterData.teams[0], null, 2));
        }
        if (leagueData.members && leagueData.members.length > 0) {
          console.log('First member structure:', JSON.stringify(leagueData.members[0], null, 2));
        }
        
        for (const team of leagueData.teams) {
          // Try to get full team name from roster data first (which has complete team info)
          let teamName = `Team ${team.id}`;
          let rosterTeam = rosterData.teams?.find((rt: any) => rt.id === team.id);
          
          if (rosterTeam) {
            console.log(`Found roster team ${team.id}:`, { 
              location: rosterTeam.location, 
              nickname: rosterTeam.nickname, 
              abbrev: rosterTeam.abbrev 
            });
            
            // Use roster data for full team names
            if (rosterTeam.location && rosterTeam.nickname) {
              teamName = `${rosterTeam.location} ${rosterTeam.nickname}`;
            } else if (rosterTeam.location) {
              teamName = rosterTeam.location;
            } else if (rosterTeam.nickname) {
              teamName = rosterTeam.nickname;
            } else if (rosterTeam.abbrev) {
              teamName = rosterTeam.abbrev;
            }
          } else {
            // Fall back to league data 
            if (team.location && team.nickname) {
              teamName = `${team.location} ${team.nickname}`;
            } else if (team.location) {
              teamName = team.location;
            } else if (team.nickname) {
              teamName = team.nickname;
            } else if (team.abbrev) {
              teamName = team.abbrev;
            }
          }

          // Find owner from members array using team.owners GUID
          let ownerName = `Owner ${team.id}`;
          if (team.owners && team.owners[0]) {
            const ownerGuid = team.owners[0].replace(/[{}]/g, ''); // Remove braces from GUID
            const member = leagueData.members?.find((m: any) => m.id.includes(ownerGuid));
            if (member?.displayName) {
              ownerName = member.displayName;
            } else if (team.owners[0].displayName) {
              ownerName = team.owners[0].displayName;
            } else if (team.owners[0].firstName && team.owners[0].lastName) {
              ownerName = `${team.owners[0].firstName} ${team.owners[0].lastName}`;
            }
          }

          console.log(`Creating team ${team.id}: "${teamName}" owned by "${ownerName}"`);
          
          await storage.createTeam({
            espnTeamId: team.id,
            leagueId: league.id,
            name: teamName,
            owner: ownerName,
            abbreviation: team.abbrev || null,
            logoUrl: team.logo || null,
            wins: team.record?.overall?.wins || 0,
            losses: team.record?.overall?.losses || 0,
            ties: team.record?.overall?.ties || 0,
            pointsFor: team.record?.overall?.pointsFor?.toString() || "0",
            pointsAgainst: team.record?.overall?.pointsAgainst?.toString() || "0",
            streak: team.record?.overall?.streakType && team.record?.overall?.streakLength ? 
              `${team.record.overall.streakType}${team.record.overall.streakLength}` : null,
            rank: team.playoffSeed || team.draftDayProjectedRank || null
          });
        }
      }

      console.log(`Successfully created league with ${leagueData.teams?.length || 0} teams`);
      
      // Set this league as the user's selected league
      await storage.updateUser(userId, { selectedLeagueId: league.id });

      res.json({ 
        message: "League data reloaded successfully",
        league: { 
          name: league.name, 
          teamCount: league.teamCount 
        }
      });
    } catch (error: any) {
      console.error('League reload error:', error);
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/espn-credentials/:userId/validate", async (req, res) => {
    try {
      const userId = req.params.userId;
      const credentials = await storage.getEspnCredentials(userId);
      if (!credentials) {
        return res.status(404).json({ message: "ESPN credentials not found" });
      }

      const isValid = await espnApiService.validateCredentials(credentials);
      
      try {
        await storage.updateEspnCredentials(userId, {
          isValid,
          lastValidated: new Date()
        });
      } catch (dbError) {
        console.error('Database error when updating validation status:', dbError);
        // Continue with validation response even if update fails
      }

      if (isValid && credentials.testLeagueId && credentials.testSeason) {
        try {
          console.log(`Auto-loading league: ${credentials.testLeagueId} for season ${credentials.testSeason}`);
          
          // Fetch league data from ESPN
          const leagueData = await espnApiService.getLeagueData(
            credentials,
            'ffl', // Default to football
            credentials.testSeason,
            credentials.testLeagueId,
            ['mTeam', 'mSettings']
          );
          
          // Parse and store league information
          const leagueInfo = {
            userId,
            espnLeagueId: credentials.testLeagueId,
            name: leagueData.settings?.name || `League ${credentials.testLeagueId}`,
            sport: 'ffl',
            season: credentials.testSeason,
            teamCount: leagueData.teams?.length || 0,
            currentWeek: leagueData.scoringPeriodId || 1,
            playoffTeams: leagueData.settings?.playoffTeamCount || 6,
            scoringType: leagueData.settings?.scoringType || "Head-to-Head Points",
            tradeDeadline: leagueData.settings?.tradeDeadline || null,
            settings: leagueData.settings || {}
          };

          const league = await storage.createLeague(leagueInfo);
          console.log(`Auto-loaded league: ${league.name}`);

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
                streak: `${team.record?.overall?.streakType || 'W'} ${team.record?.overall?.streakLength || 0}`,
                rank: team.playoffSeed || team.rank || 0
              });
            }
          }

          res.json({ 
            isValid, 
            lastValidated: new Date(),
            autoLoaded: true,
            league: {
              id: league.id,
              name: league.name,
              teamCount: leagueData.teams?.length || 0
            }
          });
        } catch (autoLoadError: any) {
          console.error('Auto-load league error:', autoLoadError);
          // Still return success for validation, but indicate auto-load failed
          res.json({ 
            isValid, 
            lastValidated: new Date(),
            autoLoaded: false,
            autoLoadError: autoLoadError.message
          });
        }
      } else {
        res.json({ isValid, lastValidated: new Date(), autoLoaded: false });
      }
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Disconnect/logout route - clears ESPN credentials and all associated data
  app.delete("/api/espn-credentials/:userId", async (req, res) => {
    try {
      const userId = req.params.userId;
      
      // Check if credentials exist
      const credentials = await storage.getEspnCredentials(userId);
      if (!credentials) {
        return res.status(404).json({ message: "No ESPN credentials found to disconnect" });
      }

      // Get all user's leagues to clean up associated data
      const userLeagues = await storage.getLeagues(userId);
      
      // Delete all teams, matchups, and players for each league
      for (const league of userLeagues) {
        const teams = await storage.getTeams(league.id);
        const matchups = await storage.getMatchups(league.id);
        const allPlayers = await storage.getPlayers();
        const leaguePlayers = allPlayers.filter(p => p.leagueId === league.id);
        
        // Delete teams, matchups, and players
        for (const team of teams) {
          await storage.deleteTeam(team.id);
        }
        for (const matchup of matchups) {
          await storage.deleteMatchup(matchup.id);
        }
        for (const player of leaguePlayers) {
          await storage.deletePlayer(player.id);
        }
        
        // Delete the league itself
        await storage.deleteLeague(league.id);
      }

      // Reset user's selected league
      await storage.updateUser(userId, { selectedLeagueId: null });

      // Delete ESPN credentials
      await storage.deleteEspnCredentials(userId);

      console.log(`Successfully disconnected user ${userId} and cleared all associated data`);
      res.json({ 
        message: "Successfully disconnected from ESPN account and cleared all data",
        clearedItems: {
          credentials: 1,
          leagues: userLeagues.length,
          totalItemsCleared: "All user data successfully removed"
        }
      });
    } catch (error: any) {
      console.error('Error during disconnect:', error);
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

  // Get user's selected league
  app.get("/api/user/:userId/selected-league", async (req, res) => {
    try {
      const user = await storage.getUser(req.params.userId);
      if (!user?.selectedLeagueId) {
        return res.json({ selectedLeague: null });
      }

      const selectedLeague = await storage.getLeague(user.selectedLeagueId);
      res.json({ selectedLeague });
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
        console.log('ESPN API response during league loading:');
        console.log('leagueData.teams.length:', leagueData.teams.length);
        console.log('leagueData.members.length:', leagueData.members?.length);
        console.log('First team from ESPN:', JSON.stringify(leagueData.teams[0], null, 2));
        if (leagueData.members && leagueData.members.length > 0) {
          console.log('First member from ESPN:', JSON.stringify(leagueData.members[0], null, 2));
        }
        
        for (const team of leagueData.teams) {
          // Build team name properly handling undefined values
          let teamName = `Team ${team.id}`;
          if (team.location && team.nickname) {
            teamName = `${team.location} ${team.nickname}`;
          } else if (team.location) {
            teamName = team.location;
          } else if (team.nickname) {
            teamName = team.nickname;
          } else if (team.abbrev) {
            teamName = team.abbrev;
          }

          // Find owner from members array using team.owners GUID
          let ownerName = `Owner ${team.id}`;
          if (team.owners && team.owners[0]) {
            const ownerGuid = team.owners[0].replace(/[{}]/g, ''); // Remove braces from GUID
            console.log(`Team ${team.id} owner GUID: ${team.owners[0]} -> cleaned: ${ownerGuid}`);
            const member = leagueData.members?.find((m: any) => m.id.includes(ownerGuid));
            if (member?.displayName) {
              ownerName = member.displayName;
              console.log(`Found member: ${ownerName}`);
            } else if (team.owners[0].displayName) {
              ownerName = team.owners[0].displayName;
              console.log(`Using team owner displayName: ${ownerName}`);
            } else if (team.owners[0].firstName && team.owners[0].lastName) {
              ownerName = `${team.owners[0].firstName} ${team.owners[0].lastName}`;
              console.log(`Using team owner first+last: ${ownerName}`);
            } else {
              console.log(`No owner name found for team ${team.id}, using fallback`);
            }
          }

          console.log(`Creating team: ID=${team.id}, Name="${teamName}", Owner="${ownerName}"`);

          await storage.createTeam({
            espnTeamId: team.id,
            leagueId: league.id,
            name: teamName,
            owner: ownerName,
            abbreviation: team.abbrev || null,
            logoUrl: team.logo || null,
            wins: team.record?.overall?.wins || 0,
            losses: team.record?.overall?.losses || 0,
            ties: team.record?.overall?.ties || 0,
            pointsFor: team.record?.overall?.pointsFor?.toString() || "0",
            pointsAgainst: team.record?.overall?.pointsAgainst?.toString() || "0",
            streak: team.record?.overall?.streakType && team.record?.overall?.streakLength ? 
              `${team.record.overall.streakType}${team.record.overall.streakLength}` : null,
            rank: team.playoffSeed || team.draftDayProjectedRank || null
          });
        }
      }

      // Set this league as the user's selected league for auto-loading
      await storage.updateUser(userId, { selectedLeagueId: league.id });

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

      // Get fresh standings data from ESPN API
      const standingsData = await espnApiService.getStandings(
        credentials,
        league.sport,
        league.season,
        league.espnLeagueId
      );

      // Get stored team data - this has the complete info we need
      const storedTeams = await storage.getTeams(req.params.leagueId);
      console.log(`Found ${storedTeams.length} stored teams`);
      if (storedTeams.length > 0) {
        console.log('First stored team structure:', JSON.stringify(storedTeams[0], null, 2));
      }

      // Use stored teams as primary data source since ESPN API doesn't return complete team data
      const transformedData = {
        ...standingsData,
        teams: storedTeams.map((storedTeam) => {
          // Parse team name into location and nickname
          const teamName = storedTeam.name || `Team ${storedTeam.espnTeamId}`;
          const nameParts = teamName.split(' ');
          const location = nameParts[0] || 'Team';
          const nickname = nameParts.slice(1).join(' ') || storedTeam.espnTeamId?.toString() || 'Unknown';
          
          const transformedTeam = {
            id: storedTeam.espnTeamId,
            location,
            nickname,
            owners: [{
              displayName: storedTeam.owner || 'Unknown Owner',
              firstName: storedTeam.owner?.split(' ')[0] || 'Unknown',
              lastName: storedTeam.owner?.split(' ').slice(1).join(' ') || 'Owner'
            }],
            record: {
              overall: {
                wins: storedTeam.wins || 0,
                losses: storedTeam.losses || 0,
                ties: storedTeam.ties || 0,
                pointsFor: parseFloat(storedTeam.pointsFor || '0'),
                pointsAgainst: parseFloat(storedTeam.pointsAgainst || '0'),
                streak: storedTeam.streak ? {
                  type: storedTeam.streak.includes('W') ? 1 : 0,
                  length: parseInt(storedTeam.streak.replace(/[WL]/, '')) || 1
                } : null
              }
            }
          };
          
          console.log(`Stored team ${storedTeam.espnTeamId} transformed:`, {
            originalName: storedTeam.name,
            location: transformedTeam.location,
            nickname: transformedTeam.nickname,
            owner: transformedTeam.owners[0].displayName
          });
          
          return transformedTeam;
        })
      };

      console.log(`Transformed ${transformedData.teams.length} teams using stored data`);

      res.json(transformedData);
    } catch (error: any) {
      console.error('Standings API error:', error);
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
        week && week !== "current" ? parseInt(week as string) : undefined
      );

      res.json(matchupsData);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // AI Recommendations route
  app.post("/api/leagues/:leagueId/ai-recommendations", async (req, res) => {
    try {
      const league = await storage.getLeague(req.params.leagueId);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }

      const credentials = await storage.getEspnCredentials(league.userId);
      if (!credentials || !credentials.isValid) {
        return res.status(401).json({ message: "Valid ESPN credentials required" });
      }

      // Get comprehensive data for the 4 required AI analysis points
      const [standingsData, rostersData, leagueDetailsData, fullLeagueData] = await Promise.all([
        espnApiService.getStandings(credentials, league.sport, league.season, league.espnLeagueId),
        espnApiService.getRosters(credentials, league.sport, league.season, league.espnLeagueId),
        espnApiService.getLeagueData(credentials, league.sport, league.season, league.espnLeagueId, ['mSettings', 'mTeam', 'mRoster', 'mScoreboard']),
        espnApiService.getLeagueData(credentials, league.sport, league.season, league.espnLeagueId, ['mSettings'])
      ]);
      
      // Try to get settings from multiple sources
      const settingsFromStandings = standingsData.settings || {};
      const settingsFromLeague = leagueDetailsData.settings || {};
      const settingsFromFull = fullLeagueData.settings || {};
      
      console.log('Settings from standings:', JSON.stringify(settingsFromStandings, null, 2));
      console.log('Settings from league details:', JSON.stringify(settingsFromLeague, null, 2));
      console.log('Settings from full league:', JSON.stringify(settingsFromFull, null, 2));
      
      // Merge settings data from all sources
      const combinedSettings = {
        ...settingsFromStandings,
        ...settingsFromLeague, 
        ...settingsFromFull
      };
      console.log('Final combined settings:', JSON.stringify(combinedSettings, null, 2));

      // Get waiver wire players (using existing logic from waiver-wire route)
      const playersResponse = await espnApiService.getPlayers(credentials, league.sport, league.season);
      
      // Handle different possible API response structures
      let playersData = [];
      console.log('Raw playersResponse type:', typeof playersResponse);
      console.log('Is Array?', Array.isArray(playersResponse));
      
      if (Array.isArray(playersResponse)) {
        playersData = playersResponse;
        console.log('Using direct array, length:', playersData.length);
      } else if (playersResponse?.players && Array.isArray(playersResponse.players)) {
        playersData = playersResponse.players;
        console.log('Using players property, length:', playersData.length);
      } else {
        console.log('Unexpected players API response structure:', typeof playersResponse);
        console.log('Players response keys:', Object.keys(playersResponse || {}));
        console.log('Full response:', JSON.stringify(playersResponse, null, 2));
        playersData = []; // Fallback to empty array
      }
      
      // Double-check playersData is an array before filtering
      if (!Array.isArray(playersData)) {
        console.error('ERROR: playersData is not an array!', typeof playersData);
        playersData = []; // Force it to be an array
      }
      
      console.log('Final playersData type:', typeof playersData, 'isArray:', Array.isArray(playersData), 'length:', playersData.length);
      
      // Extract taken player IDs from all rosters
      const takenPlayerIds = new Set();
      if (rostersData.teams) {
        rostersData.teams.forEach((team: any) => {
          const roster = team.roster || team.rosterForCurrentScoringPeriod || team.rosterForMatchupPeriod;
          if (roster?.entries) {
            roster.entries.forEach((entry: any) => {
              const playerId = entry.playerPoolEntry?.player?.id || entry.player?.id || entry.playerId || entry.id;
              if (playerId) {
                takenPlayerIds.add(playerId);
              }
            });
          }
        });
      }

      // Filter to get only available waiver wire players
      const waiverWirePlayers = (Array.isArray(playersData) ? playersData : []).filter((playerData: any) => {
        const player = playerData.player || playerData;
        return player?.id && !takenPlayerIds.has(player.id);
      }).slice(0, 50); // Top 50 available

      // Find user's team (for now, use the first team as default)
      // TODO: Add user team identification logic based on team ownership
      const userTeam = standingsData.teams?.[0];
      let userRoster = null;
      
      if (userTeam && rostersData.teams) {
        const userTeamData = rostersData.teams.find((t: any) => t.id === userTeam.id);
        userRoster = userTeamData?.roster || userTeamData?.rosterForCurrentScoringPeriod;
      }

      // Debug: Log the actual league settings structure to understand ESPN API response
      console.log('League Details Data Structure:');
      console.log('- leagueDetailsData.settings keys:', Object.keys(leagueDetailsData.settings || {}));
      console.log('- settings object:', JSON.stringify(leagueDetailsData.settings, null, 2));
      
      // Extract scoring settings from various possible locations in ESPN API
      let receptionPoints = 0;
      let scoringType = 'Standard';
      
      // Check multiple possible paths for scoring settings
      // Try all available settings sources
      const settingsSources = [combinedSettings, settingsFromFull, settingsFromLeague, settingsFromStandings];
      
      for (let index = 0; index < settingsSources.length; index++) {
        const settings = settingsSources[index];
        console.log(`Checking settings source ${index}:`, Object.keys(settings || {}));
        
        // Debug: Show what's actually in scoringSettings if it exists
        if (settings?.scoringSettings) {
          console.log(`Source ${index} scoringSettings keys:`, Object.keys(settings.scoringSettings));
          console.log(`Source ${index} scoringSettings.receptionPoints:`, settings.scoringSettings.receptionPoints);
        }
        
        if (settings?.scoringSettings?.receptionPoints !== undefined) {
          receptionPoints = settings.scoringSettings.receptionPoints;
          console.log(`Found reception points in scoringSettings from source ${index}:`, receptionPoints);
          break;
        } else if (settings?.scoringSettings?.scoringItems && Array.isArray(settings.scoringSettings.scoringItems)) {
          const scoringItems = settings.scoringSettings.scoringItems;
          console.log(`Checking ${scoringItems.length} scoring items in source ${index}`);
          console.log('First 5 scoring items:', JSON.stringify(scoringItems.slice(0, 5), null, 2));
          // Look for reception scoring in scoringItems (ESPN often puts it here)
          console.log('Searching through scoring items for reception scoring...');
          const receptionScoringItem = scoringItems.find((item: any) => {
            const isReceptionStat = item.statId === 53 || // Reception stat ID in ESPN
              item.description?.toLowerCase().includes('reception') ||
              item.abbr === 'REC';
            if (isReceptionStat) {
              console.log('Found reception scoring item:', JSON.stringify(item, null, 2));
            }
            return isReceptionStat;
          });
          if (receptionScoringItem) {
            receptionPoints = receptionScoringItem.points || receptionScoringItem.value || 0;
            console.log(`Found reception points in scoringItems from source ${index}:`, receptionPoints);
            break;
          } else {
            // Debug: Show a few scoring items to understand the structure
            console.log('Sample scoring items (first 3):', JSON.stringify(scoringItems.slice(0, 3), null, 2));
          }
        }
      }
      
      // If still no PPR data found, try a different approach - check for specific scoring patterns
      if (receptionPoints === 0) {
        console.log('No PPR data found in standard locations, checking alternative patterns...');
        for (let index = 0; index < settingsSources.length; index++) {
          const settings = settingsSources[index];
          if (settings?.scoringSettings?.scoringItems && Array.isArray(settings.scoringSettings.scoringItems)) {
            const scoringItems = settings.scoringSettings.scoringItems;
            console.log(`Alternative search in source ${index}: checking ${scoringItems.length} items`);
            // Look specifically for statId 53 (reception stat)
            const receptionItems = scoringItems.filter((item: any) => item.statId === 53);
            console.log(`Found ${receptionItems.length} reception items (statId 53):`, receptionItems);
            
            // Also check for any reception-related items
            const allReceptionItems = scoringItems.filter((item: any) => 
              item.statId === 53 ||
              String(item.description || '').toLowerCase().includes('rec') ||
              String(item.abbr || '').toLowerCase().includes('rec')
            );
            console.log(`All reception-related items in source ${index}:`, allReceptionItems);
            
            // Use the first one that has points > 0
            const validReceptionItem = allReceptionItems.find((item: any) => 
              (item.points > 0) || (item.points === 0.5) || (item.points === 1)
            );
            
            if (validReceptionItem) {
              receptionPoints = validReceptionItem.points || validReceptionItem.value || 0;
              console.log(`Found reception points via alternative method from source ${index}:`, receptionPoints);
              console.log(`Full item details:`, JSON.stringify(validReceptionItem, null, 2));
              break;
            }
          }
        }
      }
      
      console.log('Final extracted reception points:', receptionPoints);
      
      const scoringSettings = {
        scoringType: leagueDetailsData.settings?.scoringType || scoringType,
        isHalfPPR: receptionPoints === 0.5,
        isFullPPR: receptionPoints === 1.0,
        isStandard: receptionPoints === 0,
        receptionPoints: receptionPoints,
        scoringItems: leagueDetailsData.settings?.scoringItems || {},
        rawSettings: leagueDetailsData.settings // Include raw settings for debugging
      };

      // Get current week context
      const currentScoringPeriod = leagueDetailsData.scoringPeriodId || leagueDetailsData.currentScoringPeriod || 1;
      const seasonType = league.season >= new Date().getFullYear() ? 'Regular Season' : 'Past Season';
      const weekContext = {
        currentWeek: currentScoringPeriod,
        seasonType,
        season: league.season,
        totalWeeks: leagueDetailsData.settings?.scheduleSettings?.matchupPeriodCount || 17
      };

      // Build comprehensive analysis data with the 4 required data points
      const leagueAnalysisData = {
        // 1. Your Team's Roster
        userTeam: {
          name: userTeam ? `${userTeam.location} ${userTeam.nickname}` : 'Unknown Team',
          roster: userRoster?.entries?.map((entry: any) => {
            const player = entry.playerPoolEntry?.player || entry.player;
            return {
              name: player?.fullName || 'Unknown Player',
              position: player?.defaultPositionId,
              lineupSlot: entry.lineupSlotId, // 0-8 starters, 20+ bench, 21 IR
              isStarter: entry.lineupSlotId < 20,
              isBench: entry.lineupSlotId === 20,
              isIR: entry.lineupSlotId === 21,
              team: player?.proTeamId
            };
          }) || []
        },
        
        // 2. Available Waiver Wire Players
        waiverWire: {
          topAvailable: waiverWirePlayers.slice(0, 25).map((playerData: any) => {
            const player = playerData.player || playerData;
            return {
              name: player.fullName || 'Unknown Player',
              position: player.defaultPositionId,
              team: player.proTeamId,
              projectedPoints: player.stats?.find((s: any) => s.statSourceId === 1)?.appliedTotal || 0,
              ownership: player.ownership?.percentOwned || 0
            };
          })
        },
        
        // 3. League's Scoring Settings
        scoringSettings,
        
        // 4. Current Week/Context
        weekContext,
        
        // Additional context data
        league: {
          name: league.name,
          sport: league.sport,
          season: league.season,
          settings: standingsData.settings
        },
        teams: standingsData.teams,
        standings: standingsData.teams?.map((team: any) => ({
          teamName: `${team.location} ${team.nickname}`,
          wins: team.record?.overall?.wins || 0,
          losses: team.record?.overall?.losses || 0,
          pointsFor: team.record?.overall?.pointsFor || 0,
          pointsAgainst: team.record?.overall?.pointsAgainst || 0
        })) || []
      };

      const analysis = await geminiService.analyzeLeague(leagueAnalysisData);
      res.json(analysis);
    } catch (error: any) {
      console.error('AI Analysis Error:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // AI Question route
  app.post("/api/leagues/:leagueId/ai-question", async (req, res) => {
    try {
      const { question } = req.body;
      if (!question) {
        return res.status(400).json({ message: "Question is required" });
      }

      const league = await storage.getLeague(req.params.leagueId);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }

      const credentials = await storage.getEspnCredentials(league.userId);
      if (!credentials || !credentials.isValid) {
        return res.status(401).json({ message: "Valid ESPN credentials required" });
      }

      // Get comprehensive data for enhanced context (same as recommendations)
      const [standingsData, rostersData, leagueDetailsData, fullLeagueData] = await Promise.all([
        espnApiService.getStandings(credentials, league.sport, league.season, league.espnLeagueId),
        espnApiService.getRosters(credentials, league.sport, league.season, league.espnLeagueId),
        espnApiService.getLeagueData(credentials, league.sport, league.season, league.espnLeagueId, ['mSettings', 'mTeam', 'mRoster']),
        espnApiService.getLeagueData(credentials, league.sport, league.season, league.espnLeagueId, ['mSettings'])
      ]);
      
      // Get settings from multiple sources (same as recommendations)
      const settingsFromStandings = standingsData.settings || {};
      const settingsFromLeague = leagueDetailsData.settings || {};
      const settingsFromFull = fullLeagueData.settings || {};
      
      // Merge settings data from all sources
      const combinedSettings = {
        ...settingsFromStandings,
        ...settingsFromLeague, 
        ...settingsFromFull
      };

      // Find user's team and get roster data
      const userTeam = standingsData.teams?.[0];
      let userRoster = null;
      
      if (userTeam && rostersData.teams) {
        const userTeamData = rostersData.teams.find((t: any) => t.id === userTeam.id);
        userRoster = userTeamData?.roster || userTeamData?.rosterForCurrentScoringPeriod;
      }

      // Extract scoring settings from various possible locations in ESPN API
      let receptionPoints = 0;
      let scoringType = 'Standard';
      
      // Check multiple possible paths for scoring settings
      // Try all available settings sources
      const settingsSources = [combinedSettings, settingsFromFull, settingsFromLeague, settingsFromStandings];
      
      for (let index = 0; index < settingsSources.length; index++) {
        const settings = settingsSources[index];
        console.log(`AI Question - Checking settings source ${index}:`, Object.keys(settings || {}));
        
        // Debug: Show what's actually in scoringSettings if it exists
        if (settings?.scoringSettings) {
          console.log(`AI Question - Source ${index} scoringSettings keys:`, Object.keys(settings.scoringSettings));
          console.log(`AI Question - Source ${index} scoringSettings.receptionPoints:`, settings.scoringSettings.receptionPoints);
        }
        
        if (settings?.scoringSettings?.receptionPoints !== undefined) {
          receptionPoints = settings.scoringSettings.receptionPoints;
          console.log(`AI Question - Found reception points in scoringSettings from source ${index}:`, receptionPoints);
          break;
        } else if (settings?.scoringSettings?.scoringItems && Array.isArray(settings.scoringSettings.scoringItems)) {
          const scoringItems = settings.scoringSettings.scoringItems;
          console.log(`AI Question - Checking ${scoringItems.length} scoring items in source ${index}`);
          console.log('AI Question - First 5 scoring items:', JSON.stringify(scoringItems.slice(0, 5), null, 2));
          // Look for reception scoring in scoringItems (ESPN often puts it here)
          console.log('AI Question - Searching through scoring items for reception scoring...');
          const receptionScoringItem = scoringItems.find((item: any) => {
            const isReceptionStat = item.statId === 53 || // Reception stat ID in ESPN
              item.description?.toLowerCase().includes('reception') ||
              item.abbr === 'REC';
            if (isReceptionStat) {
              console.log('AI Question - Found reception scoring item:', JSON.stringify(item, null, 2));
            }
            return isReceptionStat;
          });
          if (receptionScoringItem) {
            receptionPoints = receptionScoringItem.points || receptionScoringItem.value || 0;
            console.log(`AI Question - Found reception points in scoringItems from source ${index}:`, receptionPoints);
            break;
          } else {
            // Debug: Show a few scoring items to understand the structure
            console.log('AI Question - Sample scoring items (first 3):', JSON.stringify(scoringItems.slice(0, 3), null, 2));
          }
        }
      }
      
      // If still no PPR data found, try a different approach - check for specific scoring patterns
      if (receptionPoints === 0) {
        console.log('AI Question - No PPR data found in standard locations, checking alternative patterns...');
        for (let index = 0; index < settingsSources.length; index++) {
          const settings = settingsSources[index];
          if (settings?.scoringItems && Array.isArray(settings.scoringItems)) {
            console.log(`AI Question - Alternative search in source ${index}: checking ${settings.scoringItems.length} items`);
            // Look specifically for statId 53 (reception stat)
            const receptionItems = settings.scoringItems.filter((item: any) => item.statId === 53);
            console.log(`AI Question - Found ${receptionItems.length} reception items (statId 53):`, receptionItems);
            
            // Also check for any reception-related items
            const allReceptionItems = settings.scoringItems.filter((item: any) => 
              item.statId === 53 ||
              String(item.description || '').toLowerCase().includes('rec') ||
              String(item.abbr || '').toLowerCase().includes('rec')
            );
            console.log(`AI Question - All reception-related items in source ${index}:`, allReceptionItems);
            
            // Use the first one that has points > 0
            const validReceptionItem = allReceptionItems.find((item: any) => 
              (item.points > 0) || (item.points === 0.5) || (item.points === 1)
            );
            
            if (validReceptionItem) {
              receptionPoints = validReceptionItem.points || validReceptionItem.value || 0;
              console.log(`AI Question - Found reception points via alternative method from source ${index}:`, receptionPoints);
              console.log(`AI Question - Full item details:`, JSON.stringify(validReceptionItem, null, 2));
              break;
            }
          }
        }
      }
      
      console.log('AI Question - Final extracted reception points:', receptionPoints);
      
      const scoringSettings = {
        scoringType: leagueDetailsData.settings?.scoringType || scoringType,
        isHalfPPR: receptionPoints === 0.5,
        isFullPPR: receptionPoints === 1.0,
        isStandard: receptionPoints === 0,
        receptionPoints: receptionPoints
      };

      // Get current week context
      const currentScoringPeriod = leagueDetailsData.scoringPeriodId || leagueDetailsData.currentScoringPeriod || 1;
      const seasonType = league.season >= new Date().getFullYear() ? 'Regular Season' : 'Past Season';
      const weekContext = {
        currentWeek: currentScoringPeriod,
        seasonType,
        season: league.season
      };
      
      const contextData = {
        userTeam: {
          name: userTeam ? `${userTeam.location} ${userTeam.nickname}` : 'Unknown Team',
          roster: userRoster?.entries?.map((entry: any) => {
            const player = entry.playerPoolEntry?.player || entry.player;
            return {
              name: player?.fullName || 'Unknown Player',
              position: player?.defaultPositionId,
              isStarter: entry.lineupSlotId < 20,
              isBench: entry.lineupSlotId === 20,
              isIR: entry.lineupSlotId === 21
            };
          }) || []
        },
        scoringSettings,
        weekContext,
        league: {
          name: league.name,
          sport: league.sport,
          season: league.season
        },
        teams: standingsData.teams
      };

      const answer = await geminiService.askQuestion(question, contextData);
      res.json({ answer });
    } catch (error: any) {
      console.error('AI Question Error:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // Helper function for position mapping
  const getPositionName = (positionId: number): string => {
    const positions: { [key: number]: string } = {
      1: 'QB', 2: 'RB', 3: 'WR', 4: 'TE', 5: 'K', 16: 'D/ST'
    };
    return positions[positionId] || `POS_${positionId}`;
  };

  // Trade analysis route
  app.post("/api/leagues/:leagueId/trade-analysis", async (req, res) => {
    try {
      const { selectedPlayer } = req.body;
      if (!selectedPlayer) {
        return res.status(400).json({ message: "Selected player is required" });
      }

      const league = await storage.getLeague(req.params.leagueId);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }

      const credentials = await storage.getEspnCredentials(league.userId);
      if (!credentials || !credentials.isValid) {
        return res.status(401).json({ message: "Valid ESPN credentials required" });
      }

      // Get comprehensive roster data for all teams
      const [standingsData, rostersData, leagueDetailsData] = await Promise.all([
        espnApiService.getStandings(credentials, league.sport, league.season, league.espnLeagueId),
        espnApiService.getRosters(credentials, league.sport, league.season, league.espnLeagueId),
        espnApiService.getLeagueData(credentials, league.sport, league.season, league.espnLeagueId, ['mSettings'])
      ]);

      // Extract scoring settings
      const combinedSettings = {
        ...standingsData.settings,
        ...leagueDetailsData.settings,
        season: league.season
      };

      let receptionPoints = 0;
      const settingsSources = [combinedSettings, leagueDetailsData.settings, standingsData.settings];
      
      for (const settings of settingsSources) {
        if (settings?.scoringSettings?.scoringItems) {
          const receptionItem = settings.scoringSettings.scoringItems.find((item: any) => item.statId === 53);
          if (receptionItem?.points !== undefined) {
            receptionPoints = receptionItem.points;
            break;
          }
        }
      }

      const leagueSettings = {
        receptionPoints,
        season: league.season,
        scoringType: combinedSettings.scoringType || 'Head-to-Head Points'
      };

      // Find user's team from standings
      const userTeam = standingsData.teams?.[0];
      if (!userTeam) {
        return res.status(404).json({ message: "User team not found" });
      }

      // Get roster data for all teams
      const allTeams = rostersData.teams?.map((team: any) => {
        const standingsTeam = standingsData.teams?.find((t: any) => t.id === team.id);
        return {
          id: team.id,
          name: team.location && team.nickname ? `${team.location} ${team.nickname}` : `Team ${team.id}`,
          roster: team.roster?.entries?.map((entry: any) => ({
            name: entry.playerPoolEntry?.player?.fullName || 'Unknown Player',
            position: getPositionName(entry.playerPoolEntry?.player?.defaultPositionId) || 'FLEX',
            isStarter: entry.lineupSlotId !== 20, // 20 is typically bench
            playerId: entry.playerPoolEntry?.player?.id
          })) || [],
          record: {
            wins: standingsTeam?.record?.overall?.wins || 0,
            losses: standingsTeam?.record?.overall?.losses || 0,
            pointsFor: standingsTeam?.record?.overall?.pointsFor || 0,
            pointsAgainst: standingsTeam?.record?.overall?.pointsAgainst || 0
          }
        };
      }) || [];

      // Find the complete user team data with roster
      const userTeamWithRoster = allTeams.find(team => team.id === userTeam.id) || {
        id: userTeam.id,
        name: userTeam.location && userTeam.nickname ? `${userTeam.location} ${userTeam.nickname}` : 'Your Team',
        roster: [],
        record: {
          wins: userTeam.record?.overall?.wins || 0,
          losses: userTeam.record?.overall?.losses || 0,
          pointsFor: userTeam.record?.overall?.pointsFor || 0,
          pointsAgainst: userTeam.record?.overall?.pointsAgainst || 0
        }
      };

      // Call Gemini trade analysis
      const tradeAnalysis = await geminiService.analyzeTrade(
        selectedPlayer,
        userTeamWithRoster,
        allTeams,
        leagueSettings
      );

      res.json(tradeAnalysis);
    } catch (error: any) {
      console.error('Trade Analysis Error:', error);
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
      const playersList = playersData.players || playersData || [];
      const waiverWirePlayers = Array.isArray(playersList) ? playersList.filter((player: any) => 
        !takenPlayerIds.has(player.id)
      ) : [];

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

      const playersList = playersData.players || playersData || [];
      const waiverWirePlayers = Array.isArray(playersList) ? playersList.filter((player: any) => 
        !takenPlayerIds.has(player.id)
      ) : [];


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

      const credentials = await storage.getEspnCredentials('default-user');
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
    try {
      const leagueId = req.params.id;
      const teamId = parseInt(req.params.teamId);
      
      const league = await storage.getLeague(leagueId);
      
      if (!league) {
        return res.status(404).json({ message: 'League not found' });
      }

      const credentials = await storage.getEspnCredentials('default-user');
      if (!credentials) {
        return res.status(404).json({ message: 'ESPN credentials not found' });
      }

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
      res.status(500).json({ message: error.message });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
