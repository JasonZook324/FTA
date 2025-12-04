import { db } from '../server/db';
import { sql } from 'drizzle-orm';

async function checkUnmatched() {
  console.log('=== Checking Known Players for Mismatches ===\n');
  
  const names = ['Aaron Jones', 'Adam Thielen', 'Amari Cooper', 'Anthony Richardson', 'Brandin Cooks', 'Brian Robinson', 'AJ Dillon'];
  
  for (const name of names) {
    console.log('\n--- ' + name + ' ---');
    
    const espn = await db.execute(sql`
      SELECT full_name, team, position FROM espn_player_data 
      WHERE sport = 'NFL' AND season = 2024 
      AND UPPER(full_name) LIKE UPPER(${`%${name}%`})
    `);
    const fpAll = await db.execute(sql`
      SELECT full_name, team, position FROM fp_player_data 
      WHERE sport = 'NFL' AND season = 2024 
      AND UPPER(full_name) LIKE UPPER(${`%${name}%`})
    `);
    
    console.log('ESPN:', espn.rows.length > 0 ? (espn.rows as any[]).map((r: any) => r.full_name + ' (' + r.team + ' ' + r.position + ')').join(', ') : 'NOT FOUND');
    console.log('FP:', fpAll.rows.length > 0 ? (fpAll.rows as any[]).map((r: any) => r.full_name + ' (' + r.team + ' ' + r.position + ')').join(', ') : 'NOT FOUND');
  }
  
  console.log('\n\n=== Summary Stats ===');
  const stats = await db.execute(sql`
    SELECT 
      (SELECT COUNT(*) FROM espn_player_data WHERE sport = 'NFL' AND season = 2024) as espn_count,
      (SELECT COUNT(*) FROM fp_player_data WHERE sport = 'NFL' AND season = 2024) as fp_count,
      (SELECT COUNT(*) FROM player_crosswalk WHERE sport = 'NFL' AND season = 2024 AND match_confidence = 'exact') as matched,
      (SELECT COUNT(*) FROM player_crosswalk WHERE sport = 'NFL' AND season = 2024 AND match_confidence = 'unmatched') as unmatched
  `);
  console.log('ESPN players:', (stats.rows[0] as any).espn_count);
  console.log('FP players:', (stats.rows[0] as any).fp_count);
  console.log('Matched:', (stats.rows[0] as any).matched);
  console.log('Unmatched:', (stats.rows[0] as any).unmatched);
  
  process.exit(0);
}

checkUnmatched().catch(e => { console.error(e); process.exit(1); });
