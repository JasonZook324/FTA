import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, jsonb, timestamp, uniqueIndex, index, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Reference: blueprint:javascript_auth_all_persistance
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  // Email captured at registration; stored in lowercase (normalized at server)
  // Kept nullable for backward compatibility with existing rows
  email: text("email"),
  password: text("password").notNull(),
  role: integer("role").notNull().default(0), // 0=Standard User, 1=Paid User, 2=Developer, 9=Administrator
  selectedLeagueId: varchar("selected_league_id"), // Store user's preferred league
  selectedTeamId: integer("selected_team_id"), // Store user's selected team ID
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  // Basic unique constraint (case-sensitive). We also add a case-insensitive unique index via migration.
  uniqueEmail: uniqueIndex("users_email_unique").on(table.email),
}));

export const emailVerifications = pgTable("email_verifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  verified: boolean("verified").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  used: boolean("used").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const logs = pgTable("logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }),
  level: text("level").notNull(), // 'debug', 'info', 'warn', 'error', 'fatal'
  message: text("message").notNull(),
  errorCode: text("error_code"),
  source: text("source").notNull(), // e.g., 'routes.ts', 'emailService.ts', 'middleware'
  stack: text("stack"), // Stack trace for errors
  metadata: jsonb("metadata"), // Additional context as JSON
  userAgent: text("user_agent"),
  ip: text("ip"),
  requestId: varchar("request_id"), // For correlating logs from same request
  timestamp: timestamp("timestamp").notNull().defaultNow(),
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

// New shareable league system
export const leagueProfiles = pgTable("league_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  espnLeagueId: text("espn_league_id").notNull(),
  season: integer("season").notNull(),
  name: text("name").notNull(),
  sport: text("sport").notNull(), // ffl, fba, fhk, flb
  teamCount: integer("team_count"),
  currentWeek: integer("current_week"),
  playoffTeams: integer("playoff_teams"),
  scoringType: text("scoring_type"),
  tradeDeadline: text("trade_deadline"),
  settings: jsonb("settings"),
  createdAt: timestamp("created_at").defaultNow(),
  lastUpdated: timestamp("last_updated").defaultNow(),
}, (table) => ({
  uniqueLeague: uniqueIndex("league_profiles_espn_season").on(table.espnLeagueId, table.season),
}));

export const leagueCredentials = pgTable("league_credentials", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  leagueProfileId: varchar("league_profile_id").notNull().references(() => leagueProfiles.id, { onDelete: "cascade" }).unique(), // One credential per league profile
  espnS2: text("espn_s2").notNull(),
  swid: text("swid").notNull(),
  addedByUserId: varchar("added_by_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  isValid: boolean("is_valid").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  lastValidated: timestamp("last_validated"),
});

export const userLeagues = pgTable("user_leagues", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  leagueProfileId: varchar("league_profile_id").notNull().references(() => leagueProfiles.id, { onDelete: "cascade" }),
  role: text("role").default("member"), // member, admin, owner
  joinedAt: timestamp("joined_at").defaultNow(),
}, (table) => ({
  uniqueUserLeague: uniqueIndex("user_leagues_user_league").on(table.userId, table.leagueProfileId),
}));

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

export const insertTeamSchema = createInsertSchema(teams).omit({
  id: true,
});

export const insertMatchupSchema = createInsertSchema(matchups).omit({
  id: true,
});

// New shareable league schemas
export const insertLeagueProfileSchema = createInsertSchema(leagueProfiles).omit({
  id: true,
  createdAt: true,
  lastUpdated: true,
});

export const insertLeagueCredentialsSchema = createInsertSchema(leagueCredentials).omit({
  id: true,
  isValid: true,
  createdAt: true,
  lastValidated: true,
});

export const insertUserLeagueSchema = createInsertSchema(userLeagues).omit({
  id: true,
  joinedAt: true,
});

// Fantasy Pros data tables for contextual information
export const fantasyProsPlayers = pgTable("fantasy_pros_players", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sport: text("sport").notNull(), // NFL, NBA, NHL, MLB
  season: integer("season").notNull(),
  playerId: text("player_id").notNull(), // Fantasy Pros player ID
  name: text("name").notNull(),
  team: text("team"),
  position: text("position"),
  status: text("status"), // Active, Injured, etc.
  jerseyNumber: integer("jersey_number"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  uniquePlayer: uniqueIndex("fp_players_sport_season_id").on(table.sport, table.season, table.playerId),
}));

