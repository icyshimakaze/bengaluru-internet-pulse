import Link from "next/link";
import type { Metadata } from "next";
import { pageMetadata } from "@/lib/server/metadata";

export const metadata: Metadata = { title: "Methodology & sources", ...pageMetadata("Methodology & sources | Bengaluru Pulse",
  "How Bengaluru Pulse samples public signals, measures momentum, preserves source evidence and explains uncertainty.", "/about") };

export default function AboutPage() {
  return <article className="about-page">
    <Link href="/" className="back-link">← Back to the pulse</Link>
    <div className="eyebrow">Methodology / v2</div>
    <h1>Momentum, with evidence.</h1>
    <p className="about-lead">What is gaining attention across Bengaluru? We measure changes in public conversation and keep the evidence visible.</p>

    <section><h2>Momentum comes first</h2>
      <p>A topic with eight recent signals after one baseline signal, corroborated across sources, can outrank a familiar topic with 100 signals in each period. Pulse Score measures observed momentum, rather than audience size, importance or factual truth.</p>
      <p>We compare the latest two hours with the preceding two hours. Topics need at least two distinct recent items to enter the ranking. Changing the activity window or source filter selects evidence; it does not change the scoring equation.</p>
    </section>

    <section id="sources"><h2>Three public windows into the city</h2>
      <div className="about-source"><h3>GDELT</h3><p>Public article discovery. Links lead to original articles; timestamps mark discovery by GDELT, which can differ from publication.</p><a href="https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/" target="_blank" rel="noopener noreferrer">DOC 2.0 documentation ↗<span className="sr-only"> (opens in a new tab)</span></a></div>
      <div className="about-source"><h3>Bluesky</h3><p>Public posts from AppView search. Results are sampled and can be incomplete or unavailable. Mentioning a place does not locate the author.</p><a href="https://docs.bsky.app/docs/advanced-guides/api-directory" target="_blank" rel="noopener noreferrer">Public API directory ↗<span className="sr-only"> (opens in a new tab)</span></a></div>
      <div className="about-source"><h3>Hacker News</h3><p>Bengaluru-related stories via Algolia. A technical community&apos;s perspective, with a small and selective audience.</p><a href="https://hn.algolia.com/api" target="_blank" rel="noopener noreferrer">Algolia search API ↗<span className="sr-only"> (opens in a new tab)</span></a></div>
      <p>Public search is a sample, not a census. Private groups and unsampled conversations are outside this view.</p>
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
      <p>AI may match equivalent topics, classify a category, extract explicit place mentions and describe the evidence. It never assigns scores, confidence, lifecycle or rank. Topic matching supports OpenAI, xKiro and a local heuristic. API failures fall back only to the heuristic, and actual processing provenance is recorded. Invalid results remain pending and outside scores.</p>
    </section>

    <section id="locations"><h2>Places mentioned, not people located</h2>
      <p>The map uses explicit neighborhood mentions. Coordinates mark neighborhood centers, not verified incident locations. Citywide and unknown locations stay off the map. The neighborhood list and geographic diagram work even when street map tiles are unavailable.</p>
    </section>

    <section id="live"><h2>Freshness stays visible</h2>
      <p>LIVE requires an actual successful collection within 45 minutes and a fresh, readable snapshot. Collection is scheduled twice an hour; delays and source outages can reduce coverage. Snapshots older than 90 minutes are stale, and rankings age against the current time. Public page reads never trigger collection.</p>
      <p>DEMO uses fictional, reproducible evidence with the real scoring engine. It is always labeled and never substitutes for missing live data. Original timestamps, source links, coverage gaps and failed reads remain visible.</p>
    </section>

    <section><h2>Limits of the picture</h2>
      <p>Search caps, indexing delays, language bias, coordinated posts and sparse local evidence affect coverage. Deduplication catches repeated links and matching text, but not every paraphrase. A burst can reflect confusion or disagreement. Follow the original evidence before drawing conclusions.</p>
    </section>
  </article>;
}
