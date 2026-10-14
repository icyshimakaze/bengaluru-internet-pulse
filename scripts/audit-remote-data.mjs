import { createClient } from '@libsql/client';
const db = createClient({url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN});
try {
  for (const table of ['items', 'topics', 'ingestion_runs', 'item_enrichments', 'pulse_snapshots']) {
    const count = (await db.execute(`SELECT count(*) AS count FROM ${table}`)).rows[0].count;
    const rows = (await db.execute(`SELECT * FROM ${table} ORDER BY rowid DESC LIMIT 250`)).rows;
    console.info(JSON.stringify({event:'data.audit', phase:process.argv[2], table, count, rows}));
  }
} catch (error) { console.error(JSON.stringify({event:'data.audit_failed', code: /^[A-Z_0-9]+$/.test(error.code ?? '') ? error.code : 'AUDIT_FAILED'})); process.exitCode = 1; }
finally { db.close(); }
