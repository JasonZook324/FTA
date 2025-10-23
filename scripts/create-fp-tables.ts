import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Load DATABASE_URL from .env file (Neon database)
let DATABASE_URL = process.env.DATABASE_URL;

try {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const envConfig = dotenv.parse(fs.readFileSync(envPath));
    if (envConfig.DATABASE_URL) {
      DATABASE_URL = envConfig.DATABASE_URL;
      console.log('Using DATABASE_URL from .env file');
    }
  }
} catch (error) {
  console.warn('Could not read .env file, using environment variable:', error);
}

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL must be set');
}

console.log('DATABASE_URL:', DATABASE_URL.replace(/:[^:@]+@/, ':***@'));
const sql = neon(DATABASE_URL);

async function createFantasyProsTables() {
  try {
    console.log('Creating Fantasy Pros tables in Neon database...');
    
    // First, check what tables currently exist
    const existingTables = await sql`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name LIKE 'fantasy_pros%'
    `;
    console.log('Existing FP tables before creation:', existingTables.map(t => t.table_name));

    // Create fantasy_pros_players table
    await sql`
      CREATE TABLE IF NOT EXISTS fantasy_pros_players (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        sport text NOT NULL,
        season integer NOT NULL,
        player_id text NOT NULL,
        name text NOT NULL,
        team text,
        position text,
        status text,
        jersey_number integer,
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )
    `;
    
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS fp_players_sport_season_id 
      ON fantasy_pros_players (sport, season, player_id)
    `;
    console.log('✓ Created fantasy_pros_players table');

    // Create fantasy_pros_rankings table
    await sql`
      CREATE TABLE IF NOT EXISTS fantasy_pros_rankings (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        sport text NOT NULL,
        season integer NOT NULL,
        week integer,
        player_id text NOT NULL,
        player_name text NOT NULL,
        team text,
        position text NOT NULL,
        rank_type text NOT NULL,
        scoring_type text,
        rank integer NOT NULL,
        tier integer,
        best_rank integer,
        worst_rank integer,
        avg_rank text,
        std_dev text,
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )
    `;
    
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS fp_rankings_unique 
      ON fantasy_pros_rankings (sport, season, week, player_id, rank_type, scoring_type)
    `;
    console.log('✓ Created fantasy_pros_rankings table');

    // Create fantasy_pros_projections table
    await sql`
      CREATE TABLE IF NOT EXISTS fantasy_pros_projections (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        sport text NOT NULL,
        season integer NOT NULL,
        week integer,
        player_id text NOT NULL,
        player_name text NOT NULL,
        team text,
        position text NOT NULL,
        opponent text,
        scoring_type text,
        projected_points text,
        stats jsonb,
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )
    `;
    
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS fp_projections_unique 
      ON fantasy_pros_projections (sport, season, week, player_id, scoring_type)
    `;
    console.log('✓ Created fantasy_pros_projections table');

    // Create fantasy_pros_news table
    await sql`
      CREATE TABLE IF NOT EXISTS fantasy_pros_news (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        sport text NOT NULL,
        news_id text NOT NULL UNIQUE,
        player_id text,
        player_name text,
        team text,
        position text,
        headline text NOT NULL,
        description text,
        analysis text,
        source text,
        news_date timestamp,
        created_at timestamp DEFAULT now()
      )
    `;
    
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS fp_news_id 
      ON fantasy_pros_news (news_id)
    `;
    console.log('✓ Created fantasy_pros_news table');

    // Create fantasy_pros_refresh_log table
    await sql`
      CREATE TABLE IF NOT EXISTS fantasy_pros_refresh_log (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        data_type text NOT NULL,
        sport text NOT NULL,
        season integer,
        week integer,
        record_count integer,
        status text NOT NULL,
        error_message text,
        refreshed_at timestamp DEFAULT now()
      )
    `;
    console.log('✓ Created fantasy_pros_refresh_log table');

    // Verify tables were created
    const createdTables = await sql`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name LIKE 'fantasy_pros%'
      ORDER BY table_name
    `;
    console.log('\n📋 Tables now in database:', createdTables.map(t => t.table_name));
    
    if (createdTables.length === 5) {
      console.log('\n✅ All 5 Fantasy Pros tables created successfully!');
    } else {
      console.log(`\n⚠️  Warning: Expected 5 tables, but found ${createdTables.length}`);
    }
  } catch (error) {
    console.error('Error creating tables:', error);
    process.exit(1);
  }
}

createFantasyProsTables();
