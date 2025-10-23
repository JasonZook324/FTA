import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

dotenv.config();

async function checkTables() {
  const sql = neon(process.env.DATABASE_URL!);
  
  const tables = await sql`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name LIKE 'fantasy_pros%' 
    ORDER BY table_name
  `;
  
  console.log('Fantasy Pros tables in Neon:');
  tables.forEach(t => console.log('  -', t.table_name));
  console.log('\nTotal:', tables.length, 'tables');
}

checkTables();
