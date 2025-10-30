import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Read DATABASE_URL from .env file
const envPath = path.join(process.cwd(), '.env');
const envConfig = dotenv.parse(fs.readFileSync(envPath));
const databaseUrl = envConfig.DATABASE_URL;

if (!databaseUrl) {
  console.error('DATABASE_URL not found in .env file');
  process.exit(1);
}

const sql = neon(databaseUrl);

async function createTable() {
  try {
    console.log('Creating ai_prompt_responses table...');
    
    await sql`
      CREATE TABLE IF NOT EXISTS ai_prompt_responses (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        league_id VARCHAR REFERENCES leagues(id) ON DELETE SET NULL,
        team_id INTEGER,
        prompt_text TEXT NOT NULL,
        prompt_options JSONB,
        response_text TEXT NOT NULL,
        ai_model TEXT NOT NULL,
        ai_provider TEXT NOT NULL DEFAULT 'openai',
        tokens_used INTEGER,
        response_time INTEGER,
        status TEXT NOT NULL DEFAULT 'success',
        error_message TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;
    
    console.log('✓ Table created successfully');
    
    // Create indexes
    console.log('Creating indexes...');
    
    await sql`
      CREATE INDEX IF NOT EXISTS ai_responses_user_id_idx ON ai_prompt_responses(user_id)
    `;
    
    await sql`
      CREATE INDEX IF NOT EXISTS ai_responses_created_at_idx ON ai_prompt_responses(created_at)
    `;
    
    console.log('✓ Indexes created successfully');
    console.log('✓ Database schema update complete!');
    
  } catch (error) {
    console.error('Error creating table:', error);
    process.exit(1);
  }
}

createTable();
