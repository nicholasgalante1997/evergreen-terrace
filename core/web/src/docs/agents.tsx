export default function AgentsGuide() {
  return (
    <article className="guide">
      <h1 className="guide__title">Agent Roles</h1>
      <p className="guide__lead">
        Eight role-scoped agents, each with a specific purpose, model, and toolset. Select the right agent for the ticket type.
      </p>

      <section className="guide__section">
        <h2 className="guide__h2">Available agents</h2>
        <table className="guide__table">
          <thead>
            <tr>
              <th>Role</th>
              <th>Model</th>
              <th>Purpose</th>
              <th>When to use</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><code className="guide__code">pm</code></td>
              <td>sonnet-4-6</td>
              <td>PRD generation, queue item authoring, backlog grooming</td>
              <td>Creating well-specified tickets from rough ideas</td>
            </tr>
            <tr>
              <td><code className="guide__code">eng-senior</code></td>
              <td>opus-4-7</td>
              <td>Architecture decisions, PR review, ADR authoring</td>
              <td>Complex cross-cutting decisions</td>
            </tr>
            <tr>
              <td><code className="guide__code">eng-mid</code></td>
              <td>sonnet-4-6</td>
              <td>Feature implementation from spec</td>
              <td>Standard feature and bug tickets with clear specs</td>
            </tr>
            <tr>
              <td><code className="guide__code">eng-junior</code></td>
              <td>sonnet-4-6</td>
              <td>Boilerplate, tests, scaffolding</td>
              <td>Mechanical, repetitive implementation work</td>
            </tr>
            <tr>
              <td><code className="guide__code">voice</code></td>
              <td>sonnet-4-6</td>
              <td>Rewrites output in Nick's register</td>
              <td>Polishing external-facing content</td>
            </tr>
            <tr>
              <td><code className="guide__code">stakeholder</code></td>
              <td>sonnet-4-6</td>
              <td>Status updates in business language</td>
              <td>Communications to non-technical audiences</td>
            </tr>
            <tr>
              <td><code className="guide__code">director</code></td>
              <td>sonnet-4-6</td>
              <td>Scope pressure, prioritization challenge</td>
              <td>Stress-testing plans before committing</td>
            </tr>
            <tr>
              <td><code className="guide__code">momentum-sentinel</code></td>
              <td>sonnet-4-6</td>
              <td>Cross-project health scoring</td>
              <td>Weekly momentum runs</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="guide__section">
        <h2 className="guide__h2">Selecting an agent via the dashboard</h2>
        <p>When you dispatch a ticket, the agent dropdown is pre-populated with the agent the PM chose when creating the ticket. You can change it before dispatching. The dropdown lists all agents by role name.</p>
        <p>The system prompt assembled by the conductor differs per agent — each AGENT.md has different instructions, tools, and skill references appropriate to its role.</p>
      </section>

      <section className="guide__section">
        <h2 className="guide__h2">Ticket types and suitable agents</h2>
        <table className="guide__table">
          <thead>
            <tr><th>Ticket type</th><th>Suitable agents</th></tr>
          </thead>
          <tbody>
            <tr><td><code className="guide__code">feature</code></td><td>eng-senior, eng-mid, eng-junior</td></tr>
            <tr><td><code className="guide__code">bug</code></td><td>eng-senior, eng-mid</td></tr>
            <tr><td><code className="guide__code">research</code></td><td>eng-senior, pm</td></tr>
            <tr><td><code className="guide__code">design</code></td><td>eng-senior</td></tr>
            <tr><td><code className="guide__code">pm</code></td><td>pm</td></tr>
            <tr><td><code className="guide__code">ops</code></td><td>eng-senior, eng-mid</td></tr>
          </tbody>
        </table>
      </section>

      <section className="guide__section">
        <h2 className="guide__h2">Agent configuration</h2>
        <p>Agent definitions live in <code className="guide__code">agents/{"{role}"}/</code>. Each has:</p>
        <ul className="guide__list">
          <li><code className="guide__code">AGENT.md</code> — full instructions for that role</li>
          <li><code className="guide__code">agent.json</code> — conductor config: model, allowed tools, skills, steering refs</li>
        </ul>
        <p>Changes are pushed to <code className="guide__code">~/.claude/agents/</code> via <code className="guide__code">bun run sync-agents</code>, which also runs automatically via a PostToolUse hook when you edit agent files in Claude Code.</p>
      </section>
    </article>
  )
}
