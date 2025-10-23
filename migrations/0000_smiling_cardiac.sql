CREATE TABLE "espn_credentials" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"espn_s2" text NOT NULL,
	"swid" text NOT NULL,
	"test_league_id" text,
	"test_season" integer,
	"is_valid" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"last_validated" timestamp
);
--> statement-breakpoint
CREATE TABLE "fantasy_pros_news" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sport" text NOT NULL,
	"news_id" text NOT NULL,
	"player_id" text,
	"player_name" text,
	"team" text,
	"position" text,
	"headline" text NOT NULL,
	"description" text,
	"analysis" text,
	"source" text,
	"news_date" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "fantasy_pros_news_news_id_unique" UNIQUE("news_id")
);
--> statement-breakpoint
CREATE TABLE "fantasy_pros_players" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sport" text NOT NULL,
	"season" integer NOT NULL,
	"player_id" text NOT NULL,
	"name" text NOT NULL,
	"team" text,
	"position" text,
	"status" text,
	"jersey_number" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "fantasy_pros_projections" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sport" text NOT NULL,
	"season" integer NOT NULL,
	"week" integer,
	"player_id" text NOT NULL,
	"player_name" text NOT NULL,
	"team" text,
	"position" text NOT NULL,
	"opponent" text,
	"scoring_type" text,
	"projected_points" text,
	"stats" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "fantasy_pros_rankings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sport" text NOT NULL,
	"season" integer NOT NULL,
	"week" integer,
	"player_id" text NOT NULL,
	"player_name" text NOT NULL,
	"team" text,
	"position" text NOT NULL,
	"rank_type" text NOT NULL,
	"scoring_type" text,
	"rank" integer NOT NULL,
	"tier" integer,
	"best_rank" integer,
	"worst_rank" integer,
	"avg_rank" text,
	"std_dev" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "fantasy_pros_refresh_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"data_type" text NOT NULL,
	"sport" text NOT NULL,
	"season" integer,
	"week" integer,
	"record_count" integer,
	"status" text NOT NULL,
	"error_message" text,
	"refreshed_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "leagues" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"espn_league_id" text NOT NULL,
	"user_id" varchar NOT NULL,
	"name" text NOT NULL,
	"sport" text NOT NULL,
	"season" integer NOT NULL,
	"team_count" integer,
	"current_week" integer,
	"playoff_teams" integer,
	"scoring_type" text,
	"trade_deadline" text,
	"settings" jsonb,
	"last_updated" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "matchups" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" varchar NOT NULL,
	"week" integer NOT NULL,
	"home_team_id" varchar NOT NULL,
	"away_team_id" varchar NOT NULL,
	"home_score" text,
	"away_score" text,
	"is_complete" boolean DEFAULT false,
	"matchup_date" text
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"espn_player_id" integer NOT NULL,
	"name" text NOT NULL,
	"team" text,
	"position" text,
	"is_active" boolean DEFAULT true,
	"stats" jsonb
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"espn_team_id" integer NOT NULL,
	"league_id" varchar NOT NULL,
	"name" text NOT NULL,
	"owner" text,
	"abbreviation" text,
	"logo_url" text,
	"wins" integer DEFAULT 0,
	"losses" integer DEFAULT 0,
	"ties" integer DEFAULT 0,
	"points_for" text,
	"points_against" text,
	"streak" text,
	"rank" integer
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	"selected_league_id" varchar,
	"selected_team_id" integer,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "espn_credentials" ADD CONSTRAINT "espn_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leagues" ADD CONSTRAINT "leagues_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "fp_news_id" ON "fantasy_pros_news" USING btree ("news_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fp_players_sport_season_id" ON "fantasy_pros_players" USING btree ("sport","season","player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fp_projections_unique" ON "fantasy_pros_projections" USING btree ("sport","season","week","player_id","scoring_type");--> statement-breakpoint
CREATE UNIQUE INDEX "fp_rankings_unique" ON "fantasy_pros_rankings" USING btree ("sport","season","week","player_id","rank_type","scoring_type");--> statement-breakpoint
CREATE UNIQUE INDEX "leagues_user_espn_season" ON "leagues" USING btree ("user_id","espn_league_id","season");--> statement-breakpoint
CREATE UNIQUE INDEX "teams_league_team" ON "teams" USING btree ("league_id","espn_team_id");