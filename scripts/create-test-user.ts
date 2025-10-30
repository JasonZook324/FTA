import { neonConfig, Pool } from "@neondatabase/serverless";
import bcrypt from "bcrypt";
import dotenv from "dotenv";
import ws from "ws";

dotenv.config();

neonConfig.webSocketConstructor = ws;
neonConfig.fetchConnectionCache = true;

async function createTestUser() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL! });

  try {
    console.log("Checking for existing test user...");
    
    const existingUser = await pool.query(
      "SELECT id, username FROM users WHERE username = $1",
      ["testuser"]
    );
    
    if (existingUser.rows.length > 0) {
      console.log("✓ Test user already exists:", existingUser.rows[0]);
      
      // Update password to ensure it's correct
      const hashedPassword = await bcrypt.hash("password123", 10);
      await pool.query(
        "UPDATE users SET password = $1 WHERE username = $2",
        [hashedPassword, "testuser"]
      );
      console.log("✓ Updated test user password");
    } else {
      console.log("Creating new test user...");
      
      const hashedPassword = await bcrypt.hash("password123", 10);
      const result = await pool.query(
        `INSERT INTO users (id, username, password, role) 
         VALUES (gen_random_uuid(), $1, $2, $3) 
         RETURNING id, username, role`,
        ["testuser", hashedPassword, "user"]
      );
      
      console.log("✓ Created test user:", result.rows[0]);
    }
    
    console.log("\n✅ Test user ready!");
    console.log("   Username: testuser");
    console.log("   Password: password123");
  } catch (error: any) {
    console.error("❌ Error:", error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

createTestUser();