export const fantasyProsRankings = pgTable("fantasy_pros_rankings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sport: text("sport").notNull(),
  season: integer("season").notNull(),
  week: integer("week"), // null for season-long rankings
  playerId: text("player_id").notNull(),
  playerName: text("player_name").notNull(),
  team: text("team"),
  position: text("position").notNull(),
  rankType: text("rank_type").notNull(), // draft, weekly, ros (rest of season)
  scoringType: text("scoring_type"), // PPR, HALF_PPR, STD
  rank: integer("rank").notNull(),
  tier: integer("tier"),
  bestRank: integer("best_rank"),
  worstRank: integer("worst_rank"),
  avgRank: text("avg_rank"), // decimal as text
  stdDev: text("std_dev"), // decimal as text
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  uniqueRanking: uniqueIndex("fp_rankings_unique").on(
    table.sport, 
    table.season, 
    table.week, 
    table.playerId, 
    table.rankType,
    table.scoringType
  ),
}));

export const fantasyProsProjections = pgTable("fantasy_pros_projections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sport: text("sport").notNull(),
  season: integer("season").notNull(),
  week: integer("week"), // null for season-long projections
  playerId: text("player_id").notNull(),
  playerName: text("player_name").notNull(),
  team: text("team"),
  position: text("position"), // nullable - some projections don't include position
  opponent: text("opponent"),
  scoringType: text("scoring_type"), // PPR, HALF_PPR, STD
  projectedPoints: text("projected_points"), // decimal as text
  stats: jsonb("stats"), // Position-specific stats (pass_yds, rush_yds, rec, etc.)
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  uniqueProjection: uniqueIndex("fp_projections_unique").on(
    table.sport,
    table.season,
    table.week,
    table.playerId,
    table.scoringType
  ),
}));

export const fantasyProsNews = pgTable("fantasy_pros_news", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sport: text("sport").notNull(),
  newsId: text("news_id").notNull().unique(), // Fantasy Pros news ID
  playerId: text("player_id"),
  playerName: text("player_name"),
  team: text("team"),
  position: text("position"),
  headline: text("headline").notNull(),
  description: text("description"),
  analysis: text("analysis"),
  source: text("source"),
  newsDate: timestamp("news_date"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  newsIdIndex: uniqueIndex("fp_news_id").on(table.newsId),
}));

// Data refresh tracking
export const fantasyProsRefreshLog = pgTable("fantasy_pros_refresh_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  dataType: text("data_type").notNull(), // players, rankings, projections, news
  sport: text("sport").notNull(),
  season: integer("season"),
  week: integer("week"),
  recordCount: integer("record_count"),
  status: text("status").notNull(), // success, failed
  errorMessage: text("error_message"),
  refreshedAt: timestamp("refreshed_at").defaultNow(),
});

// ============================================
// UNIFIED PLAYER DATA TABLES
// See docs/unified-player-architecture.md for full documentation
// ============================================

// ESPN Player Data - Cached snapshots from ESPN API
export const espnPlayerData = pgTable("espn_player_data", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  espnPlayerId: integer("espn_player_id").notNull(),
  sport: text("sport").notNull(), // NFL, NBA, NHL, MLB
  season: integer("season").notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  fullName: text("full_name").notNull(),
  team: text("team"), // Normalized team abbreviation
  position: text("position"),
  jerseyNumber: integer("jersey_number"),
  injuryStatus: text("injury_status"), // ACTIVE, QUESTIONABLE, DOUBTFUL, OUT, IR
  percentOwned: real("percent_owned"), // 0-100
  percentStarted: real("percent_started"), // 0-100
  averagePoints: real("average_points"),
  totalPoints: real("total_points"),
  // News/Outlook data from ESPN
  latestOutlook: text("latest_outlook"), // Weekly fantasy outlook from ESPN
  outlookWeek: integer("outlook_week"), // Which week the outlook is for
  newsDate: timestamp("news_date"), // lastNewsDate from ESPN API
  lastFetchedAt: timestamp("last_fetched_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  uniqueEspnPlayer: uniqueIndex("espn_player_data_unique").on(table.sport, table.season, table.espnPlayerId),
  teamIndex: index("espn_player_data_team").on(table.sport, table.season, table.team),
  positionIndex: index("espn_player_data_position").on(table.sport, table.season, table.position),
}));

