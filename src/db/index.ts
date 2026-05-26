import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

const databaseUrl = process.env.DATABASE_URL || 'postgres://placeholder_for_build@localhost:5432/db';
const sql = neon(databaseUrl);
export const db = drizzle(sql, { schema });
