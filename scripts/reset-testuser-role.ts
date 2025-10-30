import { db } from "../server/db";
import { users } from "../shared/schema";
import { eq } from "drizzle-orm";

async function resetTestUserRole() {
  try {
    console.log("Resetting testuser role to 0 (Standard User)...");
    
    const result = await db
      .update(users)
      .set({ role: 0 })
      .where(eq(users.username, "testuser"))
      .returning();
    
    if (result.length > 0) {
      console.log(`✓ Successfully reset testuser role to 0`);
      console.log(`  User: ${result[0].username}`);
      console.log(`  Role: ${result[0].role}`);
    } else {
      console.log("⚠ No user found with username 'testuser'");
    }
    
    process.exit(0);
  } catch (error) {
    console.error("Error resetting testuser role:", error);
    process.exit(1);
  }
}

resetTestUserRole();