// FantasyPros Player Data - Separate from existing fantasy_pros_players to avoid confusion
export const fpPlayerData = pgTable("fp_player_data", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fpPlayerId: text("fp_player_id").notNull(),
  sport: text("sport").notNull(), // NFL, NBA, NHL, MLB
  season: integer("season").notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  fullName: text("full_name").notNull(),
  team: text("team"), // Normalized team abbreviation
  position: text("position"),
  jerseyNumber: integer("jersey_number"),
  // News data from FantasyPros
  latestHeadline: text("latest_headline"), // Most recent news headline
  latestAnalysis: text("latest_analysis"), // Most recent news analysis/impact
  newsDate: timestamp("news_date"), // When the latest news was published
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  uniqueFpPlayer: uniqueIndex("fp_player_data_unique").on(table.sport, table.season, table.fpPlayerId),
  teamIndex: index("fp_player_data_team").on(table.sport, table.season, table.team),
  positionIndex: index("fp_player_data_position").on(table.sport, table.season, table.position),
}));

// Defense vs Position Stats - For calculating OPRK (Opponent Rank)
export const defenseVsPositionStats = pgTable("defense_vs_position_stats", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sport: text("sport").notNull(), // NFL primarily
  season: integer("season").notNull(),
  week: integer("week"), // null for season average
  defenseTeam: text("defense_team").notNull(), // Team abbreviation
  position: text("position").notNull(), // QB, RB, WR, TE
  gamesPlayed: integer("games_played"),
  totalPointsAllowed: real("total_points_allowed"),
  avgPointsAllowed: real("avg_points_allowed"),
  rank: integer("rank"), // 1-32 (1 = best defense, 32 = worst)
  scoringType: text("scoring_type"), // PPR, HALF_PPR, STD
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  uniqueDefenseStats: uniqueIndex("defense_vs_position_unique").on(
    table.sport, 
    table.season, 
    table.week, 
    table.defenseTeam, 
    table.position,
    table.scoringType
  ),
}));

// Player Crosswalk - Maps ESPN IDs to FantasyPros IDs
export const playerCrosswalk = pgTable("player_crosswalk", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  canonicalKey: text("canonical_key").notNull(), // lowercase(first+last+team+position)
  sport: text("sport").notNull(),
  season: integer("season").notNull(),
  espnPlayerId: integer("espn_player_id"), // nullable - might not have ESPN match
  fpPlayerId: text("fp_player_id"), // nullable - might not have FP match
  matchConfidence: text("match_confidence").notNull(), // exact, fuzzy, manual, unmatched
  manualOverride: boolean("manual_override").default(false),
  notes: text("notes"), // Admin notes for manual overrides
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  uniqueCrosswalk: uniqueIndex("player_crosswalk_unique").on(table.sport, table.season, table.canonicalKey),
  espnIdIndex: uniqueIndex("player_crosswalk_espn").on(table.sport, table.season, table.espnPlayerId),
  fpIdIndex: uniqueIndex("player_crosswalk_fp").on(table.sport, table.season, table.fpPlayerId),
}));

// Player Aliases - Maps nickname/alternate names to canonical names
export const playerAliases = pgTable("player_aliases", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sport: text("sport").notNull(),
  aliasName: text("alias_name").notNull(), // The alternate name (e.g., "Bam Knight", "Hollywood Brown")
  canonicalName: text("canonical_name").notNull(), // The canonical name (e.g., "Zonovan Knight", "Marquise Brown")
  aliasType: text("alias_type").notNull(), // nickname, legal_name, abbreviated
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  uniqueAlias: uniqueIndex("player_aliases_unique").on(table.sport, table.aliasName),
}));

// Insert schemas for unified player tables
export const insertEspnPlayerDataSchema = createInsertSchema(espnPlayerData).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastFetchedAt: true,
});

export const insertFpPlayerDataSchema = createInsertSchema(fpPlayerData).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertDefenseVsPositionStatsSchema = createInsertSchema(defenseVsPositionStats).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPlayerCrosswalkSchema = createInsertSchema(playerCrosswalk).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPlayerAliasSchema = createInsertSchema(playerAliases).omit({
  id: true,
  createdAt: true,
});

