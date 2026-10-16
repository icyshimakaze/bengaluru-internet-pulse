import { readDashboard, readTopic } from "@/lib/server/queries";
import { Dashboard } from "@/components/dashboard";
import { chartHistory } from "@/lib/trends/chart-history";
import { pageMetadata, SITE_TITLE, SITE_DESCRIPTION } from "@/lib/server/metadata";
export const dynamic = "force-dynamic";
export const metadata = pageMetadata(SITE_TITLE, SITE_DESCRIPTION, "/");
export default async function HomePage() {
  const pulse = await readDashboard();
  const detail = pulse.topTopics[0] ? await readTopic(pulse.topTopics[0].slug).catch(() => null) : null;
  return <Dashboard initialPulse={pulse} initialDetail={detail ? chartHistory(detail) : null} />;
}
