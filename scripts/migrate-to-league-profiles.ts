import { db } from '../server/db';
import { leagues, leagueProfiles, userLeagues, teams, users } from '@shared/schema';
import { eq, and, sql } from 'drizzle-orm';

async function migrate() {
  try {
    console.log('=== Starting Migration to League Profiles ===\n');
    
    // Step 1: Get all personal leagues and the corresponding league profile
    console.log('Step 1: Mapping personal leagues to league profiles...');
    const personalLeagues = await db.select().from(leagues);
    console.log(`Found ${personalLeagues.length} personal leagues`);
    
    const leagueProfile = await db.select().from(leagueProfiles).where(
      and(
        eq(leagueProfiles.espnLeagueId, '1713644125'),
        eq(leagueProfiles.season, 2025)
      )
    );
    
    if (leagueProfile.length === 0) {
      throw new Error('League profile not found for ESPN league 1713644125');
    }
    
    const profileId = leagueProfile[0].id;
    console.log(`League profile ID: ${profileId}\n`);
    
    // Step 2: Create user_leagues associations for any users who don't have them
    console.log('Step 2: Ensuring all users have user_leagues associations...');
    for (const league of personalLeagues) {
      const existing = await db.select().from(userLeagues).where(
        and(
          eq(userLeagues.userId, league.userId),
          eq(userLeagues.leagueProfileId, profileId)
        )
      );
      
      if (existing.length === 0) {
        console.log(`Creating user_leagues for user ${league.userId}`);
        await db.insert(userLeagues).values({
          userId: league.userId,
          leagueProfileId: profileId,
          role: 'member'
        });
      } else {
        console.log(`User ${league.userId} already has association`);
      }
    }
    console.log('');
    
    // Step 3: Handle teams - keep one set, delete duplicates
    console.log('Step 3: Handling teams - keeping one set, removing duplicates...');
    
    // Check if league profile already has teams
    const profileTeams = await db.select().from(teams).where(eq(teams.leagueId, profileId));
    console.log(`League profile already has ${profileTeams.length} teams`);
    
    if (profileTeams.length === 0 && personalLeagues.length > 0) {
      // Update first personal league's teams to the profile
      const firstLeague = personalLeagues[0];
      await db.execute(sql`
        UPDATE teams 
        SET league_id = ${profileId} 
        WHERE league_id = ${firstLeague.id}
      `);
      console.log(`Migrated teams from ${firstLeague.id} to league profile`);
      
      // Delete teams from other personal leagues (they're duplicates)
      for (let i = 1; i < personalLeagues.length; i++) {
        await db.delete(teams).where(eq(teams.leagueId, personalLeagues[i].id));
        console.log(`Deleted duplicate teams for ${personalLeagues[i].id}`);
      }
    } else {
      // League profile already has teams, delete all personal league teams
      for (const league of personalLeagues) {
        await db.delete(teams).where(eq(teams.leagueId, league.id));
        console.log(`Deleted teams for personal league ${league.id}`);
      }
    }
    console.log('');
    
    // Step 4: Update matchups to reference the league profile (if any)
    console.log('Step 4: Updating matchups to reference league profile...');
    for (const league of personalLeagues) {
      const result = await db.execute(sql`
        UPDATE matchups 
        SET league_id = ${profileId} 
        WHERE league_id = ${league.id}
      `);
      console.log(`Updated matchups for league ${league.id}`);
    }
    console.log('');
    
    // Step 5: Skip players table (doesn't have league_id column)
    console.log('Step 5: Skipping players table (no league_id column)...\n');
    
    // Step 6: Update users' selected_league_id to point to league profile
    console.log('Step 6: Updating users selected_league_id...');
    for (const league of personalLeagues) {
      await db.update(users)
        .set({ selectedLeagueId: profileId })
        .where(eq(users.selectedLeagueId, league.id));
      console.log(`Updated user's selected league from ${league.id} to ${profileId}`);
    }
    console.log('');
    
    // Step 7: Delete personal leagues
    console.log('Step 7: Deleting personal leagues...');
    await db.delete(leagues);
    console.log('All personal leagues deleted\n');
    
    console.log('=== Migration Complete ===');
    console.log('Next steps:');
    console.log('1. Update schema to remove leagues table');
    console.log('2. Update storage layer to use league profiles only');
    console.log('3. Update API routes');
    console.log('4. Update frontend components');
    
    process.exit(0);
  } catch (error) {
    console.error('Migration error:', error);
    process.exit(1);
  }
}

migrate();
