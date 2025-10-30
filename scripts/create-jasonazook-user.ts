import { db } from "../server/db";
import { users } from "../shared/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcrypt";

async function createJasonazookUser() {
  try {
    console.log("Checking if jasonazook user exists...");
    
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.username, "jasonazook"))
      .limit(1);
    
    if (existing.length > 0) {
      console.log("✓ User 'jasonazook' already exists");
      console.log(`  Role: ${existing[0].role}`);
      return;
    }
    
    console.log("Creating user 'jasonazook'...");
    const hashedPassword = await bcrypt.hash("password123", 10);
    
    const result = await db
      .insert(users)
      .values({
        username: "jasonazook",
        password: hashedPassword,
        role: 2 // Developer role
      })
      .returning();
    
    console.log(`✓ Successfully created user 'jasonazook'`);
    console.log(`  Username: ${result[0].username}`);
    console.log(`  Role: ${result[0].role}`);
    
    process.exit(0);
  } catch (error) {
    console.error("Error creating jasonazook user:", error);
    process.exit(1);
  }
}

createJasonazookUser();
