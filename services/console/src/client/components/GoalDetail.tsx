/** @module The fixed goal panel: contract, graph, workers, decisions, validation, and integration evidence. */

import type { GoalView } from "../../read-model/goal-view"
import type { ConsoleValidation } from "../../read-model/read-model.types"
import { DecisionCard } from "./DecisionCard"
import { DependencyGraph, stateTone } from "./DependencyGraph"

const time = (value: string | null | undefined): string => (value ? new Date(value).toLocaleString() : "—")

const ValidationRows = ({ validation }: { validation: ConsoleValidation }) => (
  <table>
    <tbody>
      {validation.results.map((result, index) => (
        <tr key={`${result.command}-${index}`}>
          <td className={`tone-${result.exitCode === 0 && !result.timedOut ? "good" : "bad"}`}>{result.phase}</td>
          <td className="mono">{result.command}</td>
          <td>{result.timedOut ? "timed out" : `exit ${result.exitCode}`}</td>
          <td>{(result.durationMs / 1000).toFixed(1)}s</td>
        </tr>
      ))}
    </tbody>
  </table>
)

export const GoalDetail = ({ onChanged, view }: { onChanged: () => void; view: GoalView }) => {
  const { goal, plan } = view
  const proposal = plan?.proposal ?? null
  const latest = view.integrations.at(-1)
  const validationFor = (id: string | null | undefined) => view.validations.find((validation) => validation.id === id)
  return (
    <section className="goal-detail">
      <header className="goal-header">
        <h2>{goal.title}</h2>
        <p className="muted mono">
          {goal.id} · {goal.priority_class} · base {goal.base_ref} {goal.base_sha.slice(0, 10)} · submitted{" "}
          {time(goal.submitted_at)}
        </p>
        <p>{goal.description}</p>
      </header>

      <div className="panel">
        <h3>
          Plan {plan === null ? "" : `r${plan.revision}`}{" "}
          <span className={`badge tone-${stateTone(plan?.status ?? "idle")}`}>{plan?.status ?? "none"}</span>
        </h3>
        {proposal === null ? (
          <p className="muted">{plan?.detail || "No mayor plan. Draft one with evergreen.plan.draft."}</p>
        ) : (
          <>
            <p>{proposal.summary}</p>
            <div className="columns">
              <div>
                <h4>Acceptance</h4>
                <ul>
                  {proposal.contract.acceptance.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h4>Out of scope</h4>
                <ul>
                  {proposal.contract.outOfScope.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <h4>Risks</h4>
                <ul>
                  {proposal.risks.map((risk) => (
                    <li key={risk.detail}>
                      <span className="badge">{risk.category}</span> {risk.detail}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            {plan?.overlaps.length ? (
              <p className="warning">
                Scope overlaps another active goal:{" "}
                {plan.overlaps
                  .map((overlap) => `${overlap.taskKey} ↔ ${overlap.otherGoalId.slice(0, 8)}/${overlap.otherTaskKey}`)
                  .join("; ")}
              </p>
            ) : null}
          </>
        )}
      </div>

      <div className="panel">
        <h3>Dependency graph</h3>
        <DependencyGraph
          edges={view.edges}
          nodes={view.nodes}
        />
      </div>

      <div className="panel">
        <h3>Workers</h3>
        <table>
          <thead>
            <tr>
              <th>Role</th>
              <th>Task</th>
              <th>State</th>
              <th>Detail</th>
              <th>Branch</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {view.workers.map((worker) => (
              <tr key={worker.id}>
                <td>{worker.role}</td>
                <td className="mono">{view.taskKeys[worker.id] ?? "—"}</td>
                <td className={`tone-${stateTone(worker.state)}`}>{worker.state}</td>
                <td>{worker.state_detail}</td>
                <td className="mono">{worker.worktree.branch}</td>
                <td>{time(worker.updated_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h3>Integration</h3>
        {latest === undefined ? (
          <p className="muted">Not integrated yet.</p>
        ) : (
          view.integrations
            .slice()
            .reverse()
            .map((integration) => (
              <details
                className="integration"
                key={integration.id}
                open={integration.id === latest.id}
              >
                <summary>
                  attempt {integration.attempt}{" "}
                  <span className={`badge tone-${stateTone(integration.status)}`}>{integration.status}</span>{" "}
                  <span className="muted">{integration.completion?.detail}</span>
                </summary>
                {integration.completion === null ? null : (
                  <>
                    <p className="mono">
                      {integration.completion.branch} @ {integration.completion.headSha?.slice(0, 10) ?? "—"}
                      {integration.completion.aggregateDiff === null
                        ? ""
                        : ` · ${integration.completion.aggregateDiff.filesChanged} files +${integration.completion.aggregateDiff.insertions} −${integration.completion.aggregateDiff.deletions}`}
                    </p>
                    {integration.completion.scopeViolations.length > 0 ? (
                      <p className="error">
                        Outside scope claims:{" "}
                        {integration.completion.scopeViolations
                          .map((violation) => `${violation.taskKey}: ${violation.paths.join(", ")}`)
                          .join("; ")}
                      </p>
                    ) : null}
                    {integration.completion.overlaps.length > 0 ? (
                      <p className="warning">
                        Overlapping files: {integration.completion.overlaps.map((overlap) => overlap.path).join(", ")}
                      </p>
                    ) : null}
                    {integration.completion.resolutions.map((resolution) => (
                      <details key={resolution.integratorWorkerId}>
                        <summary>Integrator resolved {resolution.paths.join(", ")}</summary>
                        <pre className="context">{resolution.rationale}</pre>
                      </details>
                    ))}
                    {integration.completion.selection === null ? null : (
                      <p>
                        Excluded {integration.completion.selection.excludedWorkerIds.length} worker(s):{" "}
                        {integration.completion.selection.rationale}
                      </p>
                    )}
                    {(() => {
                      const validation = validationFor(integration.completion.validationId)
                      return validation === undefined ? null : <ValidationRows validation={validation} />
                    })()}
                  </>
                )}
              </details>
            ))
        )}
        {view.handoffs.map((handoff) => (
          <p key={handoff.id}>
            Handoff <span className={`badge tone-${stateTone(handoff.status)}`}>{handoff.status}</span>{" "}
            {handoff.result === null ? (
              handoff.plan.branch
            ) : (
              <a href={handoff.result.pullRequest.url}>PR #{handoff.result.pullRequest.number}</a>
            )}
          </p>
        ))}
      </div>

      <div className="panel">
        <h3>Decisions</h3>
        {view.decisions.length === 0 ? <p className="muted">None.</p> : null}
        {view.decisions
          .slice()
          .reverse()
          .map((decision) => (
            <DecisionCard
              decision={decision}
              key={decision.id}
              onResolved={onChanged}
            />
          ))}
      </div>
    </section>
  )
}