export const insertFantasyProsPlayerSchema = createInsertSchema(fantasyProsPlayers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertFantasyProsRankingSchema = createInsertSchema(fantasyProsRankings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertFantasyProsProjectionSchema = createInsertSchema(fantasyProsProjections).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertFantasyProsNewsSchema = createInsertSchema(fantasyProsNews).omit({
  id: true,
  createdAt: true,
});

export const insertFantasyProsRefreshLogSchema = createInsertSchema(fantasyProsRefreshLog).omit({
  id: true,
  refreshedAt: true,
});

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type EspnCredentials = typeof espnCredentials.$inferSelect;
export type InsertEspnCredentials = z.infer<typeof insertEspnCredentialsSchema>;
export type Team = typeof teams.$inferSelect;
export type InsertTeam = z.infer<typeof insertTeamSchema>;
export type FantasyProsPlayer = typeof fantasyProsPlayers.$inferSelect;
export type InsertFantasyProsPlayer = z.infer<typeof insertFantasyProsPlayerSchema>;
export type FantasyProsRanking = typeof fantasyProsRankings.$inferSelect;
export type InsertFantasyProsRanking = z.infer<typeof insertFantasyProsRankingSchema>;
export type FantasyProsProjection = typeof fantasyProsProjections.$inferSelect;
export type InsertFantasyProsProjection = z.infer<typeof insertFantasyProsProjectionSchema>;
export type FantasyProsNews = typeof fantasyProsNews.$inferSelect;
export type InsertFantasyProsNews = z.infer<typeof insertFantasyProsNewsSchema>;
export type FantasyProsRefreshLog = typeof fantasyProsRefreshLog.$inferSelect;
export type InsertFantasyProsRefreshLog = z.infer<typeof insertFantasyProsRefreshLogSchema>;
export type Matchup = typeof matchups.$inferSelect;
export type InsertMatchup = z.infer<typeof insertMatchupSchema>;
export type LeagueProfile = typeof leagueProfiles.$inferSelect;
export type InsertLeagueProfile = z.infer<typeof insertLeagueProfileSchema>;
export type LeagueCredentials = typeof leagueCredentials.$inferSelect;
export type InsertLeagueCredentials = z.infer<typeof insertLeagueCredentialsSchema>;
export type UserLeague = typeof userLeagues.$inferSelect;
export type InsertUserLeague = z.infer<typeof insertUserLeagueSchema>;

// NFL Kicker Streaming Data Tables
export const nflStadiums = pgTable("nfl_stadiums", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  teamAbbreviation: text("team_abbreviation").notNull().unique(), // e.g., "ARI", "ATL"
  teamName: text("team_name").notNull(),
  stadiumName: text("stadium_name").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
  roofType: text("roof_type").notNull(), // "dome", "retractable", "open"
  surfaceType: text("surface_type"), // "grass", "turf", etc.
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  teamAbbreviationIndex: uniqueIndex("nfl_stadiums_team_abbr").on(table.teamAbbreviation),
}));

export const nflVegasOdds = pgTable("nfl_vegas_odds", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  season: integer("season").notNull(),
  week: integer("week").notNull(),
  gameId: text("game_id").notNull(), // External API game ID
  homeTeam: text("home_team").notNull(),
  awayTeam: text("away_team").notNull(),
  commenceTime: timestamp("commence_time"),
  homeMoneyline: integer("home_moneyline"), // e.g., -150
  awayMoneyline: integer("away_moneyline"), // e.g., +130
  homeSpread: text("home_spread"), // e.g., "-7.5"
  awaySpread: text("away_spread"), // e.g., "+7.5"
  overUnder: text("over_under"), // e.g., "47.5"
  bookmaker: text("bookmaker"), // e.g., "draftkings", "fanduel"
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  uniqueGameBookmaker: uniqueIndex("nfl_vegas_odds_game_bookmaker").on(table.season, table.week, table.gameId, table.bookmaker),
}));

export const nflTeamStats = pgTable("nfl_team_stats", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  season: integer("season").notNull(),
  week: integer("week"), // null for season totals
  teamAbbreviation: text("team_abbreviation").notNull(),
  teamName: text("team_name").notNull(),
  gamesPlayed: integer("games_played"),
  // Red Zone Offense
  redZoneAttempts: integer("red_zone_attempts"),
  redZoneTouchdowns: integer("red_zone_touchdowns"),
  redZoneFieldGoals: integer("red_zone_field_goals"),
  redZoneTdRate: text("red_zone_td_rate"), // decimal as text
  // Red Zone Defense
  oppRedZoneAttempts: integer("opp_red_zone_attempts"),
  oppRedZoneTouchdowns: integer("opp_red_zone_touchdowns"),
  oppRedZoneFieldGoals: integer("opp_red_zone_field_goals"),
  oppRedZoneTdRate: text("opp_red_zone_td_rate"), // decimal as text
  // Kicking Stats
  fieldGoalAttempts: integer("field_goal_attempts"),
  fieldGoalsMade: integer("field_goals_made"),
  fieldGoalPercentage: text("field_goal_percentage"),
  // General offense/defense
  pointsScored: integer("points_scored"),
  pointsAllowed: integer("points_allowed"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  uniqueTeamSeasonWeek: uniqueIndex("nfl_team_stats_unique").on(table.season, table.week, table.teamAbbreviation),
}));

