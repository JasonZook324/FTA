import { 
  type User, type InsertUser,
  type EspnCredentials, type InsertEspnCredentials,
  type Team, type InsertTeam,
  type Matchup, type InsertMatchup,
  type Player, type InsertPlayer,
  type LeagueProfile, type InsertLeagueProfile,
  type LeagueCredentials, type InsertLeagueCredentials,
  type UserLeague, type InsertUserLeague,
  type NflMatchup, type InsertNflMatchup,
  users, espnCredentials, teams, matchups, players,
  leagueProfiles, leagueCredentials, userLeagues,
  nflMatchups, nflVegasOdds
} from "@shared/schema";
import { db } from "./db";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import session from "express-session";
import type { Store } from "express-session";
import connectPg from "connect-pg-simple";
import createMemoryStore from "memorystore";
import { pool } from "./db";

// Reference: blueprint:javascript_auth_all_persistance
export interface IStorage {
  // Session store for authentication
  sessionStore: Store;

  // User methods
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<User>): Promise<User | undefined>;

  // ESPN Credentials methods
  getEspnCredentials(userId: string): Promise<EspnCredentials | undefined>;
  createEspnCredentials(credentials: InsertEspnCredentials): Promise<EspnCredentials>;
  updateEspnCredentials(userId: string, credentials: Partial<EspnCredentials>): Promise<EspnCredentials | undefined>;
  deleteEspnCredentials(userId: string): Promise<boolean>;

  // Team methods
  getTeams(leagueId: string): Promise<Team[]>;
  getTeamByEspnId(leagueId: string, espnTeamId: number): Promise<Team | undefined>;
  createTeam(team: InsertTeam): Promise<Team>;
  updateTeam(id: string, team: Partial<Team>): Promise<Team | undefined>;
  deleteTeam(id: string): Promise<boolean>;

  // Matchup methods
  getMatchups(leagueId: string, week?: number): Promise<Matchup[]>;
  createMatchup(matchup: InsertMatchup): Promise<Matchup>;
  updateMatchup(id: string, matchup: Partial<Matchup>): Promise<Matchup | undefined>;
  deleteMatchup(id: string): Promise<boolean>;

  // Player methods
  getPlayers(): Promise<Player[]>;
  getPlayer(espnPlayerId: number): Promise<Player | undefined>;
  createPlayer(player: InsertPlayer): Promise<Player>;
  updatePlayer(id: string, player: Partial<Player>): Promise<Player | undefined>;
  deletePlayer(id: string): Promise<boolean>;

  // League Profile methods (shareable leagues)
  getAllLeagueProfiles(): Promise<LeagueProfile[]>;
  getLeagueProfile(id: string): Promise<LeagueProfile | undefined>;
  getLeagueProfileByEspnId(espnLeagueId: string, season: number): Promise<LeagueProfile | undefined>;
  createLeagueProfile(profile: InsertLeagueProfile): Promise<LeagueProfile>;
  updateLeagueProfile(id: string, profile: Partial<LeagueProfile>): Promise<LeagueProfile | undefined>;

  // League Credentials methods (shareable credentials)
  getLeagueCredentials(leagueProfileId: string): Promise<LeagueCredentials | undefined>;
  createLeagueCredentials(credentials: InsertLeagueCredentials): Promise<LeagueCredentials>;
  updateLeagueCredentials(leagueProfileId: string, credentials: Partial<LeagueCredentials>): Promise<LeagueCredentials | undefined>;

  // User League methods (user memberships)
  getUserLeagues(userId: string): Promise<UserLeague[]>;
  getUserLeague(userId: string, leagueProfileId: string): Promise<UserLeague | undefined>;
  createUserLeague(userLeague: InsertUserLeague): Promise<UserLeague>;
  deleteUserLeague(userId: string, leagueProfileId: string): Promise<boolean>;

  // NFL Matchups methods
  refreshNflMatchups(season: number, week: number): Promise<{ success: boolean; recordCount: number; error?: string }>;
  getNflMatchups(season: number, week: number): Promise<NflMatchup[]>;
  normalizeTeamName(fullName: string): string | null;
}

const MemoryStore = createMemoryStore(session);
const PostgresSessionStore = connectPg(session);

