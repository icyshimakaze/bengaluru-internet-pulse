import { SystemStatus } from "@/components/system-status";
import { readDashboard, readHealth } from "@/lib/server/queries";
import { pageMetadata } from "@/lib/server/metadata";
export const metadata = pageMetadata("Status | Bengaluru Pulse", "Actual source collection, enrichment and publication status.", "/status");
export default async function StatusPage() {
  const [pulse, health] = await Promise.all([readDashboard(), readHealth()]);
  return <SystemStatus pulse={pulse} health={health} />;
}
