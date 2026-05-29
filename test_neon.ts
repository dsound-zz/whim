import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';
dotenv.config();
const sql = neon(process.env.DATABASE_URL!);
sql`SELECT 1`.then(console.log).catch(console.error);
