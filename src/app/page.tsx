import { readDashboard, readTopic } from "@/lib/server/queries";
import { Dashboard } from "@/components/dashboard";
export const dynamic = "force-dynamic";
export default async function HomePage() {
  const pulse = await readDashboard();
  const detail = pulse.topTopics[0] ? await readTopic(pulse.topTopics[0].slug).catch(() => null) : null;
  return <Dashboard initialPulse={pulse} initialDetail={detail} />;
}
