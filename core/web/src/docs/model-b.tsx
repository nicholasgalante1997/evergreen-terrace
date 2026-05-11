export default function ModelBGuide() {
  return (
    <article className="guide">
      <h1 className="guide__title">Model B — Conductor</h1>
      <p className="guide__lead">
        Automated dispatch: the conductor builds a prompt for review, then invokes Claude non-interactively. Output
        streams to the browser in real time.
      </p>

      <section className="guide__section">
        <h2 className="guide__h2">When to use Model B</h2>
        <ul className="guide__list">
          <li>Well-scoped, spec-complete tickets where acceptance criteria are unambiguous</li>
          <li>pm and research tickets — the output is documents, not code changes</li>
          <li>Routine feature work where the approach is clear and the scope is bounded</li>
        </ul>
      </section>

      <section className="guide__section">
        <h2 className="guide__h2">The full flow</h2>
        <ul className="guide__list">
          <li>
            1. Make sure the conductor is running (<code className="guide__code">bun run start</code> includes it)
          </li>
          <li>2. Dispatch a ticket from the dashboard — item moves to Active</li>
          <li>
            3. <strong>Review the prompt</strong> in the right pane (see below)
          </li>
          <li>
            4. Click <strong>Dispatch</strong> — agent runs, output streams in real time
          </li>
          <li>5. For feature/bug/ops: review the git diff, then Approve or Reject</li>
          <li>6. For pm/research: auto-completes when the agent finishes</li>
        </ul>
      </section>

      <section className="guide__section">
        <h2 className="guide__h2">The prompt review panel</h2>
        <p>
          Every dispatched bead passes through a prompt review step before the agent runs. This gives you visibility into
          exactly what the agent will be asked to do.
        </p>
        <ul className="guide__list">
          <li>
            <strong>System prompt</strong> — collapsed by default. Shows character count. Assembled from AGENT.md + skills
            + steering docs + project TOML. Read-only — to change it, edit the source files and re-dispatch.
          </li>
          <li>
            <strong>User prompt</strong> — editable textarea, pre-filled with title + description + acceptance criteria.
            This is what goes to <code className="guide__code">claude -p</code>. Edit freely.
          </li>
        </ul>
        <ul className="guide__list">
          <li>
            Click <strong>Dispatch</strong> to run as-is
          </li>
          <li>
            Edit and click <strong>Dispatch with Edits</strong> to run with your changes
          </li>
          <li>
            Click <strong>Reset</strong> to undo your edits
          </li>
        </ul>
        <div className="guide__callout">
          <div className="guide__callout-label">Critical constraint</div>
          The conductor resolves the project's working directory from the <code className="guide__code">repo</code> field
          in <code className="guide__code">context/projects/{"{project}"}.toml</code>. If this field is missing, the agent
          runs in the wrong directory. Verify the project TOML has a <code className="guide__code">repo</code> field
          before dispatching feature tickets.
        </div>
      </section>

      <section className="guide__section">
        <h2 className="guide__h2">Agent feed event types</h2>
        <table className="guide__table">
          <thead>
            <tr>
              <th>Type</th>
              <th>UI rendering</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code className="guide__code">output</code>
              </td>
              <td>Monospace, secondary color — agent's text narration</td>
            </tr>
            <tr>
              <td>
                <code className="guide__code">status</code>
              </td>
              <td>Highlighted, uppercase — lifecycle transitions</td>
            </tr>
            <tr>
              <td>
                <code className="guide__code">tool_use</code>
              </td>
              <td>Colored badge + path or command — Read (blue), Write/Edit (accent), Bash (red)</td>
            </tr>
            <tr>
              <td>
                <code className="guide__code">error</code>
              </td>
              <td>Red — stderr or execution failures</td>
            </tr>
            <tr>
              <td>
                <code className="guide__code">usage</code>
              </td>
              <td>Sticky footer — tokens in/out, total cost, duration</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="guide__section">
        <h2 className="guide__h2">The code review gate</h2>
        <p>
          Feature, bug, and ops tickets do NOT auto-complete. After the agent finishes, the bead enters{" "}
          <code className="guide__code">review_pending</code> and the feed shows Approve &amp; Complete / Reject.
        </p>
        <p>
          <strong>Before clicking Approve:</strong> open a terminal, cd into the project directory, and review the diff:
        </p>
        <pre className="guide__pre">{`cd ~/dev/.Project-Johto/Pokemon
git diff
git status`}</pre>
        <p>
          If the output looks right, click <strong>Approve &amp; Complete</strong>. If it's wrong, click{" "}
          <strong>Reject</strong> — the bead is marked failed and you can retry or rework manually.
        </p>
        <div className="guide__callout">
          <div className="guide__callout-label">Note</div>
          Approval does not commit. After approving, commit the changes yourself:{" "}
          <code className="guide__code">git add -p && git commit -m "..."</code>
        </div>
      </section>

      <section className="guide__section">
        <h2 className="guide__h2">Ticket type routing</h2>
        <table className="guide__table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Prompt review</th>
              <th>Code review gate</th>
              <th>Auto-complete</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code className="guide__code">feature</code>
              </td>
              <td>Yes</td>
              <td>Yes</td>
              <td>No</td>
            </tr>
            <tr>
              <td>
                <code className="guide__code">bug</code>
              </td>
              <td>Yes</td>
              <td>Yes</td>
              <td>No</td>
            </tr>
            <tr>
              <td>
                <code className="guide__code">ops</code>
              </td>
              <td>Yes</td>
              <td>Yes</td>
              <td>No</td>
            </tr>
            <tr>
              <td>
                <code className="guide__code">pm</code>
              </td>
              <td>Yes</td>
              <td>No</td>
              <td>Yes</td>
            </tr>
            <tr>
              <td>
                <code className="guide__code">research</code>
              </td>
              <td>Yes</td>
              <td>No</td>
              <td>Yes</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="guide__section">
        <h2 className="guide__h2">Bead lifecycle</h2>
        <pre className="guide__pre">{`prompt_pending  ← bead created, prompts being assembled
    ↓ (user clicks Dispatch)
  pending       ← waiting for a free execution slot
    ↓
 in_progress    ← claude -p is running
    ↓
review_pending  ← agent finished (feature/bug/ops only)
    ↓
 completed      ← approved or auto-completed (pm/research)
    ↓
  failed        ← non-zero exit or explicit reject

failed → pending  (retry)`}</pre>
      </section>

      <section className="guide__section">
        <h2 className="guide__h2">Retry flow</h2>
        <p>
          When a bead fails, the Retry button in the agent feed resets it to <code className="guide__code">pending</code>{" "}
          and re-dispatches using the saved prompt files. The prompt review panel is skipped — if you want to re-review
          the prompt, manually delete the bead TOML and re-dispatch from the queue item.
        </p>
      </section>
    </article>
  )
}
