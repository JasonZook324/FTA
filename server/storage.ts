import { 
  type User, type InsertUser,
  type EspnCredentials, type InsertEspnCredentials,
  type League, type InsertLeague,
  type Team, type InsertTeam,
  type Matchup, type InsertMatchup,
  type Player, type InsertPlayer
} from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // User methods
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // ESPN Credentials methods
  getEspnCredentials(userId: string): Promise<EspnCredentials | undefined>;
  createEspnCredentials(credentials: InsertEspnCredentials): Promise<EspnCredentials>;
  updateEspnCredentials(userId: string, credentials: Partial<EspnCredentials>): Promise<EspnCredentials | undefined>;

  // League methods
  getLeagues(userId: string): Promise<League[]>;
  getLeague(id: string): Promise<League | undefined>;
  createLeague(league: InsertLeague): Promise<League>;
  updateLeague(id: string, league: Partial<League>): Promise<League | undefined>;

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
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
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

  // Team methods
  async getTeams(leagueId: string): Promise<Team[]> {
    return Array.from(this.teams.values()).filter(
      (team) => team.leagueId === leagueId,
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

export const storage = new MemStorage();
