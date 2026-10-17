export function ReadingHelp() {
  return <details className="method-detail reading-help"><summary>How to read this</summary>
    <p>Pulse Score (0–100) measures changes between the latest two hours and the preceding two: growth, distinct signals, source channels and recency. It does not measure importance.</p>
    <p>Confidence measures how much sampled evidence supports the grouping: its amount, balance and shared wording. The lead needs two current signals, a positive score and at least 35% confidence. Confidence is not a truth rating.</p>
    <dl><dt>NEW</dt><dd>Isolated or just observed.</dd><dt>EMERGING</dt><dd>Multiple current signals, with no earlier baseline.</dd><dt>RISING</dt><dd>Growing activity with corroboration.</dd><dt>HOT</dt><dd>Strong, recent, corroborated growth.</dd><dt>STABLE</dt><dd>Does not meet another state’s thresholds.</dd><dt>COOLING</dt><dd>Activity has declined or expired.</dd></dl>
  </details>;
}
