import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { NodePostgresSqlClient } from '../packages/runtime-node/index.mjs';

const url = process.env.DATABASE_URL?.trim();
if (!url) throw new Error('DATABASE_URL is required');
const db = new NodePostgresSqlClient(url, { ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized:false } : undefined });
try {
  await db.query(`create table if not exists schema_migrations (filename text primary key, applied_at timestamptz not null default now())`);
  const applied = new Set((await db.query(`select filename from schema_migrations`)).rows.map((row) => row.filename));
  const dir = resolve('db/migrations');
  const files = (await readdir(dir)).filter((name) => /^\d+.*\.sql$/.test(name)).sort();
  for (const filename of files) {
    if (applied.has(filename)) { console.log(`skip ${filename}`); continue; }
    const sql = await readFile(resolve(dir, filename), 'utf8');
    await db.transaction(async (tx) => {
      await tx.query(sql);
      await tx.query(`insert into schema_migrations (filename) values ($1)`, [filename]);
    });
    console.log(`applied ${filename}`);
  }
} finally { await db.close(); }
