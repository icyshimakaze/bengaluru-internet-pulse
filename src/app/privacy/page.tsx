import { pageMetadata } from "@/lib/server/metadata";
export const metadata = pageMetadata("Privacy | Bengaluru Pulse", "What this project collects and stores.", "/privacy");
// Draft - not legal advice
export default function PrivacyPage() {
  return <article className="about-page"><h1>Privacy</h1><p>This project has no accounts, sign-in, newsletters or advertising. The application code adds no analytics or tracking cookies.</p>
    <h2>Public evidence</h2><p>Collectors store public titles, short excerpts, original links, source identity, publication or discovery times, collection times and derived topic classifications. Bluesky post identifiers can include public DIDs in original permalinks; author profiles, handles, engagement counts and full article bodies are not collected.</p>
    <h2>Retention</h2><p>Ingestion prunes items older than 14 days and topic/dashboard snapshots and completed ingestion runs older than 30 days. Pruning happens when ingestion runs; these are not guarantees of immediate deletion. Topic records remain while retained evidence or history references them. Source checkpoints retain the latest operational state.</p>
    <h2>Your browser</h2><p>Opening the optional street map requests tiles from OpenStreetMap, which receives normal network information such as your IP address. Source links open their publishers’ sites. The hosting and database providers can process normal service requests and operational logs; this repository does not establish their retention policies.</p>
    <p>Demo evidence is explicitly fictional. See the methodology for source attribution and limitations.</p></article>;
}
