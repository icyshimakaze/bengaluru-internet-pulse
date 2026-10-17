import { pageMetadata } from "@/lib/server/metadata";
export const metadata = pageMetadata("Terms | Bengaluru Pulse", "Use and limitations of this experimental public-signal project.", "/terms");
// Draft - not legal advice
export default function TermsPage() {
  return <article className="about-page"><h1>Terms</h1><p>Bengaluru Pulse is an experimental portfolio project. Scores describe momentum in sampled public evidence. They do not establish truth, importance, public opinion or verified incident locations.</p>
    <h2>Sources and attribution</h2><p>Titles, short excerpts and links retain their source attribution. Original articles and posts belong to their respective publishers and authors; this project does not grant rights to reuse their content. Follow original links and review the source before relying on a claim.</p>
    <h2>Availability and limitations</h2><p>Collection can be incomplete, stale or unavailable. Grouping, categories, script-based language hints and neighborhood matches can be wrong. Demo fixtures are fictional. No uptime, accuracy or completeness guarantee is made.</p>
    <p>The application has no accounts, payments or subscription service. Its code license does not license third-party evidence, fonts or map data; their respective terms apply.</p></article>;
}
