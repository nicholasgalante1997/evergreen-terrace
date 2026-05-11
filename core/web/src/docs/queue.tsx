export default function QueueGuide() {
  return (
    <article className="guide">
      <h1 className="guide__title">The Work Queue</h1>
      <p className="guide__lead">How items flow from inbox to active to completed — and what you do at each stage.</p>

      <section className="guide__section">
        <h2 className="guide__h2">Dashboard layout</h2>
        <p>The Queue tab has up to three panes:</p>
        <ul className="guide__list">
          <li>
            <strong>Left sidebar</strong> — the item list: Inbox (backlog), Active (in-flight), Completed (done)
          </li>
          <li>
            <strong>Center pane</strong> — item detail: title, priority, description, acceptance criteria, links
          </li>
          <li>
            <strong>Right pane</strong> — agent feed: visible when an active or completed item is selected
          </li>
        </ul>
      </section>

      <section className="guide__section">
        <h2 className="guide__h2">Agent feed pane states</h2>
        <table className="guide__table">
          <thead>
            <tr>
              <th>Bead state</th>
              <th>What you see</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code className="guide__code">prompt_pending</code>
              </td>
              <td>Prompt review panel — system prompt (collapsible) + user prompt (editable) + Dispatch button</td>
            </tr>
            <tr>
              <td>
                <code className="guide__code">pending / in_progress</code>
              </td>
              <td>Live event stream: tool calls, output text, status lines</td>
            </tr>
            <tr>
              <td>
                <code className="guide__code">review_pending</code>
              </td>
              <td>Full event log + Approve &amp; Complete / Reject buttons</td>
            </tr>
            <tr>
              <td>
                <code className="guide__code">completed</code>
              </td>
              <td>Final event log with token/cost footer</td>
            </tr>
            <tr>
              <td>
                <code className="guide__code">failed</code>
              </td>
              <td>Event log with error + Retry button</td>
            </tr>
            <tr>
              <td>no session</td>
              <td>"No conductor session" — conductor not running or item not dispatched through it</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="guide__section">
        <h2 className="guide__h2">Creating items</h2>
        <h3 className="guide__h3">Via the PM agent (recommended)</h3>
        <pre className="guide__pre">{`/pm
"I need a ticket for implementing Phase 2 of the foresight analysis engine. The spec is in ~/dev/foresight/specs/."`}</pre>
        <p>
          The PM agent asks clarifying questions (two rounds max), then writes TOML files directly to{" "}
          <code className="guide__code">queue/inbox/</code>. They appear in the web UI immediately.
        </p>
        <h3 className="guide__h3">Manually</h3>
        <p>
          Create a TOML file in <code className="guide__code">queue/inbox/</code> following the schema described in the
          Queue Item Schema guide.
        </p>
      </section>

      <section className="guide__section">
        <h2 className="guide__h2">Item lifecycle</h2>
        <pre className="guide__pre">{`inbox/ → active/ → completed/
         ↑
      (return to inbox)
         ↑
      (reject from review)`}</pre>
        <p>Files move between directories as state changes. The queue server manages this atomically.</p>
      </section>

      <section className="guide__section">
        <h2 className="guide__h2">Priority levels</h2>
        <table className="guide__table">
          <thead>
            <tr>
              <th>Priority</th>
              <th>Meaning</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code className="guide__code">p0</code>
              </td>
              <td>Critical — blocking or production-impacting. Work on this now.</td>
            </tr>
            <tr>
              <td>
                <code className="guide__code">p1</code>
              </td>
              <td>High — important, should be next after any p0s are clear.</td>
            </tr>
            <tr>
              <td>
                <code className="guide__code">p2</code>
              </td>
              <td>Normal — the default level. Standard queue order.</td>
            </tr>
            <tr>
              <td>
                <code className="guide__code">p3</code>
              </td>
              <td>Low — nice to have. Only when nothing higher priority is waiting.</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="guide__section">
        <h2 className="guide__h2">Dispatching</h2>
        <p>
          Select an inbox item, check the agent dropdown (pre-populated from the ticket), change it if needed, then click{" "}
          <strong>Dispatch →</strong>.
        </p>
        <ul className="guide__list">
          <li>
            <strong>Conductor running:</strong> item moves to Active, agent starts working immediately, watch the feed
          </li>
          <li>
            <strong>Conductor not running:</strong> item moves to Active, shows "No conductor session" — work on it
            yourself (see Model A guide)
          </li>
        </ul>
      </section>

      <section className="guide__section">
        <h2 className="guide__h2">Completing items</h2>
        <ul className="guide__list">
          <li>
            <strong>Conductor auto-complete:</strong> pm and research tickets complete automatically when the agent
            finishes
          </li>
          <li>
            <strong>Review gate:</strong> feature, bug, and ops tickets enter{" "}
            <code className="guide__code">review_pending</code> — you must approve or reject after reviewing the git diff
          </li>
          <li>
            <strong>Manual complete:</strong> click <strong>✓ Mark Complete</strong> in the action bar for items worked in
            Model A
          </li>
        </ul>
        <div className="guide__callout">
          <div className="guide__callout-label">Important</div>
          Approval does not commit code. After approving a conductor-completed ticket, review the diff with{" "}
          <code className="guide__code">git diff</code> in the project repo and commit manually.
        </div>
      </section>
    </article>
  )
}
