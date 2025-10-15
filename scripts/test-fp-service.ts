import { db } from "../server/db";
import { fantasyProsNews } from "@shared/schema";
import { refreshNews } from "../server/fantasyProsService";

async function testService() {
  try {
    console.log('Testing Fantasy Pros service...\n');
    
    // Test 1: Check if table exists by querying it
    console.log('Test 1: Checking if fantasy_pros_news table exists...');
    const count = await db.select().from(fantasyProsNews).limit(1);
    console.log('✓ Table exists and is queryable');
    
    // Test 2: Try to refresh news
    console.log('\nTest 2: Attempting to refresh NFL news...');
    const result = await refreshNews('NFL', 10);
    
    if (result.success) {
      console.log(`✓ Successfully refreshed ${result.recordCount} news items`);
    } else {
      console.log(`✗ Failed: ${result.error}`);
    }
    
    process.exit(0);
  } catch (error: any) {
    console.error('✗ Error:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

testService();
