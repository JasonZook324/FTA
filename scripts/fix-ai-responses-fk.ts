import { neonConfig, Pool } from "@neondatabase/serverless";
import dotenv from "dotenv";
import ws from "ws";

dotenv.config();

// Set WebSocket for local development
neonConfig.webSocketConstructor = ws;
neonConfig.fetchConnectionCache = true;

async function fixForeignKey() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL! });

  try {
    console.log("Fixing ai_prompt_responses foreign key constraint...");
    
    // Drop the old constraint
    await pool.query(`
      ALTER TABLE ai_prompt_responses 
      DROP CONSTRAINT IF EXISTS ai_prompt_responses_league_id_fkey;
    `);
    console.log("✓ Dropped old foreign key constraint");

    // Add new constraint referencing league_profiles
    await pool.query(`
      ALTER TABLE ai_prompt_responses 
      ADD CONSTRAINT ai_prompt_responses_league_id_fkey 
      FOREIGN KEY (league_id) 
      REFERENCES league_profiles(id) 
      ON DELETE SET NULL;
    `);
    console.log("✓ Added new foreign key constraint referencing league_profiles");

    console.log("\n✅ Successfully updated ai_prompt_responses foreign key!");
  } catch (error: any) {
    console.error("❌ Error fixing foreign key:", error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

fixForeignKey();
