import { 
  type User, type InsertUser,
  type EspnCredentials, type InsertEspnCredentials,
  type Team, type InsertTeam,
  type Matchup, type InsertMatchup,
  type LeagueProfile, type InsertLeagueProfile,
  type LeagueCredentials, type InsertLeagueCredentials,
  type UserLeague, type InsertUserLeague,
  type NflMatchup, type InsertNflMatchup,
  type EspnPlayerData, type InsertEspnPlayerData,
  type FpPlayerData, type InsertFpPlayerData,
  type DefenseVsPositionStats, type InsertDefenseVsPositionStats,
  type PlayerCrosswalk, type InsertPlayerCrosswalk,
  users, espnCredentials, teams, matchups,
  leagueProfiles, leagueCredentials, userLeagues,
  nflMatchups, nflVegasOdds, nflTeamStats,
  espnPlayerData, fpPlayerData, defenseVsPositionStats, playerCrosswalk
} from "@shared/schema";
import { db } from "./db";
import { eq, and, ilike, sql } from "drizzle-orm";
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
  getUserByEmail(email: string): Promise<User | undefined>;
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
  
  // NFL Defensive Rankings (OPRK) methods
  getDefensiveRankings(season: number, week?: number): Promise<Map<string, number>>;

  // ============================================
  // UNIFIED PLAYER DATA METHODS
  // ============================================

  // ESPN Player Data methods
  getEspnPlayerData(sport: string, season: number): Promise<EspnPlayerData[]>;
  getEspnPlayerById(sport: string, season: number, espnPlayerId: number): Promise<EspnPlayerData | undefined>;
  upsertEspnPlayerData(data: InsertEspnPlayerData): Promise<EspnPlayerData>;
  bulkUpsertEspnPlayerData(dataList: InsertEspnPlayerData[]): Promise<{ inserted: number; updated: number }>;
  deleteEspnPlayerData(sport: string, season: number): Promise<number>;

  // FP Player Data methods
  getFpPlayerData(sport: string, season: number): Promise<FpPlayerData[]>;
  getFpPlayerById(sport: string, season: number, fpPlayerId: string): Promise<FpPlayerData | undefined>;
  upsertFpPlayerData(data: InsertFpPlayerData): Promise<FpPlayerData>;
  bulkUpsertFpPlayerData(dataList: InsertFpPlayerData[]): Promise<{ inserted: number; updated: number }>;
  deleteFpPlayerData(sport: string, season: number): Promise<number>;
  deleteFpPlayersWithoutEspnMatch(): Promise<{ deleted: number }>;

  // Defense vs Position Stats methods
  getDefenseVsPositionStats(sport: string, season: number, scoringType?: string): Promise<DefenseVsPositionStats[]>;
  upsertDefenseVsPositionStats(data: InsertDefenseVsPositionStats): Promise<DefenseVsPositionStats>;
  bulkUpsertDefenseVsPositionStats(dataList: InsertDefenseVsPositionStats[]): Promise<{ inserted: number; updated: number }>;
  deleteDefenseVsPositionStats(sport: string, season: number): Promise<number>;

  // Player Crosswalk methods
  getPlayerCrosswalk(sport: string, season: number): Promise<PlayerCrosswalk[]>;
  getCrosswalkByCanonicalKey(sport: string, season: number, canonicalKey: string): Promise<PlayerCrosswalk | undefined>;
  getCrosswalkByEspnId(sport: string, season: number, espnPlayerId: number): Promise<PlayerCrosswalk | undefined>;
  getCrosswalkByFpId(sport: string, season: number, fpPlayerId: string): Promise<PlayerCrosswalk | undefined>;
  upsertPlayerCrosswalk(data: InsertPlayerCrosswalk): Promise<PlayerCrosswalk>;
  bulkUpsertPlayerCrosswalk(dataList: InsertPlayerCrosswalk[]): Promise<{ inserted: number; updated: number }>;
  deletePlayerCrosswalk(sport: string, season: number): Promise<number>;

  // Players Master View methods
  refreshPlayersMasterView(): Promise<{ success: boolean; rowCount: number; error?: string }>;
  getPlayersMaster(sport: string, season: number, filters?: { team?: string; position?: string }): Promise<any[]>;
}

