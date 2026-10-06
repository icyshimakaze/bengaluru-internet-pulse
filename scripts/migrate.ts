import "./env";
import { getDatabase } from "../src/lib/db/client";
import { migrate } from "../src/lib/db/schema";
// A credential-free local migration is the default; explicit remote settings win.
process.env.TURSO_DATABASE_URL ??= "file:.data/pulse.db";
try { const result = await migrate(getDatabase()); console.info(JSON.stringify({ event: "database.migrated", ...result })); }
catch { console.error("Migration failed. Check database configuration and connectivity."); process.exitCode = 1; }
finally { try { getDatabase().close(); } catch { /* No client was initialized. */ } }
