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
import { setupAuth } from "./auth";

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
    season: number,
    leagueId?: string
  ) {
    // If leagueId is provided, use league-specific endpoint, otherwise use default
    const baseEndpoint = leagueId 
      ? `${this.baseUrl}/${sport}/seasons/${season}/segments/0/leagues/${leagueId}`
      : `${this.baseUrl}/${sport}/seasons/${season}/segments/0/leaguedefaults/1`;
    
    // Add comprehensive ESPN views to get complete player data including opponent rankings
    // Calculate current NFL week (assuming season starts in September)
    const currentDate = new Date();
    const currentWeek = Math.max(1, Math.min(18, Math.floor((currentDate.getTime() - new Date('2025-09-01').getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1));
    
    // Include all relevant ESPN views that might contain OPRK data
    const views = [
      'kona_player_info',      // Basic player information
      'players_wl',            // Player watch list data
      'kona_playercard',       // Detailed player card data
      'mMatchup',              // Current matchup data
      'mSchedule',             // Schedule and opponent data
      'mBoxscore',             // Box score and game data
      'kona_player_rankings',  // Player rankings data
      'kona_defense_rankings', // Defense rankings vs positions
      'mRoster',               // Roster data
      'mTeam'                  // Team data
    ];
    
    const url = `${baseEndpoint}?view=${views.join('&view=')}&scoringPeriodId=${currentWeek}`;
    
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

// Middleware to check if user is authenticated
function requireAuth(req: any, res: any, next: any) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Authentication required" });
  }
  next();
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Set up authentication routes (register, login, logout, /api/user)
  setupAuth(app);

  // ESPN Credentials routes
  app.post("/api/espn-credentials", requireAuth, async (req: any, res) => {
    try {
      console.log('Received ESPN credentials request:', JSON.stringify(req.body, null, 2));
      const validatedData = insertEspnCredentialsSchema.parse({ ...req.body, userId: req.user.id });
      
      // Validate credentials with ESPN API
      console.log('Validating credentials with ESPN API...');
      const testCredentials: EspnCredentials = {
        ...validatedData,
        id: '',
        testLeagueId: validatedData.testLeagueId ?? null,
        testSeason: validatedData.testSeason ?? null,
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

  app.get("/api/espn-credentials", requireAuth, async (req: any, res) => {
    try {
      const credentials = await storage.getEspnCredentials(req.user.id);
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
  app.post("/api/espn-credentials/reload-league", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
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

      // Upsert logic: check if league exists, update or create
      const existingLeague = await storage.getLeagueByEspnId(userId, credentials.testLeagueId, credentials.testSeason);
      
      let league;
      if (existingLeague) {
        console.log(`Updating existing league: ESPN ID=${credentials.testLeagueId}, Name="${leagueInfo.name}"`);
        league = await storage.updateLeague(existingLeague.id, leagueInfo);
        if (!league) {
          throw new Error("Failed to update existing league");
        }
      } else {
        console.log(`Creating new league: ESPN ID=${credentials.testLeagueId}, Name="${leagueInfo.name}"`);
        league = await storage.createLeague(leagueInfo);
      }

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
              abbrev: rosterTeam.abbrev,
              name: rosterTeam.name  // Check if the full name is here!
            });
            
            // Use roster data for full team names - try the same logic as the frontend
            if (rosterTeam.location && rosterTeam.nickname) {
              teamName = `${rosterTeam.location} ${rosterTeam.nickname}`;
            } else if (rosterTeam.location) {
              teamName = rosterTeam.location;
            } else if (rosterTeam.nickname) {
              teamName = rosterTeam.nickname;
            } else if (rosterTeam.name) {
              teamName = rosterTeam.name; // This might be where the full name is!
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

          // Find owner from members array - use same logic as rosters page
          let ownerName = `Owner ${team.id}`;
          if (team.owners && team.owners[0] && leagueData.members) {
            // Use same owner ID extraction as rosters page
            const ownerId = team.owners[0]?.id || team.owners[0];
            const member = leagueData.members.find((m: any) => m.id === ownerId);
            
            if (member) {
              // Prefer real name (firstName + lastName) over displayName - same as rosters page
              if (member.firstName && member.lastName) {
                ownerName = `${member.firstName} ${member.lastName}`;
              } else {
                // Fall back to displayName only if no real name available
                ownerName = member.displayName || `Owner ${team.id}`;
              }
              
              console.log(`Found member for team ${team.id}:`, {
                memberId: member.id,
                firstName: member.firstName,
                lastName: member.lastName,
                displayName: member.displayName,
                finalOwnerName: ownerName
              });
            } else {
              console.log(`No member found for team ${team.id} with ownerId:`, ownerId);
            }
          }

          // Upsert logic: check if team exists, update or create
          const existingTeam = await storage.getTeamByEspnId(league.id, team.id);
          
          const teamData = {
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
          };

          if (existingTeam) {
            console.log(`Updating existing team ${team.id}: "${teamName}" owned by "${ownerName}"`);
            await storage.updateTeam(existingTeam.id, teamData);
          } else {
            console.log(`Creating new team ${team.id}: "${teamName}" owned by "${ownerName}"`);
            await storage.createTeam(teamData);
          }
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

  app.post("/api/espn-credentials/validate", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
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
  app.delete("/api/espn-credentials", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      
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
        
        // Delete teams, matchups, and players
        for (const team of teams) {
          await storage.deleteTeam(team.id);
        }
        for (const matchup of matchups) {
          await storage.deleteMatchup(matchup.id);
        }
        
        // Delete all players (global cleanup)
        for (const player of allPlayers) {
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
  app.get("/api/leagues", requireAuth, async (req: any, res) => {
    try {
      const leagues = await storage.getLeagues(req.user.id);
      res.json(leagues);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get user's selected league
  app.get("/api/user/selected-league", requireAuth, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user?.selectedLeagueId) {
        return res.json({ selectedLeague: null });
      }

      const selectedLeague = await storage.getLeague(user.selectedLeagueId);
      res.json({ selectedLeague });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Update user's selected team and league
  app.put("/api/user/selected-team", requireAuth, async (req: any, res) => {
    try {
      const { teamId, leagueId } = req.body;
      
      if (!teamId || !leagueId) {
        return res.status(400).json({ message: "teamId and leagueId are required" });
      }

      const updated = await storage.updateUser(req.user.id, {
        selectedTeamId: parseInt(teamId),
        selectedLeagueId: leagueId
      });

      if (!updated) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json({ 
        success: true,
        selectedTeamId: updated.selectedTeamId,
        selectedLeagueId: updated.selectedLeagueId
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/leagues/load", requireAuth, async (req: any, res) => {
    try {
      const { espnLeagueId, sport, season } = req.body;
      const userId = req.user.id;

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

      // Upsert logic: check if league exists, update or create
      const existingLeague = await storage.getLeagueByEspnId(userId, espnLeagueId, parseInt(season));
      
      let league;
      if (existingLeague) {
        console.log(`Updating existing league: ESPN ID=${espnLeagueId}, Name="${leagueInfo.name}"`);
        league = await storage.updateLeague(existingLeague.id, leagueInfo);
        if (!league) {
          throw new Error("Failed to update existing league");
        }
      } else {
        console.log(`Creating new league: ESPN ID=${espnLeagueId}, Name="${leagueInfo.name}"`);
        league = await storage.createLeague(leagueInfo);
      }

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

          // Upsert logic: check if team exists, update or create
          const existingTeam = await storage.getTeamByEspnId(league.id, team.id);
          
          const teamData = {
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
          };

          if (existingTeam) {
            console.log(`Updating existing team: ID=${team.id}, Name="${teamName}"`);
            await storage.updateTeam(existingTeam.id, teamData);
          } else {
            console.log(`Creating new team: ID=${team.id}, Name="${teamName}"`);
            await storage.createTeam(teamData);
          }
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
  app.get("/api/leagues/:leagueId/standings", requireAuth, async (req: any, res) => {
    try {
      const league = await storage.getLeague(req.params.leagueId);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }

      const credentials = await storage.getEspnCredentials(league.userId);
      if (!credentials || !credentials.isValid) {
        return res.status(401).json({ message: "Valid ESPN credentials required" });
      }

      // Get live roster data which has both team names AND current stats
      console.log("Fetching live roster data with team stats...");
      const rosterData = await espnApiService.getRosters(
        credentials,
        league.sport,
        league.season,
        league.espnLeagueId
      );

      // Get stored team data for fallback info
      const storedTeams = await storage.getTeams(req.params.leagueId);
      console.log(`Found ${storedTeams.length} stored teams, ${rosterData.teams?.length || 0} live teams`);
      
      // Use stored teams as base, then enhance with live ESPN data
      const transformedTeams = storedTeams.map((storedTeam) => {
        // Find matching live team data
        const liveTeam = rosterData.teams?.find((t: any) => t.id === storedTeam.espnTeamId);
        
        // Handle team name display - use stored full name and split it properly
        const teamName = storedTeam.name || `Team ${storedTeam.espnTeamId}`;
        let location, nickname;
        
        // If the team name looks like a full name (multiple words), split it properly
        if (teamName.includes(' ') && teamName !== `Team ${storedTeam.espnTeamId}`) {
          const nameParts = teamName.split(' ');
          if (nameParts.length >= 2) {
            // For names like "The JJ Express", split as "The JJ" + "Express"  
            const midPoint = Math.ceil(nameParts.length / 2);
            location = nameParts.slice(0, midPoint).join(' ');
            nickname = nameParts.slice(midPoint).join(' ');
          } else {
            location = nameParts[0];
            nickname = nameParts[1] || '';
          }
        } else {
          // For single names like "BaZOOKas", "Ridgeline", use full name as location
          location = teamName;
          nickname = '';
        }
        
        // Get correct owner name from live API data
        let correctOwnerName = storedTeam.owner || 'Unknown Owner';
        if (rosterData.members && liveTeam && liveTeam.owners && liveTeam.owners[0]) {
          const ownerId = liveTeam.owners[0]?.id || liveTeam.owners[0];
          const member = rosterData.members.find((m: any) => m.id === ownerId);
          
          if (member) {
            // Prefer firstName + lastName over displayName
            if (member.firstName && member.lastName) {
              correctOwnerName = `${member.firstName} ${member.lastName}`;
            } else {
              correctOwnerName = member.displayName || 'Unknown Owner';
            }
          }
        }

        // Use live record data if available, otherwise fall back to stored data
        const recordData = liveTeam?.record?.overall || {
          wins: storedTeam.wins || 0,
          losses: storedTeam.losses || 0,
          ties: storedTeam.ties || 0,
          pointsFor: parseFloat(storedTeam.pointsFor || '0'),
          pointsAgainst: parseFloat(storedTeam.pointsAgainst || '0')
        };

        return {
          id: storedTeam.espnTeamId,
          name: teamName, // Add the name field for frontend fallback
          location,
          nickname,
          owners: [{
            displayName: correctOwnerName,
            firstName: correctOwnerName.split(' ')[0] || 'Unknown',
            lastName: correctOwnerName.split(' ').slice(1).join(' ') || 'Owner'
          }],
          record: {
            overall: {
              ...recordData,
              // Convert ESPN streak format to frontend format
              streak: (liveTeam?.record?.overall?.streakType !== undefined && liveTeam?.record?.overall?.streakLength !== undefined) ? {
                type: liveTeam.record.overall.streakType === 'WIN' ? 1 : 0, // 1 = win, 0 = loss
                length: liveTeam.record.overall.streakLength
              } : null
            }
          }
        };
      });

      const transformedData = {
        teams: transformedTeams
      };

      console.log(`Transformed ${transformedData.teams.length} teams with live stats`);

      res.json(transformedData);
    } catch (error: any) {
      console.error('Standings API error:', error);
      
      // Handle ESPN API timeouts and connection errors
      if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED' || error.message?.includes('terminated')) {
        return res.status(503).json({ 
          message: "ESPN API is currently unavailable. Please try again later." 
        });
      }
      
      // Handle ESPN API errors
      if (error.message?.includes('ESPN') || error.message?.includes('API')) {
        return res.status(503).json({ 
          message: "Unable to fetch data from ESPN. Please try again later." 
        });
      }
      
      res.status(500).json({ message: "Failed to load standings data" });
    }
  });

  // Matchups route
  app.get("/api/leagues/:leagueId/matchups", requireAuth, async (req: any, res) => {
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
  app.post("/api/leagues/:leagueId/ai-recommendations", requireAuth, async (req: any, res) => {
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
      const playersResponse = await espnApiService.getPlayers(credentials, league.sport, league.season, league.espnLeagueId.toString());
      
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

      // Filter to get only available waiver wire players (exclude FA players)
      const waiverWirePlayers = (Array.isArray(playersData) ? playersData : []).filter((playerData: any) => {
        const player = playerData.player || playerData;
        // Exclude taken players
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
          topAvailable: waiverWirePlayers.slice(0, 50).map((playerData: any) => {
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
  app.post("/api/leagues/:leagueId/ai-question", requireAuth, async (req: any, res) => {
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

  // AI Recommendations Prompt-Only route (returns prompt instead of calling AI)
  app.post("/api/leagues/:leagueId/ai-recommendations-prompt", requireAuth, async (req: any, res) => {
    try {
      const { teamId } = req.body;
      
      // Helper functions for roster data formatting (local to this endpoint)
      const getNFLTeamName = (teamId: number): string => {
        const teamNames: Record<number, string> = {
          1: "ATL", 2: "BUF", 3: "CHI", 4: "CIN", 5: "CLE", 6: "DAL", 7: "DEN", 8: "DET",
          9: "GB", 10: "TEN", 11: "IND", 12: "KC", 13: "LV", 14: "LAR", 15: "MIA", 16: "MIN",
          17: "NE", 18: "NO", 19: "NYG", 20: "NYJ", 21: "PHI", 22: "ARI", 23: "PIT", 24: "LAC",
          25: "SF", 26: "SEA", 27: "TB", 28: "WAS", 29: "CAR", 30: "JAX", 33: "BAL", 34: "HOU"
        };
        return teamNames[teamId] || "FA";
      };

      const getPositionNameLocal = (positionId: number): string => {
        const positions: Record<number, string> = {
          0: "QB", 1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K", 
          16: "DEF", 17: "K", 23: "FLEX"
        };
        return positions[positionId] || `POS_${positionId}`;
      };

      const getProjectedPoints = (playerData: any): string => {
        const player = playerData.player || playerData;
        const entry = playerData.playerPoolEntry || playerData;
        
        // Look for projection in stats array
        const projection = player.stats?.find((stat: any) => stat.statSourceId === 1 && stat.statSplitTypeId === 1) ||
                          entry.player?.stats?.find((stat: any) => stat.statSourceId === 1 && stat.statSplitTypeId === 1) ||
                          player.projectedStats ||
                          player.outlook?.projectedStats;
        
        if (projection?.appliedTotal !== undefined) {
          return projection.appliedTotal.toFixed(1);
        }
        if (projection?.total !== undefined) {
          return projection.total.toFixed(1);
        }
        return "0.0";
      };

      const getInjuryStatus = (playerData: any): string => {
        const player = playerData.player || playerData;
        const entry = playerData.playerPoolEntry?.player || player;
        
        if (entry.injured || entry.injuryStatus === 'INJURED' || player.injured) {
          return 'Injured';
        }
        if (entry.injuryStatus === 'QUESTIONABLE') {
          return 'Questionable';
        }
        if (entry.injuryStatus === 'DOUBTFUL') {
          return 'Doubtful';
        }
        if (entry.injuryStatus === 'OUT') {
          return 'Out';
        }
        return 'Active';
      };

      const getLineupSlotName = (slotId: number): string => {
        const slots: Record<number, string> = {
          0: "QB",
          2: "RB",
          4: "WR",
          6: "TE",
          16: "D/ST",
          17: "K",
          20: "Bench",
          21: "I.R.",
          23: "FLEX",
          7: "OP",
          10: "UTIL",
          12: "RB/WR/TE"
        };
        return slots[slotId] || `Slot_${slotId}`;
      };

      const league = await storage.getLeague(req.params.leagueId);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }

      const credentials = await storage.getEspnCredentials(league.userId);
      if (!credentials || !credentials.isValid) {
        return res.status(401).json({ message: "Valid ESPN credentials required" });
      }

      console.log(`Generating analysis prompt for team ${teamId} in league ${league.espnLeagueId}`);

      // Get comprehensive data
      const [rostersData, leagueDetailsData, playersResponse] = await Promise.all([
        espnApiService.getRosters(credentials, league.sport, league.season, league.espnLeagueId),
        espnApiService.getLeagueData(credentials, league.sport, league.season, league.espnLeagueId, ['mSettings']),
        espnApiService.getPlayers(credentials, league.sport, league.season, league.espnLeagueId.toString())
      ]);

      // Extract scoring settings
      const settings = leagueDetailsData.settings || rostersData.settings || {};
      let receptionPoints = 0;
      if (settings?.scoringSettings?.scoringItems) {
        const receptionItem = settings.scoringSettings.scoringItems.find((item: any) => item.statId === 53);
        if (receptionItem?.points !== undefined) {
          receptionPoints = receptionItem.points;
        }
      }

      const scoringSettings = {
        scoringType: settings.scoringType || 'Head-to-Head Points',
        isHalfPPR: receptionPoints === 0.5,
        isFullPPR: receptionPoints === 1.0,
        isStandard: receptionPoints === 0,
        receptionPoints: receptionPoints
      };

      // Get current week context
      const currentScoringPeriod = leagueDetailsData.scoringPeriodId || leagueDetailsData.currentScoringPeriod || league.currentWeek || 1;
      const seasonType = league.season >= new Date().getFullYear() ? 'Regular Season' : 'Past Season';
      const weekContext = {
        currentWeek: currentScoringPeriod,
        seasonType,
        season: league.season
      };

      // Find user's team from rosters
      const userTeam = rostersData.teams?.find((t: any) => t.id === teamId);
      if (!userTeam) {
        return res.status(404).json({ message: `Team with ID ${teamId} not found in league` });
      }

      // Format user roster with proper categorization
      const userRoster = userTeam.roster?.entries?.map((entry: any) => {
        const player = entry.playerPoolEntry?.player || entry.player;
        const lineupSlot = entry.lineupSlotId;
        const isBench = lineupSlot === 20;
        const isIR = lineupSlot === 21;
        const isStarter = !isBench && !isIR;
        return {
          name: player?.fullName || 'Unknown Player',
          position: getPositionNameLocal(player?.defaultPositionId) || 'FLEX',
          nflTeam: player?.proTeamId ? getNFLTeamName(player.proTeamId) : 'FA',
          lineupSlot: getLineupSlotName(lineupSlot),
          isStarter: isStarter,
          isBench: isBench,
          isIR: isIR,
          projectedPoints: getProjectedPoints(entry),
          injuryStatus: getInjuryStatus(entry)
        };
      }) || [];

      // Get waiver wire data
      let playersData = [];
      if (Array.isArray(playersResponse)) {
        playersData = playersResponse;
      } else if (playersResponse?.players && Array.isArray(playersResponse.players)) {
        playersData = playersResponse.players;
      }

      // Get taken player IDs
      const takenPlayerIds = new Set();
      rostersData.teams?.forEach((team: any) => {
        team.roster?.entries?.forEach((entry: any) => {
          const playerId = entry.playerPoolEntry?.player?.id || entry.playerId;
          if (playerId) takenPlayerIds.add(playerId);
        });
      });

      // Filter available players and get top 50 (exclude FA players)
      const availablePlayers = playersData
        .filter((playerData: any) => {
          const player = playerData.player || playerData;
          const playerId = player?.id;
          return playerId && !takenPlayerIds.has(playerId);
        })
        .sort((a: any, b: any) => {
          const projA = Number(getProjectedPoints(a)) || 0;
          const projB = Number(getProjectedPoints(b)) || 0;
          return projB - projA;
        })
        .slice(0, 50)
        .map((playerData: any) => {
          const player = playerData.player || playerData;
          return {
            name: player?.fullName || 'Unknown Player',
            position: getPositionNameLocal(player?.defaultPositionId) || 'FLEX',
            nflTeam: player?.proTeamId ? getNFLTeamName(player.proTeamId) : 'FA',
            projectedPoints: getProjectedPoints(playerData),
            ownershipPercent: player?.ownership?.percentOwned?.toFixed(1) || '0.0',
            injuryStatus: getInjuryStatus(playerData)
          };
        });

      // Build league analysis data
      const leagueAnalysisData = {
        userTeam: {
          name: userTeam.location && userTeam.nickname ? `${userTeam.location} ${userTeam.nickname}` : 'Your Team',
          roster: userRoster,
          record: {
            wins: 0,
            losses: 0
          }
        },
        waiverWire: { topAvailable: availablePlayers },
        scoringSettings,
        weekContext,
        league: {
          name: league.name,
          sport: league.sport,
          season: league.season,
          teamCount: rostersData.teams?.length || 0
        }
      };

      console.log(`Prepared analysis data: Team ${leagueAnalysisData.userTeam.name}, ${userRoster.length} players, ${availablePlayers.length} waiver options`);

      // Get the HTML-formatted prompt without calling AI
      const prompt = geminiService.getAnalysisPrompt(leagueAnalysisData);
      res.json({ prompt });
    } catch (error: any) {
      console.error('Prompt Generation Error:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // AI Question Prompt-Only route (returns prompt instead of calling AI)
  app.post("/api/leagues/:leagueId/ai-question-prompt", requireAuth, async (req: any, res) => {
    try {
      const { question, teamId } = req.body;
      if (!question) {
        return res.status(400).json({ message: "Question is required" });
      }
      if (!teamId) {
        return res.status(400).json({ message: "Team ID is required" });
      }

      const league = await storage.getLeague(req.params.leagueId);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }

      const credentials = await storage.getEspnCredentials(league.userId);
      if (!credentials || !credentials.isValid) {
        return res.status(401).json({ message: "Valid ESPN credentials required" });
      }

      // Helper functions for data formatting (same as analysis prompt)
      const getNFLTeamName = (teamId: number): string => {
        const teamNames: Record<number, string> = {
          1: "ATL", 2: "BUF", 3: "CHI", 4: "CIN", 5: "CLE", 6: "DAL", 7: "DEN", 8: "DET",
          9: "GB", 10: "TEN", 11: "IND", 12: "KC", 13: "LV", 14: "LAR", 15: "MIA", 16: "MIN",
          17: "NE", 18: "NO", 19: "NYG", 20: "NYJ", 21: "PHI", 22: "ARI", 23: "PIT", 24: "LAC",
          25: "SF", 26: "SEA", 27: "TB", 28: "WAS", 29: "CAR", 30: "JAX", 33: "BAL", 34: "HOU"
        };
        return teamNames[teamId] || "FA";
      };

      const getPositionNameLocal = (positionId: number): string => {
        const positions: Record<number, string> = {
          0: "QB", 1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K", 
          16: "DEF", 17: "K", 23: "FLEX"
        };
        return positions[positionId] || `POS_${positionId}`;
      };

      const getProjectedPoints = (playerData: any): string => {
        const player = playerData.player || playerData;
        const entry = playerData.playerPoolEntry || playerData;
        
        // Look for projection in stats array
        const projection = player.stats?.find((stat: any) => stat.statSourceId === 1 && stat.statSplitTypeId === 1) ||
                          entry.player?.stats?.find((stat: any) => stat.statSourceId === 1 && stat.statSplitTypeId === 1) ||
                          player.projectedStats ||
                          player.outlook?.projectedStats;
        
        if (projection?.appliedTotal !== undefined) {
          return projection.appliedTotal.toFixed(1);
        }
        if (projection?.total !== undefined) {
          return projection.total.toFixed(1);
        }
        return "0.0";
      };

      const getInjuryStatus = (playerData: any): string => {
        const player = playerData.player || playerData;
        const entry = playerData.playerPoolEntry?.player || player;
        
        if (entry.injured || entry.injuryStatus === 'INJURED' || player.injured) {
          return 'Injured';
        }
        if (entry.injuryStatus === 'QUESTIONABLE') {
          return 'Questionable';
        }
        if (entry.injuryStatus === 'DOUBTFUL') {
          return 'Doubtful';
        }
        if (entry.injuryStatus === 'OUT') {
          return 'Out';
        }
        return 'Active';
      };

      const getLineupSlotName = (slotId: number): string => {
        const slots: Record<number, string> = {
          0: "QB", 2: "RB", 4: "WR", 6: "TE", 16: "D/ST", 17: "K", 20: "Bench", 21: "I.R.", 23: "FLEX", 7: "OP", 10: "UTIL", 12: "RB/WR/TE"
        };
        return slots[slotId] || `Slot_${slotId}`;
      };

      console.log(`Generating question prompt for team ${teamId} in league ${league.espnLeagueId}`);

      // Get comprehensive live data (same as analysis prompt)
      const [rostersData, leagueDetailsData, playersResponse] = await Promise.all([
        espnApiService.getRosters(credentials, league.sport, league.season, league.espnLeagueId),
        espnApiService.getLeagueData(credentials, league.sport, league.season, league.espnLeagueId, ['mSettings']),
        espnApiService.getPlayers(credentials, league.sport, league.season, league.espnLeagueId.toString())
      ]);

      console.log('Rosters data teams:', rostersData.teams?.length || 0);
      console.log('Looking for team ID:', teamId);

      // Extract scoring settings
      const settings = leagueDetailsData.settings || rostersData.settings || {};
      let receptionPoints = 0;
      if (settings?.scoringSettings?.scoringItems) {
        const receptionItem = settings.scoringSettings.scoringItems.find((item: any) => item.statId === 53);
        if (receptionItem?.points !== undefined) {
          receptionPoints = receptionItem.points;
        }
      }

      const scoringSettings = {
        scoringType: settings.scoringType || 'Head-to-Head Points',
        isHalfPPR: receptionPoints === 0.5,
        isFullPPR: receptionPoints === 1.0,
        isStandard: receptionPoints === 0,
        receptionPoints: receptionPoints
      };

      // Get current week context
      const currentScoringPeriod = leagueDetailsData.scoringPeriodId || leagueDetailsData.currentScoringPeriod || league.currentWeek || 1;
      const seasonType = league.season >= new Date().getFullYear() ? 'Regular Season' : 'Past Season';
      const weekContext = {
        currentWeek: currentScoringPeriod,
        seasonType,
        season: league.season
      };

      // Find user's team from rosters
      const userTeam = rostersData.teams?.find((t: any) => t.id === teamId);
      if (!userTeam) {
        console.error(`Team with ID ${teamId} not found. Available teams:`, rostersData.teams?.map((t: any) => ({ id: t.id, location: t.location, nickname: t.nickname })));
        return res.status(404).json({ message: `Team with ID ${teamId} not found in league` });
      }

      console.log('Found user team:', { id: userTeam.id, location: userTeam.location, nickname: userTeam.nickname });

      // Helper function to get team name safely
      const getTeamName = (team: any): string => {
        if (team.location && team.nickname) {
          return `${team.location} ${team.nickname}`;
        }
        if (team.name) {
          return team.name;
        }
        if (team.location) {
          return team.location;
        }
        if (team.nickname) {
          return team.nickname;
        }
        return `Team ${team.id}`;
      };

      // Format user roster with proper categorization
      const userRoster = userTeam.roster?.entries?.map((entry: any) => {
        const player = entry.playerPoolEntry?.player || entry.player;
        const lineupSlot = entry.lineupSlotId;
        const isBench = lineupSlot === 20;
        const isIR = lineupSlot === 21;
        const isStarter = !isBench && !isIR;
        return {
          name: player?.fullName || 'Unknown Player',
          position: getPositionNameLocal(player?.defaultPositionId) || 'FLEX',
          nflTeam: player?.proTeamId ? getNFLTeamName(player.proTeamId) : 'FA',
          lineupSlot: getLineupSlotName(lineupSlot),
          isStarter: isStarter,
          isBench: isBench,
          isIR: isIR,
          projectedPoints: getProjectedPoints(entry),
          injuryStatus: getInjuryStatus(entry)
        };
      }) || [];

      console.log('User roster length:', userRoster.length);
      console.log('Sample roster players:', userRoster.slice(0, 3).map((p: any) => ({ name: p.name, position: p.position, isStarter: p.isStarter })));

      // Get waiver wire data
      let playersData = [];
      if (Array.isArray(playersResponse)) {
        playersData = playersResponse;
      } else if (playersResponse?.players && Array.isArray(playersResponse.players)) {
        playersData = playersResponse.players;
      }

      // Get taken player IDs
      const takenPlayerIds = new Set();
      rostersData.teams?.forEach((team: any) => {
        team.roster?.entries?.forEach((entry: any) => {
          const playerId = entry.playerPoolEntry?.player?.id || entry.playerId;
          if (playerId) takenPlayerIds.add(playerId);
        });
      });

      // Get top available players (exclude FA players)
      const availablePlayers = playersData
        .filter((playerData: any) => {
          const player = playerData.player || playerData;
          const playerId = player?.id;
          return playerId && !takenPlayerIds.has(playerId);
        })
        .slice(0, 50)
        .map((playerData: any) => {
          const player = playerData.player || playerData;
          return {
            name: player?.fullName || 'Unknown Player',
            position: getPositionNameLocal(player?.defaultPositionId) || 'FLEX',
            nflTeam: player?.proTeamId ? getNFLTeamName(player.proTeamId) : 'FA',
            projectedPoints: getProjectedPoints(playerData),
            injuryStatus: getInjuryStatus(playerData),
            percentOwned: player?.ownership?.percentOwned?.toFixed(1) || '0.0'
          };
        });

      // Build comprehensive context data
      const contextData = {
        userTeam: {
          name: getTeamName(userTeam),
          record: userTeam.record ? `${userTeam.record.overall.wins}-${userTeam.record.overall.losses}` : 'Unknown',
          roster: userRoster,
          starters: userRoster.filter((p: any) => p.isStarter),
          bench: userRoster.filter((p: any) => p.isBench),
          ir: userRoster.filter((p: any) => p.isIR)
        },
        scoringSettings,
        weekContext,
        teams: rostersData.teams?.map((team: any) => ({
          name: getTeamName(team),
          record: team.record ? `${team.record.overall.wins}-${team.record.overall.losses}` : 'Unknown',
          points: team.record?.overall?.pointsFor || 0
        })) || [],
        availablePlayers,
        leagueSize: rostersData.teams?.length || 12
      };

      console.log('Context data summary:', {
        userTeamName: contextData.userTeam.name,
        rosterCount: contextData.userTeam.roster.length,
        startersCount: contextData.userTeam.starters.length,
        benchCount: contextData.userTeam.bench.length,
        teamsCount: contextData.teams.length,
        scoringType: contextData.scoringSettings.isFullPPR ? 'Full PPR' : contextData.scoringSettings.isHalfPPR ? 'Half PPR' : 'Standard'
      });

      // Get the prompt with comprehensive live data
      const prompt = geminiService.getQuestionPrompt(question, contextData);
      res.json({ prompt });
    } catch (error: any) {
      console.error('Question Prompt Generation Error:', error);
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
  app.post("/api/leagues/:leagueId/trade-analysis", requireAuth, async (req: any, res) => {
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
      const userTeamWithRoster = allTeams.find((team: any) => team.id === userTeam.id) || {
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

  // Trade analysis prompt-only route (returns prompt instead of calling AI)
  app.post("/api/leagues/:leagueId/trade-analysis-prompt", requireAuth, async (req: any, res) => {
    try {
      const { selectedPlayer, teamId } = req.body;
      if (!selectedPlayer) {
        return res.status(400).json({ message: "Selected player is required" });
      }
      if (!teamId) {
        return res.status(400).json({ message: "Team ID is required" });
      }

      const league = await storage.getLeague(req.params.leagueId);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }

      const credentials = await storage.getEspnCredentials(league.userId);
      if (!credentials || !credentials.isValid) {
        return res.status(401).json({ message: "Valid ESPN credentials required" });
      }

      console.log(`Generating trade analysis prompt for team ${teamId} in league ${league.espnLeagueId}`);

      // Get comprehensive roster data for all teams (same as trade-analysis route)
      const [standingsData, rostersData, leagueDetailsData] = await Promise.all([
        espnApiService.getStandings(credentials, league.sport, league.season, league.espnLeagueId),
        espnApiService.getRosters(credentials, league.sport, league.season, league.espnLeagueId),
        espnApiService.getLeagueData(credentials, league.sport, league.season, league.espnLeagueId, ['mSettings'])
      ]);

      // Extract scoring settings (simplified)
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

      // Find user's team using the provided teamId (normalize types for comparison)
      const userTeam = standingsData.teams?.find((t: any) => String(t.id) === String(teamId));
      if (!userTeam) {
        return res.status(404).json({ message: `Team with ID ${teamId} not found in league` });
      }

      // Get roster data for all teams
      const allTeams = rostersData.teams?.map((team: any) => {
        const standingsTeam = standingsData.teams?.find((t: any) => String(t.id) === String(team.id));
        return {
          id: team.id,
          name: team.name || `Team ${team.id}`,
          roster: team.roster?.entries?.map((entry: any) => ({
            name: entry.playerPoolEntry?.player?.fullName || 'Unknown Player',
            position: getPositionName(entry.playerPoolEntry?.player?.defaultPositionId) || 'FLEX',
            isStarter: entry.lineupSlotId !== 20,
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
      const userTeamWithRoster = allTeams.find((team: any) => team.id === userTeam.id) || {
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

      // Get the prompt without calling AI
      const prompt = geminiService.getTradeAnalysisPrompt(
        selectedPlayer,
        userTeamWithRoster,
        allTeams,
        leagueSettings
      );

      res.json({ prompt });
    } catch (error: any) {
      console.error('Trade Analysis Prompt Error:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // Rosters route
  app.get("/api/leagues/:leagueId/rosters", requireAuth, async (req: any, res) => {
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
  app.get("/api/players/:sport/:season", requireAuth, async (req: any, res) => {
    try {
      const { sport, season } = req.params;
      const { leagueId } = req.query;

      const credentials = await storage.getEspnCredentials(req.user.id);
      if (!credentials || !credentials.isValid) {
        return res.status(401).json({ message: "Valid ESPN credentials required" });
      }

      // If leagueId is provided, get the ESPN league ID for better data (including opponents)
      let espnLeagueId = undefined;
      if (leagueId) {
        const league = await storage.getLeague(leagueId as string);
        if (league) {
          espnLeagueId = league.espnLeagueId.toString();
        }
      }

      const playersData = await espnApiService.getPlayers(
        credentials,
        sport,
        parseInt(season),
        espnLeagueId
      );

      res.json(playersData);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Teams route
  app.get("/api/leagues/:leagueId/teams", requireAuth, async (req: any, res) => {
    try {
      const teams = await storage.getTeams(req.params.leagueId);
      res.json(teams);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Waiver wire route - get available players not on any roster
  app.get("/api/leagues/:leagueId/waiver-wire", requireAuth, async (req: any, res) => {
    try {
      const league = await storage.getLeague(req.params.leagueId);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }

      const credentials = await storage.getEspnCredentials(league.userId);
      if (!credentials || !credentials.isValid) {
        return res.status(401).json({ message: "Valid ESPN credentials required" });
      }

      // Get league info to find current scoring period
      const leagueData = await espnApiService.getLeagueData(
        credentials,
        league.sport,
        league.season,
        league.espnLeagueId
      );
      const currentScoringPeriodId = leagueData.scoringPeriodId || 1;
      console.log('Current scoring period for waiver wire:', currentScoringPeriodId);

      // Get all players
      const playersData = await espnApiService.getPlayers(
        credentials,
        league.sport,
        league.season,
        league.espnLeagueId.toString()
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

      console.log(`Waiver wire: ${waiverWirePlayers.length} available players out of ${takenPlayerIds.size} taken`);

      res.json({ 
        players: waiverWirePlayers,
        total: waiverWirePlayers.length,
        takenPlayers: takenPlayerIds.size,
        currentScoringPeriodId: currentScoringPeriodId
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Export waiver wire as CSV
  app.get("/api/leagues/:leagueId/waiver-wire/export", requireAuth, async (req: any, res) => {
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
        league.season,
        league.espnLeagueId.toString()
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
        const entry = playerData.playerPoolEntry?.player || player;
        
        if (entry.injuryStatus === 'INJURY_RESERVE' || entry.injuryStatus === 'IR') {
          return 'IR - "Injured Reserve"';
        }
        if (entry.injuryStatus === 'QUESTIONABLE' || entry.injuryStatus === 'Q') {
          return 'Q - "Questionable"';
        }
        if (entry.injuryStatus === 'DOUBTFUL' || entry.injuryStatus === 'D') {
          return 'D - "Doubtful"';
        }
        if (entry.injuryStatus === 'OUT' || entry.injuryStatus === 'O') {
          return 'O - "Out"';
        }
        if (entry.injured || entry.injuryStatus === 'INJURED' || player.injured) {
          return 'Injured';
        }
        return 'Active';
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
  app.get('/api/leagues/:id/roster-export', requireAuth, async (req: any, res) => {
    try {
      const leagueId = req.params.id;
      const league = await storage.getLeague(leagueId);
      
      if (!league) {
        return res.status(404).json({ message: 'League not found' });
      }

      const credentials = await storage.getEspnCredentials(req.user.id);
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
        const entry = playerData.playerPoolEntry?.player || player;
        
        if (entry.injuryStatus === 'INJURY_RESERVE' || entry.injuryStatus === 'IR') {
          return 'IR - "Injured Reserve"';
        }
        if (entry.injuryStatus === 'QUESTIONABLE' || entry.injuryStatus === 'Q') {
          return 'Q - "Questionable"';
        }
        if (entry.injuryStatus === 'DOUBTFUL' || entry.injuryStatus === 'D') {
          return 'D - "Doubtful"';
        }
        if (entry.injuryStatus === 'OUT' || entry.injuryStatus === 'O') {
          return 'O - "Out"';
        }
        if (entry.injured || entry.injuryStatus === 'INJURED' || player.injured) {
          return 'Injured';
        }
        return 'Active';
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
  app.get('/api/leagues/:id/teams/:teamId/roster-export', requireAuth, async (req: any, res) => {
    try {
      const leagueId = req.params.id;
      const teamId = parseInt(req.params.teamId);
      
      const league = await storage.getLeague(leagueId);
      
      if (!league) {
        return res.status(404).json({ message: 'League not found' });
      }

      const credentials = await storage.getEspnCredentials(req.user.id);
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
        const entry = playerData.playerPoolEntry?.player || player;
        
        if (entry.injuryStatus === 'INJURY_RESERVE' || entry.injuryStatus === 'IR') {
          return 'IR - "Injured Reserve"';
        }
        if (entry.injuryStatus === 'QUESTIONABLE' || entry.injuryStatus === 'Q') {
          return 'Q - "Questionable"';
        }
        if (entry.injuryStatus === 'DOUBTFUL' || entry.injuryStatus === 'D') {
          return 'D - "Doubtful"';
        }
        if (entry.injuryStatus === 'OUT' || entry.injuryStatus === 'O') {
          return 'O - "Out"';
        }
        if (entry.injured || entry.injuryStatus === 'INJURED' || player.injured) {
          return 'Injured';
        }
        return 'Active';
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

  // Optimize team lineup using AI
  app.post('/api/leagues/:id/teams/:teamId/optimize-lineup', requireAuth, async (req: any, res) => {
    try {
      const leagueId = req.params.id;
      const teamId = parseInt(req.params.teamId);
      
      const league = await storage.getLeague(leagueId);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }

      const credentials = await storage.getEspnCredentials(league.userId);
      if (!credentials || !credentials.isValid) {
        return res.status(401).json({ message: "Valid ESPN credentials required" });
      }

      // Get live roster data from ESPN
      const rosterData = await espnApiService.getRosters(
        credentials,
        league.sport,
        league.season,
        league.espnLeagueId
      );

      // Find the specific team
      const team = rosterData.teams?.find((t: any) => t.id === teamId);
      if (!team) {
        return res.status(404).json({ message: "Team not found" });
      }

      // Get league settings for AI context
      const leagueSettings = {
        receptionPoints: rosterData.settings?.scoringSettings?.receptionPoints || 0,
        season: league.season,
        teamCount: rosterData.teams?.length || 0
      };

      // Calculate current NFL week (2025 season starts Sept 4, 2025)
      const currentDate = new Date();
      const seasonStartDate = new Date('2025-09-04');
      const daysSinceStart = Math.floor((currentDate.getTime() - seasonStartDate.getTime()) / (1000 * 60 * 60 * 24));
      const nflWeek = Math.max(1, Math.min(18, Math.ceil(daysSinceStart / 7) + 1));

      // Format current date for AI
      const formattedDate = currentDate.toLocaleDateString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });

      console.log(`Optimizing lineup for team ${teamId} - Week ${nflWeek}, Date: ${formattedDate}`);

      // Call Gemini AI to optimize lineup
      const optimization = await geminiService.optimizeLineup(
        team.roster?.entries || [],
        leagueSettings,
        formattedDate,
        nflWeek
      );

      res.json(optimization);
    } catch (error: any) {
      console.error('Lineup optimization error:', error);
      res.status(500).json({ message: error.message || 'Failed to optimize lineup' });
    }
  });

  // Optimize team lineup prompt-only (returns prompt instead of calling AI)
  app.post('/api/leagues/:id/teams/:teamId/optimize-lineup-prompt', requireAuth, async (req: any, res) => {
    try {
      const leagueId = req.params.id;
      const teamId = parseInt(req.params.teamId);
      const { options = {} } = req.body;

      console.log(`Generating optimize lineup prompt for league ${leagueId}, team ${teamId}`);
      console.log('Context data options received:', {
        includeFantasyPros: options.includeFantasyPros,
        includeVegasOdds: options.includeVegasOdds,
        includeInjuryReports: options.includeInjuryReports,
        includeWeatherData: options.includeWeatherData,
        includeNewsUpdates: options.includeNewsUpdates,
        includeMatchupAnalysis: options.includeMatchupAnalysis
      });
      
      const league = await storage.getLeague(leagueId);
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }

      const credentials = await storage.getEspnCredentials(league.userId);
      if (!credentials || !credentials.isValid) {
        return res.status(401).json({ message: "Valid ESPN credentials required" });
      }

      // Get live roster data and league settings from ESPN
      const [rosterData, leagueDetailsData] = await Promise.all([
        espnApiService.getRosters(credentials, league.sport, league.season, league.espnLeagueId),
        espnApiService.getLeagueData(credentials, league.sport, league.season, league.espnLeagueId, ['mSettings'])
      ]);

      // Find the specific team
      const team = rosterData.teams?.find((t: any) => t.id === teamId);
      if (!team) {
        return res.status(404).json({ message: "Team not found" });
      }

      // Extract scoring settings correctly by searching for reception points (statId 53)
      let receptionPoints = 0;
      const settingsSources = [leagueDetailsData.settings, rosterData.settings];
      
      for (const settings of settingsSources) {
        if (settings?.scoringSettings?.scoringItems) {
          const receptionItem = settings.scoringSettings.scoringItems.find((item: any) => item.statId === 53);
          if (receptionItem?.points !== undefined) {
            receptionPoints = receptionItem.points;
            break;
          }
        }
      }

      // Get league settings for AI context
      const leagueSettings = {
        receptionPoints,
        season: league.season,
        teamCount: rosterData.teams?.length || 0
      };

      // Calculate current NFL week
      const currentDate = new Date();
      const seasonStartDate = new Date('2025-09-04');
      const daysSinceStart = Math.floor((currentDate.getTime() - seasonStartDate.getTime()) / (1000 * 60 * 60 * 24));
      const nflWeek = Math.max(1, Math.min(18, Math.ceil(daysSinceStart / 7) + 1));

      // Format current date for AI
      const formattedDate = currentDate.toLocaleDateString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });

      console.log(`Generating lineup optimization prompt for team ${teamId} - Week ${nflWeek}, Date: ${formattedDate}`);

      // Helper functions for consistent formatting (matching custom prompt pattern)
      const getLineupSlotName = (slotId: number): string => {
        const slots: Record<number, string> = {
          0: "QB", 2: "RB", 4: "WR", 6: "TE", 16: "D/ST", 17: "K", 20: "Bench", 21: "I.R.", 23: "FLEX", 7: "OP", 10: "UTIL", 12: "RB/WR/TE"
        };
        return slots[slotId] || `Slot_${slotId}`;
      };

      const getScoringDescription = (settings: any): string => {
        if (receptionPoints === 1) {
          return "Full PPR (1 point per reception)";
        } else if (receptionPoints === 0.5) {
          return "Half PPR (0.5 points per reception)";
        } else {
          return "Standard (0 points per reception)";
        }
      };

      // Separate starters, bench, and IR
      const roster = team.roster?.entries || [];
      const starters = roster.filter((entry: any) => entry.lineupSlotId !== 20 && entry.lineupSlotId !== 21);
      const bench = roster.filter((entry: any) => entry.lineupSlotId === 20 || entry.lineupSlotId === 21);

      // Format starter info
      const startersInfo = starters.map((entry: any) => {
        const player = entry.playerPoolEntry?.player;
        if (!player) return null;
        
        const position = player.defaultPositionId === 1 ? "QB" : 
                         player.defaultPositionId === 2 ? "RB" :
                         player.defaultPositionId === 3 ? "WR" :
                         player.defaultPositionId === 4 ? "TE" :
                         player.defaultPositionId === 5 ? "K" : "DEF";
        
        const lineupSlotName = getLineupSlotName(entry.lineupSlotId);
        return `[${lineupSlotName}] ${player.fullName} (${position})`;
      }).filter(Boolean).join('\n');

      // Format bench info
      const benchInfo = bench.map((entry: any) => {
        const player = entry.playerPoolEntry?.player;
        if (!player) return null;
        
        const position = player.defaultPositionId === 1 ? "QB" : 
                         player.defaultPositionId === 2 ? "RB" :
                         player.defaultPositionId === 3 ? "WR" :
                         player.defaultPositionId === 4 ? "TE" :
                         player.defaultPositionId === 5 ? "K" : "DEF";
        
        const lineupSlotName = getLineupSlotName(entry.lineupSlotId);
        return `[${lineupSlotName}] ${player.fullName} (${position})`;
      }).filter(Boolean).join('\n');

      // Build prompt sections array like custom prompt endpoint
      const promptSections = [];

      // Add main optimization context
      promptSections.push(
        `You are an expert fantasy football analyst optimizing a lineup for Week ${nflWeek} of the 2025 NFL season.\n\n` +
        `==== CURRENT DATE & CONTEXT ====\n` +
        `Today: ${formattedDate}\n` +
        `NFL Week: ${nflWeek}\n` +
        `Note: Use your knowledge of current player performance, injuries, matchups, and recent news to provide accurate recommendations.\n\n` +
        `==== LEAGUE SETTINGS ====\n` +
        `League Size: ${leagueSettings.teamCount}-team league\n` +
        `Scoring: ${getScoringDescription(leagueSettings)}\n` +
        `Season: ${league.season}\n\n` +
        `==== CURRENT STARTING LINEUP ====\n` +
        `${startersInfo || 'No starters found'}\n\n` +
        `==== BENCH PLAYERS ====\n` +
        `${benchInfo || 'No bench players'}\n\n` +
        `==== LINEUP OPTIMIZATION REQUESTED ====\n` +
        `Analyze this roster and provide an optimized lineup for Week ${nflWeek}. Consider:\n\n` +
        `1. **Current Week Matchups**: Which players have favorable matchups this week?\n` +
        `2. **Recent Performance**: Who's hot and who's cold right now?\n` +
        `3. **Injury Status**: Are there any injury concerns affecting the current lineup?\n` +
        `4. **Scoring Format**: How does ${getScoringDescription(leagueSettings)} scoring affect player values?\n` +
        `5. **Start/Sit Decisions**: Should any bench players be starting over current starters?\n\n`
      );

      // Add research directives for AI to gather external data (same pattern as custom prompt)
      const researchDirectives = [];
      
      if (options.includeFantasyPros) {
        researchDirectives.push("- Research current FantasyPros expert consensus rankings and start/sit recommendations for this week");
      }

      if (options.includeVegasOdds) {
        researchDirectives.push("- Look up current Vegas betting lines, over/under totals, and player prop bets for relevant NFL games");
      }

      if (options.includeInjuryReports) {
        researchDirectives.push("- Check the latest NFL injury reports and player statuses (questionable, doubtful, out) from official sources");
      }

      if (options.includeWeatherData) {
        researchDirectives.push("- Research current weather forecasts for outdoor NFL stadiums this week (temperature, wind, precipitation)");
      }

      if (options.includeNewsUpdates) {
        researchDirectives.push("- Find the latest NFL news, beat reporter updates, and breaking news that could impact player performance");
      }

      if (options.includeMatchupAnalysis) {
        researchDirectives.push("- Analyze defensive matchups and recent performance trends against specific positions (QB, RB, WR, TE)");
      }

      if (researchDirectives.length > 0) {
        promptSections.push(
          `==== RESEARCH INSTRUCTIONS ====\n` +
          `Please research and incorporate the following external data sources into your analysis:\n\n` +
          researchDirectives.join('\n') + '\n\n' +
          `Use this research to provide more informed lineup optimization recommendations.\n\n`
        );
      }

      promptSections.push(
        `**IMPORTANT: Provide specific actionable recommendations based on current NFL information.**\n`
      );

      const finalPrompt = promptSections.join('\n');

      console.log(`Generated optimize lineup prompt with ${promptSections.length} sections`);

      res.json({ prompt: finalPrompt });
    } catch (error: any) {
      console.error('Optimize lineup prompt generation error:', error);
      res.status(500).json({ message: error.message || 'Failed to generate optimize lineup prompt' });
    }
  });

  // Custom prompt builder endpoint
  app.post("/api/leagues/:leagueId/custom-prompt", requireAuth, async (req: any, res) => {
    try {
      const { leagueId } = req.params;
      const { teamId, customPrompt, options } = req.body;

      console.log(`Generating custom prompt for league ${leagueId}, team ${teamId}`);
      console.log('Context data options received:', {
        includeFantasyPros: options.includeFantasyPros,
        includeVegasOdds: options.includeVegasOdds,
        includeInjuryReports: options.includeInjuryReports,
        includeWeatherData: options.includeWeatherData,
        includeNewsUpdates: options.includeNewsUpdates,
        includeMatchupAnalysis: options.includeMatchupAnalysis
      });

      // Get league data from storage
      const leagues = await storage.getLeagues(req.user.id);
      const league = leagues.find(l => l.id === leagueId);
      
      if (!league) {
        return res.status(404).json({ message: "League not found" });
      }

      // Get ESPN data with comprehensive views (same as waiver wire endpoint)
      const credentials = await storage.getEspnCredentials(req.user.id);
      if (!credentials) {
        return res.status(404).json({ message: 'ESPN credentials not found' });
      }

      // Get league data for current scoring period
      const leagueData = await espnApiService.getLeagueData(
        credentials,
        league.sport,
        league.season,
        league.espnLeagueId
      );
      const currentScoringPeriodId = leagueData.scoringPeriodId || 1;

      // Get all players using the same method as waiver wire endpoint
      const playersData = await espnApiService.getPlayers(
        credentials,
        league.sport,
        league.season,
        league.espnLeagueId.toString()
      );

      // Get all rosters using the same method as waiver wire endpoint
      const rostersData = await espnApiService.getRosters(
        credentials,
        league.sport,
        league.season,
        league.espnLeagueId
      );

      // Get settings for league info
      const leagueSettingsData = await espnApiService.getLeagueData(
        credentials,
        league.sport,
        league.season,
        league.espnLeagueId,
        ['mSettings']
      );

      // Helper functions
      const getTeamName = (teamData: any): string => {
        if (teamData?.location && teamData?.nickname) {
          return `${teamData.location} ${teamData.nickname}`;
        }
        if (teamData?.id) {
          return `Team ${teamData.id}`;
        }
        return "Unknown Team";
      };

      const getPlayerTeam = (proTeamId: number): string => {
        const teams: Record<number, string> = {
          1: "ATL", 2: "BUF", 3: "CHI", 4: "CIN", 5: "CLE", 6: "DAL", 7: "DEN", 8: "DET",
          9: "GB", 10: "TEN", 11: "IND", 12: "KC", 13: "LV", 14: "LAR", 15: "MIA", 16: "MIN",
          17: "NE", 18: "NO", 19: "NYG", 20: "NYJ", 21: "PHI", 22: "ARI", 23: "PIT", 24: "LAC",
          25: "SF", 26: "SEA", 27: "TB", 28: "WAS", 29: "CAR", 30: "JAX", 33: "BAL", 34: "HOU"
        };
        return teams[proTeamId] || "FA";
      };

      const getPositionName = (positionId: number): string => {
        const positions: Record<number, string> = {
          1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K", 16: "D/ST"
        };
        return positions[positionId] || "Unknown";
      };

      const getSlotName = (slotId: number): string => {
        const slots: Record<number, string> = {
          0: "QB", 2: "RB", 4: "WR", 6: "TE", 16: "D/ST", 17: "K", 20: "Bench", 21: "I.R.", 23: "FLEX", 7: "OP", 10: "UTIL", 12: "RB/WR/TE"
        };
        return slots[slotId] || `Slot_${slotId}`;
      };

      const getScoringDescription = (settings: any): string => {
        if (!settings.scoringSettings) {
          return "Standard";
        }

        const scoringSettings = settings.scoringSettings;
        let description = "";

        // Check for basic scoring type
        if (scoringSettings.scoringType === 0) {
          description = "Standard";
        } else if (scoringSettings.scoringType === 1) {
          description = "PPR";
        } else {
          // For custom scoring, try to determine reception points
          let receptionPoints = 0;
          
          // Try direct property first
          if (scoringSettings.receptionPoints !== undefined) {
            receptionPoints = scoringSettings.receptionPoints;
          } else if (scoringSettings.scoringItems && Array.isArray(scoringSettings.scoringItems)) {
            // Look for reception scoring in scoring items
            const receptionItem = scoringSettings.scoringItems.find((item: any) => 
              item.statId === 53 || item.itemId === 53
            );
            if (receptionItem && receptionItem.points !== undefined) {
              receptionPoints = receptionItem.points;
            }
          }

          // Determine scoring type based on reception points
          if (receptionPoints === 0) {
            description = "Standard (0 PPR)";
          } else if (receptionPoints === 0.5) {
            description = "Half PPR (0.5 points per reception)";
          } else if (receptionPoints === 1.0) {
            description = "Full PPR (1 point per reception)";
          } else if (receptionPoints > 0) {
            description = `Custom PPR (${receptionPoints} points per reception)`;
          } else {
            description = "Custom Scoring";
          }
        }

        return description;
      };

      // Player helper functions (same as working waiver wire endpoint)
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

      const getInjuryStatus = (playerData: any): string => {
        const player = playerData.player || playerData;
        const entry = playerData.playerPoolEntry?.player || player;
        
        if (entry.injuryStatus === 'INJURY_RESERVE' || entry.injuryStatus === 'IR') {
          return 'IR - "Injured Reserve"';
        }
        if (entry.injuryStatus === 'QUESTIONABLE' || entry.injuryStatus === 'Q') {
          return 'Q - "Questionable"';
        }
        if (entry.injuryStatus === 'DOUBTFUL' || entry.injuryStatus === 'D') {
          return 'D - "Doubtful"';
        }
        if (entry.injuryStatus === 'OUT' || entry.injuryStatus === 'O') {
          return 'O - "Out"';
        }
        if (entry.injured || entry.injuryStatus === 'INJURED' || player.injured) {
          return 'Injured';
        }
        return 'Active';
      };

      let promptSections = [];

      // Add custom prompt first
      if (customPrompt?.trim()) {
        promptSections.push(`==== YOUR QUESTION ====\n${customPrompt.trim()}\n`);
      }

      // Add league settings if requested
      if (options.includeLeagueSettings && leagueSettingsData?.settings) {
        const settings = leagueSettingsData.settings;
        promptSections.push(
          `==== LEAGUE SETTINGS ====\n` +
          `League: ${league.name} (${league.season})\n` +
          `Teams: ${settings.size || 'Unknown'}\n` +
          `Scoring: ${getScoringDescription(settings)}\n` +
          `Roster Format: ${settings.rosterSettings?.lineupSlotCounts ? 
            Object.entries(settings.rosterSettings.lineupSlotCounts)
              .filter(([slot, count]) => (count as number) > 0)
              .map(([slot, count]) => `${getSlotName(parseInt(slot))}: ${count}`)
              .join(', ') : 'Standard'}\n`
        );
      }

      // Add my team roster if requested
      if (options.includeMyTeam && teamId) {
        const myTeam = rostersData?.teams?.find((t: any) => t.id === parseInt(teamId));
        if (myTeam?.roster?.entries) {
          const teamName = getTeamName(myTeam);
          promptSections.push(
            `==== YOUR TEAM: ${teamName} ====\n` +
            myTeam.roster.entries
              .filter((entry: any) => entry.playerPoolEntry?.player)
              .map((entry: any) => {
                const name = getPlayerName(entry.playerPoolEntry);
                const team = getPlayerTeam(getProTeamId(entry.playerPoolEntry));
                const position = getPositionName(getPlayerPositionId(entry.playerPoolEntry));
                const slotName = getSlotName(entry.lineupSlotId);
                return `${name} (${position}, ${team}) - ${slotName}`;
              })
              .join('\n') + '\n'
          );
        }
      }

      // Add other teams if requested
      if (options.includeOtherTeams === 'all' && rostersData?.teams) {
        const otherTeams = rostersData.teams.filter((t: any) => t.id !== parseInt(teamId));
        for (const team of otherTeams) {
          if (team.roster?.entries) {
            const teamName = getTeamName(team);
            promptSections.push(
              `==== ${teamName} ====\n` +
              team.roster.entries
                .filter((entry: any) => entry.playerPoolEntry?.player)
                .map((entry: any) => {
                  const player = entry.playerPoolEntry.player;
                  const name = player.fullName || 'Unknown Player';
                  const team = getPlayerTeam(player.proTeamId);
                  const position = getPositionName(player.defaultPositionId);
                  const slotName = getSlotName(entry.lineupSlotId);
                  return `${name} (${position}, ${team}) - ${slotName}`;
                })
                .join('\n') + '\n'
            );
          }
        }
      } else if (options.includeOtherTeams === 'specific' && options.selectedOtherTeams?.length > 0 && rostersData?.teams) {
        for (const selectedTeamId of options.selectedOtherTeams) {
          const team = rostersData.teams.find((t: any) => t.id === parseInt(selectedTeamId));
          if (team?.roster?.entries) {
            const teamName = getTeamName(team);
            promptSections.push(
              `==== ${teamName} ====\n` +
              team.roster.entries
                .filter((entry: any) => entry.playerPoolEntry?.player)
                .map((entry: any) => {
                  const player = entry.playerPoolEntry.player;
                  const name = player.fullName || 'Unknown Player';
                  const team = getPlayerTeam(player.proTeamId);
                  const position = getPositionName(player.defaultPositionId);
                  const slotName = getSlotName(entry.lineupSlotId);
                  return `${name} (${position}, ${team}) - ${slotName}`;
                })
                .join('\n') + '\n'
            );
          }
        }
      }

      // Add waiver wire players if requested
      if (options.includeWaiverWire !== 'none' && playersData?.players) {
        // Use comprehensive logic to identify taken players (same as waiver-wire endpoint)
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

        console.log(`Custom prompt: Found ${takenPlayerIds.size} taken players out of ${playersData.players?.length || 0} total players`);
        
        // Debug: Log sample player data structure
        if (playersData.players && playersData.players.length > 0) {
          console.log('Sample player data structure:', JSON.stringify(playersData.players[0], null, 2));
          console.log('Player has proTeamId:', playersData.players[0]?.proTeamId);
          console.log('Player has defaultPositionId:', playersData.players[0]?.defaultPositionId);
          console.log('Player has id:', playersData.players[0]?.id);
        }

        // Filter out taken players and FA players to get actual waiver wire
        // Use the same pattern as working waiver wire endpoints
        let availablePlayers = playersData.players.filter((playerData: any) => {
          const player = playerData.player || playerData; // Handle both nested and direct structures
          const proTeamId = player?.proTeamId;
          const isNotTaken = !takenPlayerIds.has(player.id);
          const hasValidTeam = proTeamId && proTeamId > 0;
          
          console.log(`Player ${player?.fullName || player?.id}: proTeamId=${proTeamId}, isNotTaken=${isNotTaken}, hasValidTeam=${hasValidTeam}`);
          
          return isNotTaken && hasValidTeam;
        });

        console.log(`Custom prompt: ${availablePlayers.length} available players after filtering taken players`);
        
        // Debug: Log sample available player
        if (availablePlayers.length > 0) {
          console.log('Sample available player:', JSON.stringify(availablePlayers[0], null, 2));
        }

        // Filter by position if specified
        if (options.includeWaiverWire === 'position' && options.waiverWirePosition) {
          const positionMap: { [key: string]: number } = {
            'QB': 1, 'RB': 2, 'WR': 3, 'TE': 4, 'K': 5, 'DEF': 16
          };
          const positionId = positionMap[options.waiverWirePosition];
          if (positionId) {
            availablePlayers = availablePlayers.filter((playerData: any) => {
              const player = playerData.player || playerData;
              return player?.defaultPositionId === positionId;
            });
          }
        }

        // Filter by NFL team if specified
        if (options.includeWaiverWire === 'team' && options.waiverWireTeam) {
          const teamMap: { [key: string]: number } = {
            'ATL': 1, 'BUF': 2, 'CHI': 3, 'CIN': 4, 'CLE': 5, 'DAL': 6, 'DEN': 7, 'DET': 8,
            'GB': 9, 'TEN': 10, 'IND': 11, 'KC': 12, 'LV': 13, 'LAR': 14, 'MIA': 15, 'MIN': 16,
            'NE': 17, 'NO': 18, 'NYG': 19, 'NYJ': 20, 'PHI': 21, 'ARI': 22, 'PIT': 23, 'LAC': 24,
            'SF': 25, 'SEA': 26, 'TB': 27, 'WAS': 28, 'CAR': 29, 'JAX': 30, 'BAL': 33, 'HOU': 34
          };
          const teamId = teamMap[options.waiverWireTeam];
          if (teamId) {
            availablePlayers = availablePlayers.filter((playerData: any) => {
              const player = playerData.player || playerData;
              return player?.proTeamId === teamId;
            });
          }
        }

        // Filter out IR players if requested
        if (options.excludeIRPlayers) {
          availablePlayers = availablePlayers.filter((playerData: any) => {
            const player = playerData.player || playerData;
            const entry = playerData.playerPoolEntry?.player || player;
            // Exclude players with IR/INJURY_RESERVE status
            return entry.injuryStatus !== 'INJURY_RESERVE' && entry.injuryStatus !== 'IR';
          });
        }

        // Filter out Out players if requested
        if (options.excludeOutPlayers) {
          availablePlayers = availablePlayers.filter((playerData: any) => {
            const player = playerData.player || playerData;
            const entry = playerData.playerPoolEntry?.player || player;
            return entry.injuryStatus !== 'OUT' && entry.injuryStatus !== 'O';
          });
        }

        // Filter out Doubtful players if requested
        if (options.excludeDoubtfulPlayers) {
          availablePlayers = availablePlayers.filter((playerData: any) => {
            const player = playerData.player || playerData;
            const entry = playerData.playerPoolEntry?.player || player;
            return entry.injuryStatus !== 'DOUBTFUL' && entry.injuryStatus !== 'D';
          });
        }

        // Filter out Questionable players if requested
        if (options.excludeQuestionablePlayers) {
          availablePlayers = availablePlayers.filter((playerData: any) => {
            const player = playerData.player || playerData;
            const entry = playerData.playerPoolEntry?.player || player;
            return entry.injuryStatus !== 'QUESTIONABLE' && entry.injuryStatus !== 'Q';
          });
        }

        // Sort by ownership percentage (most owned first) and limit results
        const limit = options.includeWaiverWire === 'top50' ? 50 : 100;
        availablePlayers = availablePlayers
          .sort((aData: any, bData: any) => {
            const a = aData.player || aData;
            const b = bData.player || bData;
            // Sort by ownership percentage, then by projected points if available
            const aOwnership = a.ownership?.percentOwned || 0;
            const bOwnership = b.ownership?.percentOwned || 0;
            if (aOwnership !== bOwnership) {
              return bOwnership - aOwnership;
            }
            // Secondary sort by projected points if available
            const aProjected = a.projectedStats?.appliedTotal || a.projectedStats?.total || 0;
            const bProjected = b.projectedStats?.appliedTotal || b.projectedStats?.total || 0;
            return bProjected - aProjected;
          })
          .slice(0, limit);

        if (availablePlayers.length > 0) {
          const sectionTitle = options.includeWaiverWire === 'position' 
            ? `AVAILABLE ${options.waiverWirePosition} PLAYERS`
            : options.includeWaiverWire === 'team'
              ? `AVAILABLE ${options.waiverWireTeam} PLAYERS`
              : 'TOP AVAILABLE PLAYERS';
              
          promptSections.push(
            `==== ${sectionTitle} ====\n` +
            availablePlayers
              .map((playerData: any) => {
                const player = playerData.player || playerData;
                const name = player?.fullName || player?.name || 'Unknown Player';
                const teamId = player?.proTeamId;
                const team = teamId ? getPlayerTeam(teamId) : 'FA';
                const positionId = player?.defaultPositionId;
                const position = positionId ? getPositionName(positionId) : 'FLEX';
                const ownership = player?.ownership?.percentOwned || 0;
                const injuryStatus = getInjuryStatus(playerData);
                return `${name} (${position}, ${team}) - ${ownership.toFixed(1)}% owned - Status: ${injuryStatus}`;
              })
              .join('\n') + '\n'
          );
        } else {
          console.log(`Custom prompt: No available players found for waiver wire section`);
        }
      }

      // Add research directives for AI to gather external data
      const researchDirectives = [];
      
      if (options.includeFantasyPros) {
        researchDirectives.push("- Research current FantasyPros expert consensus rankings and start/sit recommendations for this week");
      }

      if (options.includeVegasOdds) {
        researchDirectives.push("- Look up current Vegas betting lines, over/under totals, and player prop bets for relevant NFL games");
      }

      if (options.includeInjuryReports) {
        researchDirectives.push("- Check the latest NFL injury reports and player statuses (questionable, doubtful, out) from official sources");
      }

      if (options.includeWeatherData) {
        researchDirectives.push("- Research current weather forecasts for outdoor NFL stadiums this week (temperature, wind, precipitation)");
      }

      if (options.includeNewsUpdates) {
        researchDirectives.push("- Find the latest NFL news, beat reporter updates, and breaking news that could impact player performance");
      }

      if (options.includeMatchupAnalysis) {
        researchDirectives.push("- Analyze defensive matchups and recent performance trends against specific positions (QB, RB, WR, TE)");
      }

      if (researchDirectives.length > 0) {
        promptSections.push(
          `==== RESEARCH INSTRUCTIONS ====\n` +
          `Please research and incorporate the following external data sources into your analysis:\n\n` +
          researchDirectives.join('\n') + '\n\n' +
          `Use this research to provide more informed recommendations and insights.\n\n`
        );
      }

      const finalPrompt = promptSections.join('\n');

      console.log(`Generated custom prompt with ${promptSections.length} sections`);

      res.json({ prompt: finalPrompt });
    } catch (error: any) {
      console.error('Custom prompt generation error:', error);
      res.status(500).json({ message: error.message || 'Failed to generate custom prompt' });
    }
  });

  const httpServer = createServer(app);
    // Jobs endpoints for refreshing data
    app.post("/api/jobs/refresh-leagues", async (req, res) => {
      try {
        // TODO: Replace with actual refresh logic
        // await storage.refreshLeagues();
        res.json({ message: "Leagues refreshed." });
      } catch (error) {
        res.status(500).json({ message: "Failed to refresh leagues." });
      }
    });

    app.post("/api/jobs/refresh-teams", async (req, res) => {
      try {
        // TODO: Replace with actual refresh logic
        // await storage.refreshTeams();
        res.json({ message: "Teams refreshed." });
      } catch (error) {
        res.status(500).json({ message: "Failed to refresh teams." });
      }
    });

    app.post("/api/jobs/refresh-players", async (req, res) => {
      try {
        // TODO: Replace with actual refresh logic
        // await storage.refreshPlayers();
        res.json({ message: "Players refreshed." });
      } catch (error) {
        res.status(500).json({ message: "Failed to refresh players." });
      }
    });

  // Fantasy Pros data refresh jobs
  app.post("/api/jobs/fp-refresh-players", requireAuth, async (req, res) => {
    try {
      const { sport = 'NFL', season = 2024 } = req.body;
      const { refreshPlayers } = await import("./fantasyProsService");
      const result = await refreshPlayers(sport, season);
      
      if (result.success) {
        res.json({ 
          message: `Successfully refreshed ${result.recordCount} ${sport} players for ${season} season`,
          count: result.recordCount 
        });
      } else {
        res.status(500).json({ message: result.error || 'Failed to refresh players' });
      }
    } catch (error: any) {
      console.error('Fantasy Pros player refresh error:', error);
      res.status(500).json({ message: error.message || 'Failed to refresh players' });
    }
  });

  app.post("/api/jobs/fp-refresh-rankings", requireAuth, async (req, res) => {
    try {
      const { sport = 'NFL', season = 2024, week, position, rankType = 'weekly', scoringType = 'PPR' } = req.body;
      const { refreshRankings } = await import("./fantasyProsService");
      const result = await refreshRankings(sport, season, week, position, rankType, scoringType);
      
      if (result.success) {
        const weekText = week ? `week ${week}` : 'season';
        res.json({ 
          message: `Successfully refreshed ${result.recordCount} ${sport} rankings for ${weekText}`,
          count: result.recordCount 
        });
      } else {
        res.status(500).json({ message: result.error || 'Failed to refresh rankings' });
      }
    } catch (error: any) {
      console.error('Fantasy Pros rankings refresh error:', error);
      res.status(500).json({ message: error.message || 'Failed to refresh rankings' });
    }
  });

  app.post("/api/jobs/fp-refresh-projections", requireAuth, async (req, res) => {
    try {
      const { sport = 'NFL', season = 2024, week, position, scoringType = 'PPR' } = req.body;
      const { refreshProjections } = await import("./fantasyProsService");
      const result = await refreshProjections(sport, season, week, position, scoringType);
      
      if (result.success) {
        const weekText = week ? `week ${week}` : 'season';
        res.json({ 
          message: `Successfully refreshed ${result.recordCount} ${sport} projections for ${weekText}`,
          count: result.recordCount 
        });
      } else {
        res.status(500).json({ message: result.error || 'Failed to refresh projections' });
      }
    } catch (error: any) {
      console.error('Fantasy Pros projections refresh error:', error);
      res.status(500).json({ message: error.message || 'Failed to refresh projections' });
    }
  });

  app.post("/api/jobs/fp-refresh-news", requireAuth, async (req, res) => {
    try {
      const { sport = 'NFL', limit = 50 } = req.body;
      const { refreshNews } = await import("./fantasyProsService");
      const result = await refreshNews(sport, limit);
      
      if (result.success) {
        res.json({ 
          message: `Successfully refreshed ${result.recordCount} ${sport} news items`,
          count: result.recordCount 
        });
      } else {
        res.status(500).json({ message: result.error || 'Failed to refresh news' });
      }
    } catch (error: any) {
      console.error('Fantasy Pros news refresh error:', error);
      res.status(500).json({ message: error.message || 'Failed to refresh news' });
    }
  });

  app.post("/api/jobs/fp-clear-and-refresh-news", requireAuth, async (req, res) => {
    try {
      const { sport = 'NFL', limit = 50 } = req.body;
      const { db } = await import('./db');
      const { fantasyProsNews } = await import('@shared/schema');
      const { eq } = await import('drizzle-orm');
      
      // Delete all news for this sport
      await db.delete(fantasyProsNews).where(eq(fantasyProsNews.sport, sport));
      console.log(`Deleted all ${sport} news records`);
      
      // Refresh news (will now have player data since players table is populated)
      const { refreshNews } = await import("./fantasyProsService");
      const result = await refreshNews(sport, limit);
      
      if (result.success) {
        res.json({ 
          message: `Cleared old news and refreshed ${result.recordCount} ${sport} news items with complete player data`,
          count: result.recordCount 
        });
      } else {
        res.status(500).json({ message: result.error || 'Failed to refresh news after clearing' });
      }
    } catch (error: any) {
      console.error('Fantasy Pros clear and refresh news error:', error);
      res.status(500).json({ message: error.message || 'Failed to clear and refresh news' });
    }
  });

  app.post("/api/jobs/fp-refresh-all", requireAuth, async (req, res) => {
    try {
      const { sport = 'NFL', season = 2024, week } = req.body;
      const { refreshAllData } = await import("./fantasyProsService");
      const results = await refreshAllData(sport, season, week);
      
      const totalCount = results.players.recordCount + results.rankings.recordCount + 
                         results.projections.recordCount + results.news.recordCount;
      
      res.json({ 
        message: `Successfully refreshed ${totalCount} total records for ${sport} ${season}`,
        results: {
          players: results.players.recordCount,
          rankings: results.rankings.recordCount,
          projections: results.projections.recordCount,
          news: results.news.recordCount,
        }
      });
    } catch (error: any) {
      console.error('Fantasy Pros all data refresh error:', error);
      res.status(500).json({ message: error.message || 'Failed to refresh data' });
    }
  });

  // Database viewer endpoints
  app.get("/api/db/tables", requireAuth, async (req, res) => {
    try {
      const { db } = await import('./db');
      const { sql } = await import('drizzle-orm');
      
      const result = await db.execute(sql`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `);
      
      res.json({ tables: result.rows });
    } catch (error: any) {
      console.error('Error fetching tables:', error);
      res.status(500).json({ message: error.message || 'Failed to fetch tables' });
    }
  });

  app.get("/api/db/tables/:tableName/columns", requireAuth, async (req, res) => {
    try {
      const { tableName } = req.params;
      const { db } = await import('./db');
      const { sql } = await import('drizzle-orm');
      
      const result = await db.execute(sql`
        SELECT 
          column_name,
          data_type,
          is_nullable,
          column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' 
        AND table_name = ${tableName}
        ORDER BY ordinal_position
      `);
      
      res.json({ columns: result.rows });
    } catch (error: any) {
      console.error('Error fetching columns:', error);
      res.status(500).json({ message: error.message || 'Failed to fetch columns' });
    }
  });

  app.post("/api/db/tables/:tableName/query", requireAuth, async (req, res) => {
    try {
      const { tableName } = req.params;
      const { filters = {}, limit = 100, offset = 0 } = req.body;
      const { db } = await import('./db');
      const { sql } = await import('drizzle-orm');
      
      // Build WHERE clause from filters
      const whereConditions: string[] = [];
      
      Object.entries(filters).forEach(([column, value]) => {
        if (value !== null && value !== undefined && value !== '') {
          whereConditions.push(`${column}::text ILIKE '%${String(value).replace(/'/g, "''")}%'`);
        }
      });
      
      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
      
      // Get total count with filters
      const countQuery = `SELECT COUNT(*) as total FROM ${tableName} ${whereClause}`;
      const countResult = await db.execute(sql.raw(countQuery));
      const total = parseInt(countResult.rows[0]?.total || '0');
      
      // Get data with pagination - try to order by id, fallback to first column
      let dataQuery: string;
      try {
        // Try ordering by id first
        dataQuery = `SELECT * FROM ${tableName} ${whereClause} ORDER BY id DESC LIMIT ${limit} OFFSET ${offset}`;
        const dataResult = await db.execute(sql.raw(dataQuery));
        
        res.json({ 
          data: dataResult.rows,
          total,
          limit,
          offset,
          hasMore: offset + limit < total
        });
        return;
      } catch (err) {
        // If id column doesn't exist, just get data without specific ordering
        dataQuery = `SELECT * FROM ${tableName} ${whereClause} LIMIT ${limit} OFFSET ${offset}`;
      }
      
      const dataResult = await db.execute(sql.raw(dataQuery));
      
      res.json({ 
        data: dataResult.rows,
        total,
        limit,
        offset,
        hasMore: offset + limit < total
      });
    } catch (error: any) {
      console.error('Error querying table:', error);
      res.status(500).json({ message: error.message || 'Failed to query table' });
    }
  });

  // Fantasy Pros API proxy endpoint to avoid CORS issues
  app.post("/api/fantasy-pros-proxy", requireAuth, async (req, res) => {
    try {
      const { apiKey, method, endpoint, queryParams, body } = req.body;

      // Use provided API key or fallback to environment variable
      const effectiveApiKey = apiKey || process.env.FantasyProsApiKey;
      
      console.log('Fantasy Pros Proxy - API Key provided:', !!apiKey);
      console.log('Fantasy Pros Proxy - Using env API key:', !apiKey && !!process.env.FantasyProsApiKey);
      console.log('Fantasy Pros Proxy - Effective API key exists:', !!effectiveApiKey);

      if (!effectiveApiKey || !endpoint) {
        return res.status(400).json({ message: "API key and endpoint are required" });
      }

      // SECURITY: Validate endpoint is a Fantasy Pros URL to prevent SSRF
      const allowedHosts = [
        'api.fantasypros.com',
        'fantasypros.com'
      ];
      
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(endpoint);
      } catch {
        return res.status(400).json({ message: "Invalid endpoint URL" });
      }

      if (!allowedHosts.some(host => parsedUrl.hostname === host || parsedUrl.hostname.endsWith('.' + host))) {
        return res.status(403).json({ message: "Only Fantasy Pros API endpoints are allowed" });
      }

      // Validate HTTP method
      const allowedMethods = ['GET', 'POST'];
      const requestMethod = method || 'GET';
      if (!allowedMethods.includes(requestMethod)) {
        return res.status(400).json({ message: "Only GET and POST methods are allowed" });
      }

      // Build URL with query params
      let url = endpoint;
      const params = new URLSearchParams();

      // Parse query params if provided
      if (queryParams) {
        queryParams.split('&').forEach((param: string) => {
          const [key, value] = param.split('=');
          if (key && value) {
            params.append(key.trim(), value.trim());
          }
        });
      }

      // Add query params to URL (do NOT add api-key to query params, only use header)
      if (params.toString()) {
        url += (url.includes('?') ? '&' : '?') + params.toString();
      }

      const options: RequestInit = {
        method: requestMethod,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'x-api-key': effectiveApiKey,
        },
      };

      // Forward POST body as-is (don't double-encode)
      if (requestMethod === 'POST' && body) {
        options.body = typeof body === 'string' ? body : JSON.stringify(body);
      }

      console.log('Fantasy Pros - Requesting URL:', url);
      console.log('Fantasy Pros - Method:', requestMethod);
      console.log('Fantasy Pros - Headers:', options.headers);

      const response = await fetch(url, options);
      
      // Try to parse as JSON, fallback to text
      let responseData;
      const contentType = response.headers.get('content-type');
      
      if (contentType && contentType.includes('application/json')) {
        responseData = await response.json();
      } else {
        responseData = await response.text();
      }

      console.log('Fantasy Pros - Response status:', response.status);
      console.log('Fantasy Pros - Response data:', responseData);

      res.status(response.status).json({
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        data: responseData,
      });
    } catch (error: any) {
      console.error('Fantasy Pros proxy error:', error);
      res.status(500).json({ 
        error: error.message,
        message: 'Failed to fetch from Fantasy Pros API'
      });
    }
  });

  return httpServer;
}
