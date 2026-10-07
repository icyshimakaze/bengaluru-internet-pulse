import { readDashboard } from "@/lib/server/queries";
import { Dashboard } from "@/components/dashboard";
export const dynamic = "force-dynamic";
export default async function HomePage() { return <Dashboard initialPulse={await readDashboard()} />; }
