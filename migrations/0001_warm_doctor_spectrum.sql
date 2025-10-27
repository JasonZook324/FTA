CREATE TABLE "nfl_stadiums" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_abbreviation" text NOT NULL,
	"team_name" text NOT NULL,
	"stadium_name" text NOT NULL,
	"city" text NOT NULL,
	"state" text NOT NULL,
	"roof_type" text NOT NULL,
	"surface_type" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "nfl_stadiums_team_abbreviation_unique" UNIQUE("team_abbreviation")
);
--> statement-breakpoint
CREATE TABLE "nfl_team_stats" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season" integer NOT NULL,
	"week" integer,
	"team_abbreviation" text NOT NULL,
	"team_name" text NOT NULL,
	"games_played" integer,
	"red_zone_attempts" integer,
	"red_zone_touchdowns" integer,
	"red_zone_field_goals" integer,
	"red_zone_td_rate" text,
	"opp_red_zone_attempts" integer,
	"opp_red_zone_touchdowns" integer,
	"opp_red_zone_field_goals" integer,
	"opp_red_zone_td_rate" text,
	"field_goal_attempts" integer,
	"field_goals_made" integer,
	"field_goal_percentage" text,
	"points_scored" integer,
	"points_allowed" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "nfl_vegas_odds" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season" integer NOT NULL,
	"week" integer NOT NULL,
	"game_id" text NOT NULL,
	"home_team" text NOT NULL,
	"away_team" text NOT NULL,
	"commence_time" timestamp,
	"home_moneyline" integer,
	"away_moneyline" integer,
	"home_spread" text,
	"away_spread" text,
	"over_under" text,
	"bookmaker" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "fantasy_pros_projections" ALTER COLUMN "position" DROP NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "nfl_stadiums_team_abbr" ON "nfl_stadiums" USING btree ("team_abbreviation");--> statement-breakpoint
CREATE UNIQUE INDEX "nfl_team_stats_unique" ON "nfl_team_stats" USING btree ("season","week","team_abbreviation");--> statement-breakpoint
CREATE UNIQUE INDEX "nfl_vegas_odds_game_bookmaker" ON "nfl_vegas_odds" USING btree ("season","week","game_id","bookmaker");