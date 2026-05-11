export default function SentinelGuide() {
  return (
    <article className="guide">
      <h1 className="guide__title">Running the Sentinel</h1>
      <p className="guide__lead">
        The sentinel scores all active projects on momentum and health, then ranks them by urgency. Run it weekly.
      </p>

      <section className="guide__section">
        <h2 className="guide__h2">What the sentinel does</h2>
        <p>A sentinel run is a Claude Code session pre-loaded with the momentum-sentinel agent's system prompt. It:</p>
        <ul className="guide__list">
          <li>Reads <code className="guide__code">context/global.toml</code> for priority ordering</li>
          <li>Reads all <code className="guide__code">context/projects/*.toml</code> for project state</li>
          <li>Reads <code className="guide__code">queue/inbox/</code> and <code className="guide__code">queue/active/</code> for queue state</li>
          <li>Runs <code className="guide__code">git log</code> for each project repo to check actual activity</li>
          <li>Scores each project on four dimensions (0–100)</li>
          <li>Writes a ranked report to the Sentinel tab</li>
        </ul>
      </section>

      <section className="guide__section">
        <h2 className="guide__h2">Running it</h2>
        <h3 className="guide__h3">From the web dashboard</h3>
        <p>Go to the Sentinel tab → click <strong>Run Now</strong>. Output appears in the report area as it writes.</p>
        <h3 className="guide__h3">From the terminal</h3>
        <pre className="guide__pre">mise run sentinel-run</pre>
        <h3 className="guide__h3">From a Claude Code session</h3>
        <pre className="guide__pre">{`claude  # then: /momentum-sentinel`}</pre>
      </section>

      <section className="guide__section">
        <h2 className="guide__h2">Reading the report</h2>
        <p>Projects are ranked from most urgent to healthiest. Each has a score and 2–3 sentences of context.</p>
        <table className="guide__table">
          <thead>
            <tr><th>Score range</th><th>Status</th></tr>
          </thead>
          <tbody>
            <tr><td>0–49</td><td>Stale — needs attention</td></tr>
            <tr><td>50–74</td><td>At-risk — monitor closely</td></tr>
            <tr><td>75–100</td><td>Healthy — on track</td></tr>
          </tbody>
        </table>
        <p>Pay attention to <strong>MISALIGNMENT</strong> flags — these indicate a p0 or p1 project with no commits in 14+ days. That means either the project has been quietly abandoned or it's being worked on without commits (both are problems).</p>
      </section>

      <section className="guide__section">
        <h2 className="guide__h2">After the run</h2>
        <p>The sentinel writes updated <code className="guide__code">health</code> scores to each project TOML. It does NOT change <code className="guide__code">priority</code> — that's yours to set.</p>
        <div className="guide__callout">
          <div className="guide__callout-label">Do not</div>
          Do not change priority manually based on the sentinel score alone. The score reflects momentum, not importance. A healthy p3 project and a stale p3 project are still both p3. Reassess priority through the queue, not the score.
        </div>
        <p>If a project's context has changed (different phase, new architecture decisions), update its TOML manually — the sentinel cannot infer context changes from git history alone.</p>
      </section>
    </article>
  )
}