export class MemStorage implements IStorage {
  sessionStore: Store;
  private users: Map<string, User>;
  private espnCredentials: Map<string, EspnCredentials>;
  private teams: Map<string, Team>;
  private matchups: Map<string, Matchup>;
  private players: Map<string, Player>;
  private leagueProfiles: Map<string, LeagueProfile>;
  private leagueCredentials: Map<string, LeagueCredentials>;
  private userLeagues: Map<string, UserLeague>;

  constructor() {
    this.sessionStore = new MemoryStore({
      checkPeriod: 86400000, // 24 hours
    });
    this.users = new Map();
    this.espnCredentials = new Map();
    this.teams = new Map();
    this.matchups = new Map();
    this.players = new Map();
    this.leagueProfiles = new Map();
    this.leagueCredentials = new Map();
    this.userLeagues = new Map();
  }

  // User methods
  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { 
      ...insertUser,
      role: insertUser.role ?? 0,
      id, 
      selectedLeagueId: null,
      selectedTeamId: null,
      createdAt: new Date()
    };
    this.users.set(id, user);
    return user;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | undefined> {
    const existing = this.users.get(id);
    if (!existing) return undefined;
    
    const updated: User = { ...existing, ...updates };
    this.users.set(id, updated);
    return updated;
  }

  // ESPN Credentials methods
  async getEspnCredentials(userId: string): Promise<EspnCredentials | undefined> {
    return Array.from(this.espnCredentials.values()).find(
      (cred) => cred.userId === userId,
    );
  }

  async createEspnCredentials(credentials: InsertEspnCredentials): Promise<EspnCredentials> {
    const id = randomUUID();
    const cred: EspnCredentials = { 
      ...credentials, 
      id, 
      isValid: true,
      createdAt: new Date(),
      lastValidated: null,
      testLeagueId: credentials.testLeagueId ?? null,
      testSeason: credentials.testSeason ?? null
    };
    this.espnCredentials.set(id, cred);
    return cred;
  }

  async updateEspnCredentials(userId: string, updates: Partial<EspnCredentials>): Promise<EspnCredentials | undefined> {
    const existing = await this.getEspnCredentials(userId);
    if (!existing) return undefined;
    
    const updated: EspnCredentials = { ...existing, ...updates };
    this.espnCredentials.set(existing.id, updated);
    return updated;
  }

  async deleteEspnCredentials(userId: string): Promise<boolean> {
    const existing = await this.getEspnCredentials(userId);
    if (!existing) return false;
    
    this.espnCredentials.delete(existing.id);
    return true;
  }

  // Team methods
  async getTeams(leagueId: string): Promise<Team[]> {
    return Array.from(this.teams.values()).filter(
      (team) => team.leagueId === leagueId,
    );
  }

  async getTeamByEspnId(leagueId: string, espnTeamId: number): Promise<Team | undefined> {
    return Array.from(this.teams.values()).find(
      (team) => team.leagueId === leagueId && team.espnTeamId === espnTeamId,
    );
  }

  async createTeam(team: InsertTeam): Promise<Team> {
    const id = randomUUID();
    const newTeam: Team = { 
      ...team, 
      id,
      owner: team.owner ?? null,
      abbreviation: team.abbreviation ?? null,
      logoUrl: team.logoUrl ?? null,
      wins: team.wins ?? null,
      losses: team.losses ?? null,
      ties: team.ties ?? null,
      pointsFor: team.pointsFor ?? null,
      pointsAgainst: team.pointsAgainst ?? null,
      streak: team.streak ?? null,
      rank: team.rank ?? null
    };
    this.teams.set(id, newTeam);
    return newTeam;
  }

  async updateTeam(id: string, updates: Partial<Team>): Promise<Team | undefined> {
    const existing = this.teams.get(id);
    if (!existing) return undefined;
    
    const updated: Team = { ...existing, ...updates };
    this.teams.set(id, updated);
    return updated;
  }

  async deleteTeam(id: string): Promise<boolean> {
    return this.teams.delete(id);
  }

  // Matchup methods
  async getMatchups(leagueId: string, week?: number): Promise<Matchup[]> {
    const matchups = Array.from(this.matchups.values()).filter(
      (matchup) => matchup.leagueId === leagueId,
    );
    
    if (week !== undefined) {
      return matchups.filter((matchup) => matchup.week === week);
    }
    
    return matchups;
  }

