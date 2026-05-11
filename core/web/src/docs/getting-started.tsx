export default function GettingStarted() {
  return (
    <article className="guide">
      <h1 className="guide__title">Getting Started</h1>
      <p className="guide__lead">
        Prerequisites, first-time setup, and running the system for the first time.
      </p>

      <section className="guide__section">
        <h2 className="guide__h2">Prerequisites</h2>
        <p>Before you can run anything, verify these are installed and working:</p>
        <ul className="guide__list">
          <li><code className="guide__code">bun</code> ≥ 1.3.13 — check with <code className="guide__code">bun --version</code></li>
          <li><code className="guide__code">claude</code> CLI — check with <code className="guide__code">claude --version</code></li>
          <li><code className="guide__code">ANTHROPIC_API_KEY</code> set in your environment — check with <code className="guide__code">echo $ANTHROPIC_API_KEY</code></li>
          <li><code className="guide__code">mise</code> (optional, recommended) — <code className="guide__code">mise --version</code></li>
        </ul>
        <pre className="guide__pre">{`bun --version
claude --version
echo $ANTHROPIC_API_KEY   # should print your key, not blank`}</pre>
      </section>

      <section className="guide__section">
        <h2 className="guide__h2">First-time setup</h2>
        <pre className="guide__pre">{`cd ~/dev/evergreen-terrace
bun install
cp .env.example .env`}</pre>
        <p>Open <code className="guide__code">.env</code> and set <code className="guide__code">QUEUE_ROOT</code> to the absolute path of this directory:</p>
        <pre className="guide__pre">QUEUE_ROOT=/home/nicks-dgx/dev/evergreen-terrace</pre>
        <p>That is the only required variable. It tells every service where to find the queue, context, and bead state.</p>
      </section>

      <section className="guide__section">
        <h2 className="guide__h2">Starting the system</h2>
        <pre className="guide__pre">{`bun run start
# or, if you have mise:
mise run start`}</pre>
        <p>This builds all services and starts:</p>
        <table className="guide__table">
          <thead>
            <tr>
              <th>Service</th>
              <th>Port</th>
              <th>What it does</th>
            </tr>
          </thead>
          <tbody>
            <tr><td><code className="guide__code">queue-server</code></td><td>2727</td><td>Manages work items</td></tr>
            <tr><td><code className="guide__code">sentinel</code></td><td>2730</td><td>Scores project health, serves reports</td></tr>
            <tr><td><code className="guide__code">metrics</code></td><td>2729</td><td>Collects events, feeds charts</td></tr>
            <tr><td><code className="guide__code">conductor</code></td><td>2731</td><td>Runs agents on dispatched work items</td></tr>
            <tr><td><code className="guide__code">web dashboard</code></td><td>2728</td><td>The UI you're looking at now</td></tr>
          </tbody>
        </table>
        <p>After about 3 seconds, your browser opens automatically to <code className="guide__code">http://localhost:2728</code>.</p>
        <p>To skip the rebuild (faster restart after a pause): <code className="guide__code">bun run start:dev</code></p>
        <p>Press <strong>Ctrl+C</strong> to stop everything cleanly.</p>
      </section>

      <section className="guide__section">
        <h2 className="guide__h2">Accessing the dashboard remotely</h2>
        <p>If you're developing from your laptop over SSH, use the tunnel script to forward all ports to your local machine:</p>
        <pre className="guide__pre">{`# On your laptop:
~/bin/evergreen-tunnel           # uses $EVERGREEN_HOST or the default alias
~/bin/evergreen-tunnel nicks-dgx  # explicit target`}</pre>
        <p>Set up once:</p>
        <pre className="guide__pre">{`scp nicks-dgx:~/dev/evergreen-terrace/scripts/tunnel.sh ~/bin/evergreen-tunnel
chmod +x ~/bin/evergreen-tunnel`}</pre>
        <p>Install <code className="guide__code">autossh</code> for automatic reconnection if the tunnel drops (<code className="guide__code">brew install autossh</code> on macOS).</p>
      </section>

      <section className="guide__section">
        <h2 className="guide__h2">Verifying everything is running</h2>
        <pre className="guide__pre">mise run health</pre>
        <p>This checks which services are responding on their expected ports. All five should be up after <code className="guide__code">bun run start</code>.</p>
      </section>
    </article>
  )
}