export const nflMatchups = pgTable("nfl_matchups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  season: integer("season").notNull(),
  week: integer("week").notNull(),
  teamAbbr: text("team_abbr").notNull(),
  opponentAbbr: text("opponent_abbr").notNull(),
  gameTimeUtc: timestamp("game_time_utc").notNull(),
  isHome: boolean("is_home").notNull(),
  gameDay: text("game_day"),
  venue: text("venue"),
  bookmakerSource: text("bookmaker_source"),
  oddsSnapshotTs: timestamp("odds_snapshot_ts").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  uniqueTeamWeek: uniqueIndex("nfl_matchups_team_week").on(table.season, table.week, table.teamAbbr),
}));

export const insertNflStadiumSchema = createInsertSchema(nflStadiums).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertNflVegasOddsSchema = createInsertSchema(nflVegasOdds).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertNflTeamStatsSchema = createInsertSchema(nflTeamStats).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertNflMatchupSchema = createInsertSchema(nflMatchups).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  oddsSnapshotTs: true,
});

// AI Prompt Responses - Store OpenAI conversation history
export const aiPromptResponses = pgTable("ai_prompt_responses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  leagueId: varchar("league_id").references(() => leagueProfiles.id, { onDelete: "set null" }),
  teamId: integer("team_id"), // ESPN team ID, not FK (teams can change)
  
  // Prompt data
  promptText: text("prompt_text").notNull(),
  promptOptions: jsonb("prompt_options"), // Store user's selected options for reference
  
  // AI response data
  responseText: text("response_text").notNull(),
  aiModel: text("ai_model").notNull(), // e.g., "gpt-4", "gpt-3.5-turbo"
  aiProvider: text("ai_provider").notNull().default("openai"),
  
  // Metadata
  tokensUsed: integer("tokens_used"),
  responseTime: integer("response_time"), // Milliseconds
  status: text("status").notNull().default("success"), // success, error, timeout
  errorMessage: text("error_message"),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIndex: uniqueIndex("ai_responses_user_id").on(table.userId),
  createdAtIndex: uniqueIndex("ai_responses_created_at").on(table.createdAt),
}));

export const insertAiPromptResponseSchema = createInsertSchema(aiPromptResponses).omit({
  id: true,
  createdAt: true,
});

export const insertEmailVerificationSchema = createInsertSchema(emailVerifications).omit({
  id: true,
  createdAt: true,
});

export const insertPasswordResetTokenSchema = createInsertSchema(passwordResetTokens).omit({
  id: true,
  createdAt: true,
});

export const insertLogSchema = createInsertSchema(logs).omit({
  id: true,
  timestamp: true,
});

export type Log = typeof logs.$inferSelect;
export type InsertLog = z.infer<typeof insertLogSchema>;
export type NflStadium = typeof nflStadiums.$inferSelect;
export type InsertNflStadium = z.infer<typeof insertNflStadiumSchema>;
export type NflVegasOdds = typeof nflVegasOdds.$inferSelect;
export type InsertNflVegasOdds = z.infer<typeof insertNflVegasOddsSchema>;
export type NflTeamStats = typeof nflTeamStats.$inferSelect;
export type InsertNflTeamStats = z.infer<typeof insertNflTeamStatsSchema>;
export type NflMatchup = typeof nflMatchups.$inferSelect;
export type InsertNflMatchup = z.infer<typeof insertNflMatchupSchema>;
export type AiPromptResponse = typeof aiPromptResponses.$inferSelect;
export type InsertAiPromptResponse = z.infer<typeof insertAiPromptResponseSchema>;
export type EmailVerification = typeof emailVerifications.$inferSelect;
export type InsertEmailVerification = z.infer<typeof insertEmailVerificationSchema>;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type InsertPasswordResetToken = z.infer<typeof insertPasswordResetTokenSchema>;

// Unified Player Data Types
export type EspnPlayerData = typeof espnPlayerData.$inferSelect;
export type InsertEspnPlayerData = z.infer<typeof insertEspnPlayerDataSchema>;
export type FpPlayerData = typeof fpPlayerData.$inferSelect;
export type InsertFpPlayerData = z.infer<typeof insertFpPlayerDataSchema>;
export type DefenseVsPositionStats = typeof defenseVsPositionStats.$inferSelect;
export type InsertDefenseVsPositionStats = z.infer<typeof insertDefenseVsPositionStatsSchema>;
export type PlayerCrosswalk = typeof playerCrosswalk.$inferSelect;
export type InsertPlayerCrosswalk = z.infer<typeof insertPlayerCrosswalkSchema>;
