import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

neonConfig.webSocketConstructor = ws;

// Load DATABASE_URL from .env file (Neon database)
let databaseUrl = process.env.DATABASE_URL;

try {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const envConfig = dotenv.parse(fs.readFileSync(envPath));
    if (envConfig.DATABASE_URL) {
      databaseUrl = envConfig.DATABASE_URL;
      console.log('Using DATABASE_URL from .env file');
    }
  }
} catch (error) {
  console.warn('Could not read .env file, using environment variable:', error);
}

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: databaseUrl });
export const db = drizzle({ client: pool, schema });
