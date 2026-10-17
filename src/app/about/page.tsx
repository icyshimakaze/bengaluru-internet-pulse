import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { SourceHealth } from "@/components/source-health";
import { readHealth } from "@/lib/server/queries";
import { pageMetadata } from "@/lib/server/metadata";

export const metadata: Metadata = { title: "Methodology & sources", ...pageMetadata("Methodology & sources | Bengaluru Pulse",
  "How Bengaluru Pulse samples public signals, measures momentum, preserves source evidence and explains uncertainty.", "/about") };

const steps = [
  { title: "Collect", description: "Public signals from news, social conversation and tech discussions." },
  { title: "Normalize", description: "Validate timestamps, preserve provenance and remove repeated evidence." },
  { title: "Group", description: "Match equivalent conversations with AI or a local heuristic." },
  { title: "Score", description: "Measure velocity, volume, diversity and recency with a deterministic engine." },
  { title: "Verify", description: "Every trend links back to its underlying evidence." },
];

export default async function AboutPage() {
  const health = await readHealth();
  return <article className="about-page">
    <Link href="/" className="back-link">← Back to the pulse</Link>
    <div className="eyebrow">Methodology / v2</div>
    <h1>How Bengaluru Pulse works.</h1>
    <p className="about-lead">What is gaining attention across Bengaluru? We measure changes in public conversation and keep the evidence visible.</p>

    <ol className="method-steps" role="list" aria-label="How Bengaluru Pulse works">{steps.map((step, index) => <li key={step.title}>
      <span className="method-step-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
      <div><h2>{step.title}</h2><p>{step.description}</p></div>
    </li>)}</ol>

    <section id="limitations" className="about-limitations" aria-labelledby="limitations-heading">
      <h2 id="limitations-heading">Limits of the picture</h2>
      <p><strong>Bengaluru Pulse is an experimental signal detector.</strong></p>
      <p>It does not measure the opinions of all Bengaluru residents.</p>
      <p>Data availability varies by platform.</p>
      <p>Trend scores measure activity in observed public sources, not objective importance or truth.</p>
    </section>

    <SourceHealth health={health} />

    <section id="demo" aria-labelledby="demo-heading"><h2 id="demo-heading">See it in action</h2>
      <p>A recorded walkthrough of filtering a topic, opening its brief and inspecting the evidence. All data in this recording is fictional; the scoring engine and interface are real.</p>
      <details className="method-detail recorded-demo"><summary>Play the labeled demo</summary>
        <figure><Image src="/demo.gif" alt="Recorded demo showing topic filtering, a topic brief and evidence inspection with fictional data" width={1120} height={760} unoptimized />
          <figcaption>Demo recording · fictional data · close this disclosure to hide the animation.</figcaption>
        </figure>
      </details>
    </section>

    <section><h2>Momentum comes first</h2>
      <p>A topic with eight recent signals after one baseline signal, corroborated across sources, can outrank a familiar topic with 100 signals in each period. Pulse Score measures observed momentum, rather than audience size, importance or factual truth.</p>
      <p>We compare the latest two hours with the preceding two hours. Topics need at least two distinct recent items to enter the ranking. Changing the activity window or source filter selects evidence; it does not change the scoring equation.</p>
    </section>

    <section id="sources"><h2>Three public windows into the city</h2>
      <div className="about-source"><h3>GDELT</h3><p>Public article discovery. Links lead to original articles; timestamps mark discovery by GDELT, which can differ from publication.</p><a href="https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/" target="_blank" rel="noopener noreferrer">DOC 2.0 documentation ↗<span className="sr-only"> (opens in a new tab)</span></a></div>
      <div className="about-source"><h3>Bluesky</h3><p>Public posts from AppView search. Results are sampled and can be incomplete or unavailable. Mentioning a place does not locate the author.</p><a href="https://docs.bsky.app/docs/advanced-guides/api-directory" target="_blank" rel="noopener noreferrer">Public API directory ↗<span className="sr-only"> (opens in a new tab)</span></a></div>
      <div className="about-source"><h3>Hacker News</h3><p>Bengaluru-related stories via Algolia. A technical community&apos;s perspective, with a small and selective audience.</p><a href="https://hn.algolia.com/api" target="_blank" rel="noopener noreferrer">Algolia search API ↗<span className="sr-only"> (opens in a new tab)</span></a></div>
      <p>Public search is a sample, not a census. Private groups and unsampled conversations are outside this view.</p>
      <p>Search caps, indexing delays, language bias, coordinated posts and sparse local evidence affect coverage. Deduplication catches repeated links and matching text, but not every paraphrase. A burst can reflect confusion or disagreement. Follow the original evidence before drawing conclusions.</p>
    </section>

    <section id="scoring"><h2>A score you can inspect</h2>
      <p>Signals are validated, deduplicated and grouped into topics before a deterministic engine calculates each score. Repeated polling never counts as new activity.</p>
      <table className="methodology-table"><caption className="sr-only">Pulse Score weights</caption><thead><tr><th scope="col">Input</th><th scope="col">Weight</th><th scope="col">Measures</th></tr></thead><tbody>
        <tr><td>Velocity</td><td>40%</td><td>Growth between successive two-hour windows</td></tr>
        <tr><td>Volume</td><td>25%</td><td>Distinct recent signals</td></tr>
        <tr><td>Source diversity</td><td>20%</td><td>Contributing providers, out of three</td></tr>
        <tr><td>Recency</td><td>15%</td><td>How recently the latest signal appeared</td></tr>
      </tbody></table>
      <p>Confidence is separate from Pulse Score. It describes the amount, balance and consistency of sampled evidence, not whether a claim is true. A missing source stays missing; it never makes the remaining coverage look stronger.</p>
      <details className="method-detail"><summary>Equations, safeguards & lifecycle thresholds</summary>
        <p>Each input is bounded from zero to one. The weighted sum is multiplied by 100 and rounded. Volume uses a logarithmic scale capped at 20 signals; recency decays exponentially. Ties resolve by velocity, then topic slug. One-source topics are capped at 55, or 35 when evidence is sparse.</p>
        <p>The growth ratio is (current signals + 1) / (previous signals + 1). Velocity is logarithmic and moderated by evidence volume. Without a baseline, velocity is capped at 0.65. Displayed two-hour change uses a minimum baseline of three and an upper bound of 300%; no previous signals is labeled &ldquo;No baseline.&rdquo; Exact counts remain available.</p>
        <p>Lifecycle uses fixed thresholds for NEW, EMERGING, RISING, HOT, STABLE and COOLING. HOT requires six signals, two providers, a score of 75, confidence of 0.65, growth of 1.5 times and evidence within 30 minutes. Falling activity or an expired current window is COOLING. Stages may recur or regress; missing milestones are never inferred.</p>
        <p>Completed collections save versioned scores and counts, including topics below the ranking threshold. Snapshots are retained for 30 days; charts show at most 96 records. Archived v1 scores remain separate from current v2 scores.</p>
      </details>
    </section>

    <section><h2>AI groups. The engine scores.</h2>
      <p>AI may match equivalent topics, classify a category, extract explicit place mentions and describe the evidence. It never assigns scores, trend confidence, lifecycle or rank. Topic matching supports OpenAI, xKiro and a local heuristic. API failures fall back only to the heuristic, and actual processing provenance is recorded. Invalid results remain pending and outside scores.</p>
    </section>

    <section id="locations"><h2>Places mentioned, not people located</h2>
      <p>The map uses explicit neighborhood mentions. Coordinates mark neighborhood centers, not verified incident locations. Citywide and unknown locations stay off the map. The neighborhood list and geographic diagram work even when street map tiles are unavailable.</p>
    </section>

    <section id="live"><h2>Freshness stays visible</h2>
      <p>Collection is scheduled twice an hour. A source is Live for 45 minutes after a successful poll, Delayed up to 90 minutes and Stale after that. A recent failed or partial poll is Degraded while earlier successful coverage remains fresh; a failure without recent success is Error. A successful poll with zero matching results is still Live. These states are independent of the selected activity window and topic matching.</p>
      <p>NOW shows the shortest window with a qualifying topic, or the shortest with collected evidence. Any expansion is labeled; an explicit 2H, 6H or 24H selection stays fixed. Scores always compare the latest two hours with the previous two. Snapshots older than 90 minutes are labeled stale, and scores age against the current time. Collection, enrichment and publication have separate status details. Public page reads never trigger collection.</p>
      <p>DEMO uses fictional, reproducible evidence with the real scoring engine. It is always labeled and never substitutes for missing live data. Original timestamps, source links, coverage gaps and failed reads remain visible.</p>
    </section>

  </article>;
}