  async createMatchup(matchup: InsertMatchup): Promise<Matchup> {
    const id = randomUUID();
    const newMatchup: Matchup = { 
      ...matchup, 
      id,
      homeScore: matchup.homeScore ?? null,
      awayScore: matchup.awayScore ?? null,
      isComplete: matchup.isComplete ?? null,
      matchupDate: matchup.matchupDate ?? null
    };
    this.matchups.set(id, newMatchup);
    return newMatchup;
  }

  async updateMatchup(id: string, updates: Partial<Matchup>): Promise<Matchup | undefined> {
    const existing = this.matchups.get(id);
    if (!existing) return undefined;
    
    const updated: Matchup = { ...existing, ...updates };
    this.matchups.set(id, updated);
    return updated;
  }

  async deleteMatchup(id: string): Promise<boolean> {
    return this.matchups.delete(id);
  }

  // Player methods
  async getPlayers(): Promise<Player[]> {
    return Array.from(this.players.values());
  }

  async getPlayer(espnPlayerId: number): Promise<Player | undefined> {
    return Array.from(this.players.values()).find(
      (player) => player.espnPlayerId === espnPlayerId,
    );
  }

  async createPlayer(player: InsertPlayer): Promise<Player> {
    const id = randomUUID();
    const newPlayer: Player = { 
      ...player, 
      id,
      team: player.team ?? null,
      position: player.position ?? null,
      isActive: player.isActive ?? null,
      stats: player.stats ?? null
    };
    this.players.set(id, newPlayer);
    return newPlayer;
  }

  async updatePlayer(id: string, updates: Partial<Player>): Promise<Player | undefined> {
    const existing = this.players.get(id);
    if (!existing) return undefined;
    
    const updated: Player = { ...existing, ...updates };
    this.players.set(id, updated);
    return updated;
  }

  async deletePlayer(id: string): Promise<boolean> {
    return this.players.delete(id);
  }

  // League Profile methods (not implemented in memory storage)
  async getAllLeagueProfiles(): Promise<LeagueProfile[]> {
    throw new Error("League profiles not supported in memory storage");
  }

  async getLeagueProfile(id: string): Promise<LeagueProfile | undefined> {
    throw new Error("League profiles not supported in memory storage");
  }

  async getLeagueProfileByEspnId(espnLeagueId: string, season: number): Promise<LeagueProfile | undefined> {
    throw new Error("League profiles not supported in memory storage");
  }

  async createLeagueProfile(profile: InsertLeagueProfile): Promise<LeagueProfile> {
    throw new Error("League profiles not supported in memory storage");
  }

  async updateLeagueProfile(id: string, updates: Partial<LeagueProfile>): Promise<LeagueProfile | undefined> {
    throw new Error("League profiles not supported in memory storage");
  }

  async getLeagueCredentials(leagueProfileId: string): Promise<LeagueCredentials | undefined> {
    throw new Error("League credentials not supported in memory storage");
  }

  async createLeagueCredentials(credentials: InsertLeagueCredentials): Promise<LeagueCredentials> {
    throw new Error("League credentials not supported in memory storage");
  }

  async updateLeagueCredentials(leagueProfileId: string, updates: Partial<LeagueCredentials>): Promise<LeagueCredentials | undefined> {
    throw new Error("League credentials not supported in memory storage");
  }

  async getUserLeagues(userId: string): Promise<UserLeague[]> {
    throw new Error("User leagues not supported in memory storage");
  }

  async getUserLeague(userId: string, leagueProfileId: string): Promise<UserLeague | undefined> {
    throw new Error("User leagues not supported in memory storage");
  }

  async createUserLeague(userLeague: InsertUserLeague): Promise<UserLeague> {
    throw new Error("User leagues not supported in memory storage");
  }

  async deleteUserLeague(userId: string, leagueProfileId: string): Promise<boolean> {
    throw new Error("User leagues not supported in memory storage");
  }

  async refreshNflMatchups(season: number, week: number): Promise<{ success: boolean; recordCount: number; error?: string }> {
    return { success: false, recordCount: 0, error: "NFL matchups not supported in memory storage" };
  }

  async getNflMatchups(season: number, week: number): Promise<NflMatchup[]> {
    return [];
  }

  normalizeTeamName(fullName: string): string | null {
    return null;
  }
}

