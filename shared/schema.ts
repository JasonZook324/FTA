import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, jsonb, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Reference: blueprint:javascript_auth_all_persistance
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  selectedLeagueId: varchar("selected_league_id"), // Store user's preferred league
  selectedTeamId: integer("selected_team_id"), // Store user's selected team ID
  createdAt: timestamp("created_at").defaultNow(),
});

export const espnCredentials = pgTable("espn_credentials", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  espnS2: text("espn_s2").notNull(),
  swid: text("swid").notNull(),
  testLeagueId: text("test_league_id"),
  testSeason: integer("test_season"),
  isValid: boolean("is_valid").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  lastValidated: timestamp("last_validated"),
});

export const leagues = pgTable("leagues", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  espnLeagueId: text("espn_league_id").notNull(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sport: text("sport").notNull(), // ffl, fba, fhk, flb
  season: integer("season").notNull(),
  teamCount: integer("team_count"),
  currentWeek: integer("current_week"),
  playoffTeams: integer("playoff_teams"),
  scoringType: text("scoring_type"),
  tradeDeadline: text("trade_deadline"),
  settings: jsonb("settings"),
  lastUpdated: timestamp("last_updated").defaultNow(),
}, (table) => ({
  uniqueLeaguePerUser: uniqueIndex("leagues_user_espn_season").on(table.userId, table.espnLeagueId, table.season),
}));

export const teams = pgTable("teams", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  espnTeamId: integer("espn_team_id").notNull(),
  leagueId: varchar("league_id").notNull(),
  name: text("name").notNull(),
  owner: text("owner"),
  abbreviation: text("abbreviation"),
  logoUrl: text("logo_url"),
  wins: integer("wins").default(0),
  losses: integer("losses").default(0),
  ties: integer("ties").default(0),
  pointsFor: text("points_for"), // Using text to handle decimal precision
  pointsAgainst: text("points_against"),
  streak: text("streak"),
  rank: integer("rank"),
}, (table) => ({
  uniqueTeamPerLeague: uniqueIndex("teams_league_team").on(table.leagueId, table.espnTeamId),
}));

export const matchups = pgTable("matchups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leagueId: varchar("league_id").notNull(),
  week: integer("week").notNull(),
  homeTeamId: varchar("home_team_id").notNull(),
  awayTeamId: varchar("away_team_id").notNull(),
  homeScore: text("home_score"),
  awayScore: text("away_score"),
  isComplete: boolean("is_complete").default(false),
  matchupDate: text("matchup_date"),
});

export const players = pgTable("players", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  espnPlayerId: integer("espn_player_id").notNull(),
  name: text("name").notNull(),
  team: text("team"),
  position: text("position"),
  isActive: boolean("is_active").default(true),
  stats: jsonb("stats"),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  selectedLeagueId: true,
  selectedTeamId: true,
});

export const insertEspnCredentialsSchema = createInsertSchema(espnCredentials).omit({
  id: true,
  isValid: true,
  createdAt: true,
  lastValidated: true,
});

export const insertLeagueSchema = createInsertSchema(leagues).omit({
  id: true,
  lastUpdated: true,
});

export const insertTeamSchema = createInsertSchema(teams).omit({
  id: true,
});

export const insertMatchupSchema = createInsertSchema(matchups).omit({
  id: true,
});

export const insertPlayerSchema = createInsertSchema(players).omit({
  id: true,
});

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type EspnCredentials = typeof espnCredentials.$inferSelect;
export type InsertEspnCredentials = z.infer<typeof insertEspnCredentialsSchema>;
export type League = typeof leagues.$inferSelect;
export type InsertLeague = z.infer<typeof insertLeagueSchema>;
export type Team = typeof teams.$inferSelect;
export type InsertTeam = z.infer<typeof insertTeamSchema>;
export type Matchup = typeof matchups.$inferSelect;
export type InsertMatchup = z.infer<typeof insertMatchupSchema>;
export type Player = typeof players.$inferSelect;
export type InsertPlayer = z.infer<typeof insertPlayerSchema>;
