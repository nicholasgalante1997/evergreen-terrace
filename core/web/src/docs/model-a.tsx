export default function ModelAGuide() {
  return (
    <article className="guide">
      <h1 className="guide__title">Model A — Interactive</h1>
      <p className="guide__lead">
        You and Claude Code, with queue items as structured briefs. Nothing runs automatically — you are the execution layer.
      </p>

      <section className="guide__section">
        <h2 className="guide__h2">When to use Model A</h2>
        <ul className="guide__list">
          <li><strong>Scope will shift</strong> — acceptance criteria are a starting point; you need to redirect mid-session as the implementation reveals itself</li>
          <li><strong>Architecture decisions involved</strong> — the right approach isn't clear until you see the existing code; needs a conversation, not a one-shot invocation</li>
          <li><strong>Multiple files across multiple repos</strong> — the conductor runs in one project directory; cross-cutting work belongs in Model A</li>
          <li><strong>You want to understand the output</strong> — working interactively means you understand every decision made</li>
        </ul>
      </section>

      <section className="guide__section">
        <h2 className="guide__h2">Step-by-step</h2>
        <ul className="guide__list">
          <li>1. Open the web UI and select the highest-priority inbox item</li>
          <li>2. Read the <strong>description</strong> and <strong>acceptance criteria</strong> in the detail pane</li>
          <li>3. Note the <code className="guide__code">links</code> field — these are context files to load first</li>
          <li>4. Click <strong>Dispatch →</strong> (records intent, moves item to Active)</li>
          <li>5. Open Claude Code in the project's repository — not in evergreen-terrace</li>
        </ul>
        <pre className="guide__pre">{`# Example for a deckvault feature ticket:
cd ~/dev/.Project-Johto/Pokemon
claude`}</pre>
        <ul className="guide__list">
          <li>6. Start the session by giving Claude the ticket context:</li>
        </ul>
        <pre className="guide__pre">{`I'm working on this ticket:

TITLE: [paste title]

DESCRIPTION:
[paste description block]

ACCEPTANCE CRITERIA:
[paste acceptance block]

LINKS / CONTEXT FILES:
[paste links]

Let's start by reading the relevant source files.`}</pre>
        <ul className="guide__list">
          <li>7. Work through the acceptance criteria interactively</li>
          <li>8. When done: return to the web UI, select the active item, click <strong>✓ Mark Complete</strong></li>
        </ul>
      </section>

      <section className="guide__section">
        <h2 className="guide__h2">Using the ticket as a brief</h2>
        <table className="guide__table">
          <thead>
            <tr><th>Field</th><th>What it provides</th></tr>
          </thead>
          <tbody>
            <tr><td><code className="guide__code">description</code></td><td>Background, current state, why this work exists</td></tr>
            <tr><td><code className="guide__code">acceptance</code></td><td>Exit criteria — what done looks like</td></tr>
            <tr><td><code className="guide__code">links</code></td><td>Context files, specs, related code to load first</td></tr>
            <tr><td><code className="guide__code">delegation.agent</code></td><td>The intended role — which AGENT.md to reference for tone/approach</td></tr>
            <tr><td><code className="guide__code">item.project</code></td><td>Which repo to cd into</td></tr>
          </tbody>
        </table>
      </section>

      <section className="guide__section">
        <h2 className="guide__h2">After the session</h2>
        <p>If the session materially changes the project's state, update <code className="guide__code">context/projects/{"{project}"}.toml</code>:</p>
        <ul className="guide__list">
          <li><code className="guide__code">last_touched</code> → today's date</li>
          <li><code className="guide__code">notes.context</code> → any new architectural facts</li>
          <li><code className="guide__code">notes.next_action</code> → what the next session should start from</li>
          <li><code className="guide__code">status.phase</code> → if the phase changed</li>
        </ul>
        <p>The sentinel scores context_freshness — stale TOMLs drag scores down and produce inaccurate reports.</p>
      </section>
    </article>
  )
}
