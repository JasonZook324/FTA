import { db } from '../server/db';
import { leagues, leagueProfiles, userLeagues, teams } from '@shared/schema';
import { sql } from 'drizzle-orm';

async function checkData() {
  try {
    console.log('=== Checking database state ===\n');
    
    // Count personal leagues
    const personalLeaguesCount = await db.select({ count: sql<number>`count(*)` }).from(leagues);
    console.log(`Personal leagues (leagues table): ${personalLeaguesCount[0]?.count || 0}`);
    
    // Count league profiles
    const profilesCount = await db.select({ count: sql<number>`count(*)` }).from(leagueProfiles);
    console.log(`League profiles: ${profilesCount[0]?.count || 0}`);
    
    // Count user_leagues associations
    const userLeaguesCount = await db.select({ count: sql<number>`count(*)` }).from(userLeagues);
    console.log(`User-league associations: ${userLeaguesCount[0]?.count || 0}\n`);
    
    // Show sample personal leagues
    console.log('=== Sample Personal Leagues ===');
    const sampleLeagues = await db.select({
      id: leagues.id,
      espnLeagueId: leagues.espnLeagueId,
      userId: leagues.userId,
      name: leagues.name,
      season: leagues.season
    }).from(leagues).limit(10);
    
    console.log(JSON.stringify(sampleLeagues, null, 2));
    
    // Show sample league profiles
    console.log('\n=== Sample League Profiles ===');
    const sampleProfiles = await db.select({
      id: leagueProfiles.id,
      espnLeagueId: leagueProfiles.espnLeagueId,
      name: leagueProfiles.name,
      season: leagueProfiles.season
    }).from(leagueProfiles).limit(10);
    
    console.log(JSON.stringify(sampleProfiles, null, 2));
    
    // Check teams table foreign key
    console.log('\n=== Teams Foreign Key Check ===');
    const teamsCount = await db.select({ count: sql<number>`count(*)` }).from(teams);
    console.log(`Total teams: ${teamsCount[0]?.count || 0}`);
    
    const sampleTeams = await db.select({
      id: teams.id,
      leagueId: teams.leagueId,
      name: teams.name
    }).from(teams).limit(5);
    console.log('Sample teams:', JSON.stringify(sampleTeams, null, 2));
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkData();
