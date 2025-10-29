import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// In some Windows/dev environments (corporate proxies, custom CAs), TLS
// verification can fail with UNABLE_TO_GET_ISSUER_CERT_LOCALLY when using Neon's
// secure WebSocket connection. As a pragmatic dev-only workaround, disable
// TLS verification in development. Do NOT do this in production.
if (process.env.NODE_ENV === 'development' && !process.env.CI) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  console.warn(
    'Development mode: TLS certificate verification disabled for Neon (NODE_TLS_REJECT_UNAUTHORIZED=0)'
  );
}

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

export const pool = new Pool({ 
  connectionString: databaseUrl,
  max: 10, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 10000, // Return an error after 10 seconds if connection not available
});
export const db = drizzle({ client: pool, schema, logger: true });