export class DatabaseStorage implements IStorage {
  sessionStore: Store;

  constructor() {
    this.sessionStore = new PostgresSessionStore({ 
      pool, 
      createTableIfMissing: true 
    });
  }

  // User methods
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | undefined> {
    const [updated] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, id))
      .returning();
    return updated || undefined;
  }

  // ESPN Credentials methods - The core improvement for persistence
  async getEspnCredentials(userId: string): Promise<EspnCredentials | undefined> {
    const [cred] = await db
      .select()
      .from(espnCredentials)
      .where(eq(espnCredentials.userId, userId));
    return cred || undefined;
  }

  async createEspnCredentials(credentials: InsertEspnCredentials): Promise<EspnCredentials> {
    // Delete any existing credentials for this user first (upsert behavior)
    await db.delete(espnCredentials).where(eq(espnCredentials.userId, credentials.userId));
    
    const [cred] = await db
      .insert(espnCredentials)
      .values({
        ...credentials,
        isValid: true,
        createdAt: new Date(),
        lastValidated: null
      })
      .returning();
    return cred;
  }

  async updateEspnCredentials(userId: string, updates: Partial<EspnCredentials>): Promise<EspnCredentials | undefined> {
    const [updated] = await db
      .update(espnCredentials)
      .set({
        ...updates,
        lastValidated: updates.lastValidated || new Date()
      })
      .where(eq(espnCredentials.userId, userId))
      .returning();
    return updated || undefined;
  }

  async deleteEspnCredentials(userId: string): Promise<boolean> {
    const result = await db
      .delete(espnCredentials)
      .where(eq(espnCredentials.userId, userId));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  // Team methods
  async getTeams(leagueId: string): Promise<Team[]> {
    return await db
      .select()
      .from(teams)
      .where(eq(teams.leagueId, leagueId));
  }

  async getTeamByEspnId(leagueId: string, espnTeamId: number): Promise<Team | undefined> {
    const [team] = await db
      .select()
      .from(teams)
      .where(and(eq(teams.leagueId, leagueId), eq(teams.espnTeamId, espnTeamId)))
      .limit(1);
    return team || undefined;
  }

  async createTeam(team: InsertTeam): Promise<Team> {
    const [newTeam] = await db
      .insert(teams)
      .values(team)
      .returning();
    return newTeam;
  }

  async updateTeam(id: string, updates: Partial<Team>): Promise<Team | undefined> {
    const [updated] = await db
      .update(teams)
      .set(updates)
      .where(eq(teams.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteTeam(id: string): Promise<boolean> {
    const result = await db
      .delete(teams)
      .where(eq(teams.id, id));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  // Matchup methods
  async getMatchups(leagueId: string, week?: number): Promise<Matchup[]> {
    if (week !== undefined) {
      return await db
        .select()
        .from(matchups)
        .where(and(eq(matchups.leagueId, leagueId), eq(matchups.week, week)));
    }
    
    return await db
      .select()
      .from(matchups)
      .where(eq(matchups.leagueId, leagueId));
  }

  async createMatchup(matchup: InsertMatchup): Promise<Matchup> {
    const [newMatchup] = await db
      .insert(matchups)
      .values(matchup)
      .returning();
    return newMatchup;
  }

  async updateMatchup(id: string, updates: Partial<Matchup>): Promise<Matchup | undefined> {
    const [updated] = await db
      .update(matchups)
      .set(updates)
      .where(eq(matchups.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteMatchup(id: string): Promise<boolean> {
    const result = await db
      .delete(matchups)
      .where(eq(matchups.id, id));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  // Player methods
  async getPlayers(): Promise<Player[]> {
    return await db.select().from(players);
  }

  async getPlayer(espnPlayerId: number): Promise<Player | undefined> {
    const [player] = await db
      .select()
      .from(players)
      .where(eq(players.espnPlayerId, espnPlayerId));
    return player || undefined;
  }

  async createPlayer(player: InsertPlayer): Promise<Player> {
    const [newPlayer] = await db
      .insert(players)
      .values(player)
      .returning();
    return newPlayer;
  }

  async updatePlayer(id: string, updates: Partial<Player>): Promise<Player | undefined> {
    const [updated] = await db
      .update(players)
      .set(updates)
      .where(eq(players.id, id))
      .returning();
    return updated || undefined;
  }

  async deletePlayer(id: string): Promise<boolean> {
    const result = await db
      .delete(players)
      .where(eq(players.id, id));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  // League Profile methods (shareable leagues)
  async getAllLeagueProfiles(): Promise<LeagueProfile[]> {
    return await db.select().from(leagueProfiles);
  }

  async getLeagueProfile(id: string): Promise<LeagueProfile | undefined> {
    const [profile] = await db
      .select()
      .from(leagueProfiles)
      .where(eq(leagueProfiles.id, id));
    return profile || undefined;
  }

  async getLeagueProfileByEspnId(espnLeagueId: string, season: number): Promise<LeagueProfile | undefined> {
    const [profile] = await db
      .select()
      .from(leagueProfiles)
      .where(and(
        eq(leagueProfiles.espnLeagueId, espnLeagueId),
        eq(leagueProfiles.season, season)
      ));
    return profile || undefined;
  }

  async createLeagueProfile(profile: InsertLeagueProfile): Promise<LeagueProfile> {
    const [newProfile] = await db
      .insert(leagueProfiles)
      .values(profile)
      .returning();
    return newProfile;
  }

  async updateLeagueProfile(id: string, updates: Partial<LeagueProfile>): Promise<LeagueProfile | undefined> {
    const [updated] = await db
      .update(leagueProfiles)
      .set(updates)
      .where(eq(leagueProfiles.id, id))
      .returning();
    return updated || undefined;
  }

  // League Credentials methods (shareable credentials)
  async getLeagueCredentials(leagueProfileId: string): Promise<LeagueCredentials | undefined> {
    const [credentials] = await db
      .select()
      .from(leagueCredentials)
      .where(eq(leagueCredentials.leagueProfileId, leagueProfileId));
    return credentials || undefined;
  }

  async createLeagueCredentials(credentials: InsertLeagueCredentials): Promise<LeagueCredentials> {
    const [newCredentials] = await db
      .insert(leagueCredentials)
      .values(credentials)
      .returning();
    return newCredentials;
  }

  async updateLeagueCredentials(leagueProfileId: string, updates: Partial<LeagueCredentials>): Promise<LeagueCredentials | undefined> {
    const [updated] = await db
      .update(leagueCredentials)
      .set(updates)
      .where(eq(leagueCredentials.leagueProfileId, leagueProfileId))
      .returning();
    return updated || undefined;
  }

  // User League methods (user memberships)
  async getUserLeagues(userId: string): Promise<UserLeague[]> {
    return await db
      .select()
      .from(userLeagues)
      .where(eq(userLeagues.userId, userId));
  }

  async getUserLeague(userId: string, leagueProfileId: string): Promise<UserLeague | undefined> {
    const [userLeague] = await db
      .select()
      .from(userLeagues)
      .where(and(
        eq(userLeagues.userId, userId),
        eq(userLeagues.leagueProfileId, leagueProfileId)
      ));
    return userLeague || undefined;
  }

  async createUserLeague(userLeague: InsertUserLeague): Promise<UserLeague> {
    const [newUserLeague] = await db
      .insert(userLeagues)
      .values(userLeague)
      .returning();
    return newUserLeague;
  }

  async deleteUserLeague(userId: string, leagueProfileId: string): Promise<boolean> {
    const result = await db
      .delete(userLeagues)
      .where(and(
        eq(userLeagues.userId, userId),
        eq(userLeagues.leagueProfileId, leagueProfileId)
      ));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  // NFL Matchups methods
  async refreshNflMatchups(season: number, week: number): Promise<{ success: boolean; recordCount: number; error?: string }> {
    try {
      console.log(`Refreshing NFL matchups for ${season} week ${week}...`);
      
      // Step 1: Fetch raw odds data from nflVegasOdds
      const oddsData = await db
        .select()
        .from(nflVegasOdds)
        .where(and(
          eq(nflVegasOdds.season, season),
          eq(nflVegasOdds.week, week)
        ));
      
      if (oddsData.length === 0) {
        return { success: false, recordCount: 0, error: "No odds data found for this week. Run 'Refresh Vegas Odds' first." };
      }
      
      // Step 2: Deduplicate by gameId (multiple bookmakers = same game)
      const gameMap = new Map<string, typeof nflVegasOdds.$inferSelect>();
      for (const game of oddsData) {
        if (!gameMap.has(game.gameId)) {
          gameMap.set(game.gameId, game);
        }
      }
      
      // Step 3: Delete existing matchups for this week
      await db.delete(nflMatchups)
        .where(and(
          eq(nflMatchups.season, season),
          eq(nflMatchups.week, week)
        ));
      
      // Step 4: Process each game into 2 matchup records (home + away)
      const matchupRecords: InsertNflMatchup[] = [];
      
      for (const game of Array.from(gameMap.values())) {
        if (!game.commenceTime) continue;
        
        // Normalize team names to abbreviations
        const homeAbbr = this.normalizeTeamName(game.homeTeam);
        const awayAbbr = this.normalizeTeamName(game.awayTeam);
        
        if (!homeAbbr || !awayAbbr) {
          console.warn(`⚠ Skipping game: couldn't normalize teams ${game.homeTeam} vs ${game.awayTeam}`);
          continue;
        }
        
        // Determine game day from UTC timestamp
        const gameDate = new Date(game.commenceTime);
        const gameDay = gameDate.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
        
        // Home team record
        matchupRecords.push({
          season,
          week,
          teamAbbr: homeAbbr,
          opponentAbbr: awayAbbr,
          gameTimeUtc: game.commenceTime,
          isHome: true,
          gameDay,
          bookmakerSource: game.bookmaker,
        });
        
        // Away team record
        matchupRecords.push({
          season,
          week,
          teamAbbr: awayAbbr,
          opponentAbbr: homeAbbr,
          gameTimeUtc: game.commenceTime,
          isHome: false,
          gameDay,
          bookmakerSource: game.bookmaker,
        });
      }
      
      // Step 5: Bulk insert
      if (matchupRecords.length > 0) {
        await db.insert(nflMatchups).values(matchupRecords);
      }
      
      console.log(`✓ Successfully created ${matchupRecords.length} matchup records for week ${week}`);
      return { success: true, recordCount: matchupRecords.length };
    } catch (error: any) {
      console.error('Error refreshing NFL matchups:', error);
      return { success: false, recordCount: 0, error: error.message };
    }
  }

  async getNflMatchups(season: number, week: number): Promise<NflMatchup[]> {
    return await db
      .select()
      .from(nflMatchups)
      .where(and(
        eq(nflMatchups.season, season),
        eq(nflMatchups.week, week)
      ));
  }

  normalizeTeamName(fullName: string): string | null {
    const mapping: Record<string, string> = {
      // AFC East
      'Buffalo Bills': 'BUF',
      'Miami Dolphins': 'MIA',
      'New England Patriots': 'NE',
      'New York Jets': 'NYJ',
      // AFC North
      'Baltimore Ravens': 'BAL',
      'Cincinnati Bengals': 'CIN',
      'Cleveland Browns': 'CLE',
      'Pittsburgh Steelers': 'PIT',
      // AFC South
      'Houston Texans': 'HOU',
      'Indianapolis Colts': 'IND',
      'Jacksonville Jaguars': 'JAX',
      'Tennessee Titans': 'TEN',
      // AFC West
      'Denver Broncos': 'DEN',
      'Kansas City Chiefs': 'KC',
      'Las Vegas Raiders': 'LV',
      'Los Angeles Chargers': 'LAC',
      'LA Chargers': 'LAC',
      // NFC East
      'Dallas Cowboys': 'DAL',
      'New York Giants': 'NYG',
      'Philadelphia Eagles': 'PHI',
      'Washington Commanders': 'WAS',
      'Washington': 'WAS',
      // NFC North
      'Chicago Bears': 'CHI',
      'Detroit Lions': 'DET',
      'Green Bay Packers': 'GB',
      'Minnesota Vikings': 'MIN',
      // NFC South
      'Atlanta Falcons': 'ATL',
      'Carolina Panthers': 'CAR',
      'New Orleans Saints': 'NO',
      'Tampa Bay Buccaneers': 'TB',
      // NFC West
      'Arizona Cardinals': 'ARI',
      'Los Angeles Rams': 'LAR',
      'LA Rams': 'LAR',
      'San Francisco 49ers': 'SF',
      'Seattle Seahawks': 'SEA'
    };
    
    return mapping[fullName] || null;
  }
}

export const storage = new DatabaseStorage();