const MemoryStore = createMemoryStore(session);
const PostgresSessionStore = connectPg(session);

export class MemStorage implements IStorage {
  sessionStore: Store;
  private users: Map<string, User>;
  private espnCredentials: Map<string, EspnCredentials>;
  private teams: Map<string, Team>;
  private matchups: Map<string, Matchup>;
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
    this.leagueProfiles = new Map();
    this.leagueCredentials = new Map();
    this.userLeagues = new Map();
  }

  // User methods
  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const u = username.toLowerCase();
    return Array.from(this.users.values()).find(
      (user) => (user.username || "").toLowerCase() === u,
    );
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const e = email.toLowerCase();
    return Array.from(this.users.values()).find(
      (user) => (user as any).email && (user as any).email.toLowerCase() === e,
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
      // Ensure nullable fields are explicitly null, not undefined
      avatarUrl: (insertUser as any).avatarUrl ?? null,
      avatarProvider: (insertUser as any).avatarProvider ?? null,
      avatarKey: (insertUser as any).avatarKey ?? null,
      avatarUpdatedAt: (insertUser as any).avatarUpdatedAt ?? null,
      createdAt: new Date(),
      email: (insertUser as any).email ?? null
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

  async getDefensiveRankings(season: number, week?: number): Promise<Map<string, number>> {
    // MemStorage doesn't support this - return empty map
    return new Map();
  }

  // ============================================
  // UNIFIED PLAYER DATA METHODS (MemStorage stubs)
  // ============================================

  async getEspnPlayerData(sport: string, season: number): Promise<EspnPlayerData[]> {
    throw new Error("ESPN player data not supported in memory storage");
  }

  async getEspnPlayerById(sport: string, season: number, espnPlayerId: number): Promise<EspnPlayerData | undefined> {
    throw new Error("ESPN player data not supported in memory storage");
  }

  async upsertEspnPlayerData(data: InsertEspnPlayerData): Promise<EspnPlayerData> {
    throw new Error("ESPN player data not supported in memory storage");
  }

  async bulkUpsertEspnPlayerData(dataList: InsertEspnPlayerData[]): Promise<{ inserted: number; updated: number }> {
    throw new Error("ESPN player data not supported in memory storage");
  }

  async deleteEspnPlayerData(sport: string, season: number): Promise<number> {
    throw new Error("ESPN player data not supported in memory storage");
  }

  async getFpPlayerData(sport: string, season: number): Promise<FpPlayerData[]> {
    throw new Error("FP player data not supported in memory storage");
  }

  async getFpPlayerById(sport: string, season: number, fpPlayerId: string): Promise<FpPlayerData | undefined> {
    throw new Error("FP player data not supported in memory storage");
  }

  async upsertFpPlayerData(data: InsertFpPlayerData): Promise<FpPlayerData> {
    throw new Error("FP player data not supported in memory storage");
  }

  async bulkUpsertFpPlayerData(dataList: InsertFpPlayerData[]): Promise<{ inserted: number; updated: number }> {
    throw new Error("FP player data not supported in memory storage");
  }

  async deleteFpPlayerData(sport: string, season: number): Promise<number> {
    throw new Error("FP player data not supported in memory storage");
  }

  async deleteFpPlayersWithoutEspnMatch(): Promise<{ deleted: number }> {
    throw new Error("FP player data not supported in memory storage");
  }

  async getDefenseVsPositionStats(sport: string, season: number, scoringType?: string): Promise<DefenseVsPositionStats[]> {
    throw new Error("Defense vs position stats not supported in memory storage");
  }

  async upsertDefenseVsPositionStats(data: InsertDefenseVsPositionStats): Promise<DefenseVsPositionStats> {
    throw new Error("Defense vs position stats not supported in memory storage");
  }

  async bulkUpsertDefenseVsPositionStats(dataList: InsertDefenseVsPositionStats[]): Promise<{ inserted: number; updated: number }> {
    throw new Error("Defense vs position stats not supported in memory storage");
  }

  async deleteDefenseVsPositionStats(sport: string, season: number): Promise<number> {
    throw new Error("Defense vs position stats not supported in memory storage");
  }

  async getPlayerCrosswalk(sport: string, season: number): Promise<PlayerCrosswalk[]> {
    throw new Error("Player crosswalk not supported in memory storage");
  }

  async getCrosswalkByCanonicalKey(sport: string, season: number, canonicalKey: string): Promise<PlayerCrosswalk | undefined> {
    throw new Error("Player crosswalk not supported in memory storage");
  }

  async getCrosswalkByEspnId(sport: string, season: number, espnPlayerId: number): Promise<PlayerCrosswalk | undefined> {
    throw new Error("Player crosswalk not supported in memory storage");
  }

  async getCrosswalkByFpId(sport: string, season: number, fpPlayerId: string): Promise<PlayerCrosswalk | undefined> {
    throw new Error("Player crosswalk not supported in memory storage");
  }

  async upsertPlayerCrosswalk(data: InsertPlayerCrosswalk): Promise<PlayerCrosswalk> {
    throw new Error("Player crosswalk not supported in memory storage");
  }

  async bulkUpsertPlayerCrosswalk(dataList: InsertPlayerCrosswalk[]): Promise<{ inserted: number; updated: number }> {
    throw new Error("Player crosswalk not supported in memory storage");
  }

  async deletePlayerCrosswalk(sport: string, season: number): Promise<number> {
    throw new Error("Player crosswalk not supported in memory storage");
  }

  async refreshPlayersMasterView(): Promise<{ success: boolean; rowCount: number; error?: string }> {
    return { success: false, rowCount: 0, error: "Players master view not supported in memory storage" };
  }

  async getPlayersMaster(sport: string, season: number, filters?: { team?: string; position?: string }): Promise<any[]> {
    throw new Error("Players master view not supported in memory storage");
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
    // Use case-insensitive match so login is not case sensitive
    const [user] = await db
      .select()
      .from(users)
      .where(ilike(users.username, username));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(ilike(users.email, email));
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

  async getDefensiveRankings(season: number, week?: number): Promise<Map<string, number>> {
    try {
      const { normalizeTeamAbbreviation, TEAM_ABBREVIATION_MAP } = await import('../shared/teamAbbreviations');
      
      // Build query conditions
      const conditions = [eq(nflTeamStats.season, season)];
      if (week !== undefined && week !== null) {
        conditions.push(eq(nflTeamStats.week, week));
      }

      // Fetch team stats for the season/week
      const teamStats = await db
        .select()
        .from(nflTeamStats)
        .where(and(...conditions));

      if (teamStats.length === 0) {
        console.warn(`No team stats found for season ${season}, week ${week || 'season'}`);
        return new Map();
      }

      // Calculate points allowed per game for each team
      const teamDefenseStats = teamStats.map(stat => {
        const canonical = normalizeTeamAbbreviation(stat.teamAbbreviation) || stat.teamAbbreviation;
        return {
          teamAbbr: canonical,
          originalAbbr: stat.teamAbbreviation,
          pointsAllowedPerGame: stat.gamesPlayed && stat.gamesPlayed > 0
            ? (stat.pointsAllowed || 0) / stat.gamesPlayed
            : stat.pointsAllowed || 0
        };
      });

      // Sort by points allowed per game (ascending = better defense)
      teamDefenseStats.sort((a, b) => a.pointsAllowedPerGame - b.pointsAllowedPerGame);

      // Assign ranks (1 = best defense/toughest matchup, 32 = worst defense/easiest matchup)
      const rankingsMap = new Map<string, number>();
      teamDefenseStats.forEach((stat, index) => {
        const rank = index + 1;
        // Store rank for canonical abbreviation
        rankingsMap.set(stat.teamAbbr, rank);
        
        // Also store rank for all variants of this team
        const variants = TEAM_ABBREVIATION_MAP[stat.teamAbbr] || [];
        variants.forEach(variant => {
          rankingsMap.set(variant, rank);
        });
      });

      console.log(`Calculated defensive rankings for ${teamDefenseStats.length} teams with ${rankingsMap.size} total mappings`);
      return rankingsMap;
    } catch (error: any) {
      console.error('Error calculating defensive rankings:', error);
      return new Map();
    }
  }

  // ============================================
  // UNIFIED PLAYER DATA METHODS (DatabaseStorage)
  // ============================================

  // ESPN Player Data methods
  async getEspnPlayerData(sport: string, season: number): Promise<EspnPlayerData[]> {
    return await db
      .select()
      .from(espnPlayerData)
      .where(and(
        eq(espnPlayerData.sport, sport),
        eq(espnPlayerData.season, season)
      ));
  }

  async getEspnPlayerById(sport: string, season: number, espnPlayerId: number): Promise<EspnPlayerData | undefined> {
    const [player] = await db
      .select()
      .from(espnPlayerData)
      .where(and(
        eq(espnPlayerData.sport, sport),
        eq(espnPlayerData.season, season),
        eq(espnPlayerData.espnPlayerId, espnPlayerId)
      ));
    return player || undefined;
  }

  async upsertEspnPlayerData(data: InsertEspnPlayerData): Promise<EspnPlayerData> {
    const existing = await this.getEspnPlayerById(data.sport, data.season, data.espnPlayerId);
    
    if (existing) {
      const [updated] = await db
        .update(espnPlayerData)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(espnPlayerData.id, existing.id))
        .returning();
      return updated;
    } else {
      const [inserted] = await db
        .insert(espnPlayerData)
        .values(data)
        .returning();
      return inserted;
    }
  }

  async bulkUpsertEspnPlayerData(dataList: InsertEspnPlayerData[]): Promise<{ inserted: number; updated: number }> {
    let inserted = 0;
    let updated = 0;
    
    for (const data of dataList) {
      const existing = await this.getEspnPlayerById(data.sport, data.season, data.espnPlayerId);
      
      if (existing) {
        await db
          .update(espnPlayerData)
          .set({ ...data, updatedAt: new Date() })
          .where(eq(espnPlayerData.id, existing.id));
        updated++;
      } else {
        await db.insert(espnPlayerData).values(data);
        inserted++;
      }
    }
    
    return { inserted, updated };
  }

  async deleteEspnPlayerData(sport: string, season: number): Promise<number> {
    const result = await db
      .delete(espnPlayerData)
      .where(and(
        eq(espnPlayerData.sport, sport),
        eq(espnPlayerData.season, season)
      ));
    return result.rowCount || 0;
  }

  // FP Player Data methods
  async getFpPlayerData(sport: string, season: number): Promise<FpPlayerData[]> {
    return await db
      .select()
      .from(fpPlayerData)
      .where(and(
        eq(fpPlayerData.sport, sport),
        eq(fpPlayerData.season, season)
      ));
  }

  async getFpPlayerById(sport: string, season: number, fpPlayerId: string): Promise<FpPlayerData | undefined> {
    const [player] = await db
      .select()
      .from(fpPlayerData)
      .where(and(
        eq(fpPlayerData.sport, sport),
        eq(fpPlayerData.season, season),
        eq(fpPlayerData.fpPlayerId, fpPlayerId)
      ));
    return player || undefined;
  }

  async upsertFpPlayerData(data: InsertFpPlayerData): Promise<FpPlayerData> {
    const existing = await this.getFpPlayerById(data.sport, data.season, data.fpPlayerId);
    
    if (existing) {
      const [updated] = await db
        .update(fpPlayerData)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(fpPlayerData.id, existing.id))
        .returning();
      return updated;
    } else {
      const [inserted] = await db
        .insert(fpPlayerData)
        .values(data)
        .returning();
      return inserted;
    }
  }

  async bulkUpsertFpPlayerData(dataList: InsertFpPlayerData[]): Promise<{ inserted: number; updated: number }> {
    let inserted = 0;
    let updated = 0;
    
    for (const data of dataList) {
      const existing = await this.getFpPlayerById(data.sport, data.season, data.fpPlayerId);
      
      if (existing) {
        await db
          .update(fpPlayerData)
          .set({ ...data, updatedAt: new Date() })
          .where(eq(fpPlayerData.id, existing.id));
        updated++;
      } else {
        await db.insert(fpPlayerData).values(data);
        inserted++;
      }
    }
    
    return { inserted, updated };
  }

  async deleteFpPlayerData(sport: string, season: number): Promise<number> {
    const result = await db
      .delete(fpPlayerData)
      .where(and(
        eq(fpPlayerData.sport, sport),
        eq(fpPlayerData.season, season)
      ));
    return result.rowCount || 0;
  }

  async deleteFpPlayersWithoutEspnMatch(): Promise<{ deleted: number }> {
    // Delete FP players that don't have a matching ESPN player
    // Match is based on normalized name (stripping suffixes like II, Jr., Sr.) + team + position
    // Common suffix patterns: II, III, IV, V, Jr., Jr, Sr., Sr
    // Note: Using double backslash for regex escape in JS template literal
    const suffixPattern = '\\s+(II|III|IV|V|Jr\\.?|Sr\\.?|Junior|Senior)$';
    const result = await db.execute(sql`
      DELETE FROM fp_player_data fp
      WHERE NOT EXISTS (
        SELECT 1 FROM espn_player_data espn
        WHERE espn.sport = fp.sport
          AND espn.season = fp.season
          AND UPPER(espn.team) = UPPER(fp.team)
          AND (
            UPPER(espn.position) = UPPER(fp.position)
            OR (UPPER(espn.position) = 'DEF' AND UPPER(fp.position) = 'DST')
            OR (UPPER(espn.position) = 'DST' AND UPPER(fp.position) = 'DEF')
          )
          AND UPPER(TRIM(REGEXP_REPLACE(espn.full_name, ${suffixPattern}, '', 'i'))) 
            = UPPER(TRIM(REGEXP_REPLACE(fp.full_name, ${suffixPattern}, '', 'i')))
      )
    `);
    return { deleted: result.rowCount || 0 };
  }

  // Defense vs Position Stats methods
  async getDefenseVsPositionStats(sport: string, season: number, scoringType?: string): Promise<DefenseVsPositionStats[]> {
    const conditions = [
      eq(defenseVsPositionStats.sport, sport),
      eq(defenseVsPositionStats.season, season)
    ];
    
    if (scoringType) {
      conditions.push(eq(defenseVsPositionStats.scoringType, scoringType));
    }
    
    return await db
      .select()
      .from(defenseVsPositionStats)
      .where(and(...conditions));
  }

  async upsertDefenseVsPositionStats(data: InsertDefenseVsPositionStats): Promise<DefenseVsPositionStats> {
    // Build unique key conditions
    const conditions = [
      eq(defenseVsPositionStats.sport, data.sport),
      eq(defenseVsPositionStats.season, data.season),
      eq(defenseVsPositionStats.defenseTeam, data.defenseTeam),
      eq(defenseVsPositionStats.position, data.position)
    ];
    
    // Handle week (can be null for season averages)
    if (data.week !== null && data.week !== undefined) {
      conditions.push(eq(defenseVsPositionStats.week, data.week));
    }
    
    // Handle scoringType (can be null)
    if (data.scoringType) {
      conditions.push(eq(defenseVsPositionStats.scoringType, data.scoringType));
    }
    
    const [existing] = await db
      .select()
      .from(defenseVsPositionStats)
      .where(and(...conditions));
    
    if (existing) {
      const [updated] = await db
        .update(defenseVsPositionStats)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(defenseVsPositionStats.id, existing.id))
        .returning();
      return updated;
    } else {
      const [inserted] = await db
        .insert(defenseVsPositionStats)
        .values(data)
        .returning();
      return inserted;
    }
  }

  async bulkUpsertDefenseVsPositionStats(dataList: InsertDefenseVsPositionStats[]): Promise<{ inserted: number; updated: number }> {
    let inserted = 0;
    let updated = 0;
    
    for (const data of dataList) {
      const conditions = [
        eq(defenseVsPositionStats.sport, data.sport),
        eq(defenseVsPositionStats.season, data.season),
        eq(defenseVsPositionStats.defenseTeam, data.defenseTeam),
        eq(defenseVsPositionStats.position, data.position)
      ];
      
      if (data.week !== null && data.week !== undefined) {
        conditions.push(eq(defenseVsPositionStats.week, data.week));
      }
      
      if (data.scoringType) {
        conditions.push(eq(defenseVsPositionStats.scoringType, data.scoringType));
      }
      
      const [existing] = await db
        .select()
        .from(defenseVsPositionStats)
        .where(and(...conditions));
      
      if (existing) {
        await db
          .update(defenseVsPositionStats)
          .set({ ...data, updatedAt: new Date() })
          .where(eq(defenseVsPositionStats.id, existing.id));
        updated++;
      } else {
        await db.insert(defenseVsPositionStats).values(data);
        inserted++;
      }
    }
    
    return { inserted, updated };
  }

  async deleteDefenseVsPositionStats(sport: string, season: number): Promise<number> {
    const result = await db
      .delete(defenseVsPositionStats)
      .where(and(
        eq(defenseVsPositionStats.sport, sport),
        eq(defenseVsPositionStats.season, season)
      ));
    return result.rowCount || 0;
  }

  // Player Crosswalk methods
  async getPlayerCrosswalk(sport: string, season: number): Promise<PlayerCrosswalk[]> {
    return await db
      .select()
      .from(playerCrosswalk)
      .where(and(
        eq(playerCrosswalk.sport, sport),
        eq(playerCrosswalk.season, season)
      ));
  }

  async getCrosswalkByCanonicalKey(sport: string, season: number, canonicalKey: string): Promise<PlayerCrosswalk | undefined> {
    const [record] = await db
      .select()
      .from(playerCrosswalk)
      .where(and(
        eq(playerCrosswalk.sport, sport),
        eq(playerCrosswalk.season, season),
        eq(playerCrosswalk.canonicalKey, canonicalKey)
      ));
    return record || undefined;
  }

  async getCrosswalkByEspnId(sport: string, season: number, espnPlayerId: number): Promise<PlayerCrosswalk | undefined> {
    const [record] = await db
      .select()
      .from(playerCrosswalk)
      .where(and(
        eq(playerCrosswalk.sport, sport),
        eq(playerCrosswalk.season, season),
        eq(playerCrosswalk.espnPlayerId, espnPlayerId)
      ));
    return record || undefined;
  }

  async getCrosswalkByFpId(sport: string, season: number, fpPlayerId: string): Promise<PlayerCrosswalk | undefined> {
    const [record] = await db
      .select()
      .from(playerCrosswalk)
      .where(and(
        eq(playerCrosswalk.sport, sport),
        eq(playerCrosswalk.season, season),
        eq(playerCrosswalk.fpPlayerId, fpPlayerId)
      ));
    return record || undefined;
  }

  async upsertPlayerCrosswalk(data: InsertPlayerCrosswalk): Promise<PlayerCrosswalk> {
    const existing = await this.getCrosswalkByCanonicalKey(data.sport, data.season, data.canonicalKey);
    
    if (existing) {
      // Don't overwrite manual overrides unless explicitly told to
      if (existing.manualOverride && !data.manualOverride) {
        return existing;
      }
      
      const [updated] = await db
        .update(playerCrosswalk)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(playerCrosswalk.id, existing.id))
        .returning();
      return updated;
    } else {
      const [inserted] = await db
        .insert(playerCrosswalk)
        .values(data)
        .returning();
      return inserted;
    }
  }

  async bulkUpsertPlayerCrosswalk(dataList: InsertPlayerCrosswalk[]): Promise<{ inserted: number; updated: number }> {
    let inserted = 0;
    let updated = 0;
    
    for (const data of dataList) {
      const existing = await this.getCrosswalkByCanonicalKey(data.sport, data.season, data.canonicalKey);
      
      if (existing) {
        // Don't overwrite manual overrides
        if (existing.manualOverride && !data.manualOverride) {
          continue;
        }
        
        await db
          .update(playerCrosswalk)
          .set({ ...data, updatedAt: new Date() })
          .where(eq(playerCrosswalk.id, existing.id));
        updated++;
      } else {
        await db.insert(playerCrosswalk).values(data);
        inserted++;
      }
    }
    
    return { inserted, updated };
  }

  async deletePlayerCrosswalk(sport: string, season: number): Promise<number> {
    const result = await db
      .delete(playerCrosswalk)
      .where(and(
        eq(playerCrosswalk.sport, sport),
        eq(playerCrosswalk.season, season)
      ));
    return result.rowCount || 0;
  }

  // Players Master View methods
  async refreshPlayersMasterView(): Promise<{ success: boolean; rowCount: number; error?: string }> {
    try {
      console.log('Refreshing players_master materialized view...');
      
      // First, ensure deprecated columns are dropped from source tables
      try {
        await db.execute(sql`ALTER TABLE espn_player_data DROP COLUMN IF EXISTS injury_type`);
        await db.execute(sql`ALTER TABLE fp_player_data DROP COLUMN IF EXISTS status`);
        await db.execute(sql`ALTER TABLE fp_player_data DROP COLUMN IF EXISTS injury_status`);
        console.log('Ensured deprecated injury columns are removed');
      } catch (e) {
        // Columns may already be gone, that's fine
      }
      
      // Check if view needs to be recreated (e.g., if it has old columns)
      const checkResult = await db.execute(sql`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'players_master' AND column_name IN ('injury_type', 'fp_status', 'fp_injury_status')
      `);
      
      if (checkResult.rows.length > 0) {
        console.log('Recreating players_master view to remove deprecated columns...');
        await db.execute(sql`DROP MATERIALIZED VIEW IF EXISTS players_master`);
        
        // Recreate the view with updated schema
        await db.execute(sql`
          CREATE MATERIALIZED VIEW players_master AS
          WITH latest_rankings AS (
            SELECT DISTINCT ON (player_id, sport, season)
              player_id, sport, season, rank, tier, rank_type, scoring_type, week
            FROM fantasy_pros_rankings
            WHERE rank_type = 'weekly'
            ORDER BY player_id, sport, season, week DESC NULLS LAST
          ),
          latest_projections AS (
            SELECT DISTINCT ON (player_id, sport, season)
              player_id, sport, season, projected_points, opponent, stats, week, scoring_type
            FROM fantasy_pros_projections
            ORDER BY player_id, sport, season, week DESC NULLS LAST
          ),
          latest_matchups AS (
            SELECT DISTINCT ON (team_abbr, season)
              team_abbr, season, opponent_abbr, game_time_utc, is_home, game_day, week
            FROM nfl_matchups
            ORDER BY team_abbr, season, week DESC NULLS LAST
          ),
          latest_defense_stats AS (
            SELECT DISTINCT ON (sport, season, defense_team, position)
              sport, season, defense_team, position, rank, avg_points_allowed, scoring_type, week
            FROM defense_vs_position_stats
            ORDER BY sport, season, defense_team, position, 
              CASE scoring_type WHEN 'PPR' THEN 0 WHEN 'HALF' THEN 1 ELSE 2 END,
              week DESC NULLS LAST
          )
          SELECT 
            xw.id as crosswalk_id, xw.canonical_key, xw.sport, xw.season,
            xw.match_confidence, xw.manual_override,
            e.espn_player_id, fp.fp_player_id,
            COALESCE(e.first_name, fp.first_name) as first_name,
            COALESCE(e.last_name, fp.last_name) as last_name,
            COALESCE(e.full_name, fp.full_name) as full_name,
            COALESCE(e.team, fp.team) as team,
            COALESCE(e.position, fp.position) as position,
            COALESCE(e.jersey_number, fp.jersey_number) as jersey_number,
            e.injury_status,
            e.percent_owned, e.percent_started, e.average_points, e.total_points,
            e.last_fetched_at as espn_last_fetched,
            e.latest_outlook as espn_outlook, e.outlook_week as espn_outlook_week,
            e.news_date as espn_news_date,
            fp.latest_headline as fp_headline, fp.latest_analysis as fp_analysis,
            fp.news_date as fp_news_date,
            r.rank as fp_rank, r.tier as fp_tier, r.rank_type,
            r.scoring_type as ranking_scoring_type, r.week as ranking_week,
            p.projected_points, p.opponent as projection_opponent,
            p.stats as projection_stats, p.week as projection_week,
            p.scoring_type as projection_scoring_type,
            m.opponent_abbr, m.game_time_utc, m.is_home, m.game_day,
            m.week as matchup_week,
            dvp.rank as opponent_rank, dvp.avg_points_allowed as opponent_avg_allowed,
            dvp.scoring_type as oprk_scoring_type
          FROM player_crosswalk xw
          LEFT JOIN espn_player_data e ON xw.espn_player_id = e.espn_player_id AND xw.sport = e.sport AND xw.season = e.season
          LEFT JOIN fp_player_data fp ON xw.fp_player_id = fp.fp_player_id AND xw.sport = fp.sport AND xw.season = fp.season
          LEFT JOIN latest_rankings r ON xw.fp_player_id = r.player_id AND xw.sport = r.sport AND xw.season = r.season
          LEFT JOIN latest_projections p ON xw.fp_player_id = p.player_id AND xw.sport = p.sport AND xw.season = p.season
          LEFT JOIN latest_matchups m ON COALESCE(e.team, fp.team) = m.team_abbr AND xw.season = m.season
          LEFT JOIN latest_defense_stats dvp ON m.opponent_abbr = dvp.defense_team 
            AND COALESCE(e.position, fp.position) = dvp.position 
            AND xw.sport = dvp.sport AND xw.season = dvp.season
        `);
        
        // Recreate indexes
        await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS players_master_crosswalk_id ON players_master(crosswalk_id)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS players_master_espn_id ON players_master(espn_player_id)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS players_master_fp_id ON players_master(fp_player_id)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS players_master_team ON players_master(team)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS players_master_position ON players_master(position)`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS players_master_sport_season ON players_master(sport, season)`);
        
        console.log('Recreated players_master view with updated schema');
      } else {
        // Just refresh the existing view
        await db.execute(sql`REFRESH MATERIALIZED VIEW players_master`);
      }
      
      // Get the row count
      const countResult = await db.execute(sql`SELECT COUNT(*) as count FROM players_master`);
      const rowCount = parseInt((countResult.rows[0] as any)?.count || '0');
      
      console.log(`✓ Successfully refreshed players_master view with ${rowCount} rows`);
      return { success: true, rowCount };
    } catch (error: any) {
      console.error('Error refreshing players_master view:', error);
      return { success: false, rowCount: 0, error: error.message };
    }
  }

  async getPlayersMaster(sport: string, season: number, filters?: { team?: string; position?: string }): Promise<any[]> {
    // Build query dynamically based on filters
    if (filters?.team && filters?.position) {
      const result = await db.execute(sql`
        SELECT * FROM players_master 
        WHERE sport = ${sport} AND season = ${season} 
        AND team = ${filters.team} AND position = ${filters.position}
        ORDER BY full_name
      `);
      return result.rows as any[];
    } else if (filters?.team) {
      const result = await db.execute(sql`
        SELECT * FROM players_master 
        WHERE sport = ${sport} AND season = ${season} 
        AND team = ${filters.team}
        ORDER BY full_name
      `);
      return result.rows as any[];
    } else if (filters?.position) {
      const result = await db.execute(sql`
        SELECT * FROM players_master 
        WHERE sport = ${sport} AND season = ${season} 
        AND position = ${filters.position}
        ORDER BY full_name
      `);
      return result.rows as any[];
    } else {
      const result = await db.execute(sql`
        SELECT * FROM players_master 
        WHERE sport = ${sport} AND season = ${season}
        ORDER BY full_name
      `);
      return result.rows as any[];
    }
  }
}

export const storage = new DatabaseStorage();
