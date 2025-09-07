import { 
  type User, type InsertUser,
  type EspnCredentials, type InsertEspnCredentials,
  type League, type InsertLeague,
  type Team, type InsertTeam,
  type Matchup, type InsertMatchup,
  type Player, type InsertPlayer,
  users, espnCredentials, leagues, teams, matchups, players
} from "@shared/schema";
import { db } from "./db";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";

export interface IStorage {
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

  // League methods
  getLeagues(userId: string): Promise<League[]>;
  getLeague(id: string): Promise<League | undefined>;
  createLeague(league: InsertLeague): Promise<League>;
  updateLeague(id: string, league: Partial<League>): Promise<League | undefined>;
  deleteAllUserLeagues(userId: string): Promise<boolean>;

  // Team methods
  getTeams(leagueId: string): Promise<Team[]>;
  createTeam(team: InsertTeam): Promise<Team>;
  updateTeam(id: string, team: Partial<Team>): Promise<Team | undefined>;

  // Matchup methods
  getMatchups(leagueId: string, week?: number): Promise<Matchup[]>;
  createMatchup(matchup: InsertMatchup): Promise<Matchup>;
  updateMatchup(id: string, matchup: Partial<Matchup>): Promise<Matchup | undefined>;

  // Player methods
  getPlayers(): Promise<Player[]>;
  getPlayer(espnPlayerId: number): Promise<Player | undefined>;
  createPlayer(player: InsertPlayer): Promise<Player>;
  updatePlayer(id: string, player: Partial<Player>): Promise<Player | undefined>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private espnCredentials: Map<string, EspnCredentials>;
  private leagues: Map<string, League>;
  private teams: Map<string, Team>;
  private matchups: Map<string, Matchup>;
  private players: Map<string, Player>;

  constructor() {
    this.users = new Map();
    this.espnCredentials = new Map();
    this.leagues = new Map();
    this.teams = new Map();
    this.matchups = new Map();
    this.players = new Map();
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
    const user: User = { ...insertUser, id, selectedLeagueId: null };
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
      lastValidated: null
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

  // League methods
  async getLeagues(userId: string): Promise<League[]> {
    return Array.from(this.leagues.values()).filter(
      (league) => league.userId === userId,
    );
  }

  async getLeague(id: string): Promise<League | undefined> {
    return this.leagues.get(id);
  }

  async createLeague(league: InsertLeague): Promise<League> {
    const id = randomUUID();
    const newLeague: League = { 
      ...league, 
      id,
      lastUpdated: new Date(),
      teamCount: league.teamCount ?? null,
      currentWeek: league.currentWeek ?? null,
      playoffTeams: league.playoffTeams ?? null,
      scoringType: league.scoringType ?? null,
      tradeDeadline: league.tradeDeadline ?? null,
      settings: league.settings ?? null
    };
    this.leagues.set(id, newLeague);
    return newLeague;
  }

  async updateLeague(id: string, updates: Partial<League>): Promise<League | undefined> {
    const existing = this.leagues.get(id);
    if (!existing) return undefined;
    
    const updated: League = { 
      ...existing, 
      ...updates,
      lastUpdated: new Date()
    };
    this.leagues.set(id, updated);
    return updated;
  }

  async deleteAllUserLeagues(userId: string): Promise<boolean> {
    const userLeagues = await this.getLeagues(userId);
    let deletedCount = 0;
    
    for (const league of userLeagues) {
      // Delete teams for this league
      const leagueTeams = await this.getTeams(league.id);
      for (const team of leagueTeams) {
        this.teams.delete(team.id);
      }
      
      // Delete matchups for this league
      const leagueMatchups = await this.getMatchups(league.id);
      for (const matchup of leagueMatchups) {
        this.matchups.delete(matchup.id);
      }
      
      // Delete the league itself
      this.leagues.delete(league.id);
      deletedCount++;
    }
    
    return deletedCount > 0;
  }

  // Team methods
  async getTeams(leagueId: string): Promise<Team[]> {
    return Array.from(this.teams.values()).filter(
      (team) => team.leagueId === leagueId,
    );
  }

  async getTeam(id: string): Promise<Team | undefined> {
    return this.teams.get(id);
  }

  async getTeamByEspnId(leagueId: string, espnTeamId: number): Promise<Team | undefined> {
    return Array.from(this.teams.values()).find(
      team => team.leagueId === leagueId && team.espnTeamId === espnTeamId
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
}

export class DatabaseStorage implements IStorage {
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
    const deletedRows = await db
      .delete(espnCredentials)
      .where(eq(espnCredentials.userId, userId));
    return (deletedRows.rowCount || 0) > 0;
  }

  // League methods
  async getLeagues(userId: string): Promise<League[]> {
    return await db
      .select()
      .from(leagues)
      .where(eq(leagues.userId, userId));
  }

  async getLeague(id: string): Promise<League | undefined> {
    const [league] = await db.select().from(leagues).where(eq(leagues.id, id));
    return league || undefined;
  }

  async createLeague(league: InsertLeague): Promise<League> {
    const [newLeague] = await db
      .insert(leagues)
      .values({
        ...league,
        lastUpdated: new Date()
      })
      .returning();
    return newLeague;
  }

  async updateLeague(id: string, updates: Partial<League>): Promise<League | undefined> {
    const [updated] = await db
      .update(leagues)
      .set({
        ...updates,
        lastUpdated: new Date()
      })
      .where(eq(leagues.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteAllUserLeagues(userId: string): Promise<boolean> {
    try {
      // Get all user leagues first
      const userLeagues = await this.getLeagues(userId);
      
      if (userLeagues.length === 0) {
        return false;
      }
      
      // Delete teams for all user leagues
      for (const league of userLeagues) {
        await db.delete(teams).where(eq(teams.leagueId, league.id));
        await db.delete(matchups).where(eq(matchups.leagueId, league.id));
      }
      
      // Delete all user leagues
      const deletedLeagues = await db
        .delete(leagues)
        .where(eq(leagues.userId, userId));
      
      return (deletedLeagues.rowCount || 0) > 0;
    } catch (error) {
      console.error('Error deleting user leagues:', error);
      return false;
    }
  }

  // Team methods
  async getTeams(leagueId: string): Promise<Team[]> {
    return await db
      .select()
      .from(teams)
      .where(eq(teams.leagueId, leagueId));
  }

  async getTeam(id: string): Promise<Team | undefined> {
    const [team] = await db
      .select()
      .from(teams)
      .where(eq(teams.id, id));
    return team || undefined;
  }

  async getTeamByEspnId(leagueId: string, espnTeamId: number): Promise<Team | undefined> {
    const [team] = await db
      .select()
      .from(teams)
      .where(eq(teams.leagueId, leagueId) && eq(teams.espnTeamId, espnTeamId));
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
}

export const storage = new DatabaseStorage();
