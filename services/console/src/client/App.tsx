/** @module Console shell: freshness, project and goal navigation, pending cards, and the event stream. */

import { useCallback, useEffect, useMemo, useState } from "react"
import { freshnessLag, goalView, pendingDecisions } from "../read-model/goal-view"
import type { ConsoleSnapshot } from "../read-model/read-model.types"
import { fetchSnapshot } from "./api"
import { DecisionCard } from "./components/DecisionCard"
import { stateTone } from "./components/DependencyGraph"
import { GoalDetail } from "./components/GoalDetail"
import { JarvisPanel } from "./components/JarvisPanel"

const lagText = (lag: number | null): string => {
  if (lag === null) {
    return "projection has applied no events"
  }
  const seconds = Math.max(0, Math.round(lag / 1000))
  return seconds < 60 ? `last event applied ${seconds}s ago` : `last event applied ${Math.round(seconds / 60)}m ago`
}

export const App = () => {
  const [snapshot, setSnapshot] = useState<ConsoleSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [stream, setStream] = useState<"live" | "reconnecting" | "unavailable">("reconnecting")
  const [project, setProject] = useState<string>("")
  const [goalId, setGoalId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setSnapshot(await fetchSnapshot())
      setError(null)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    }
  }, [])

  useEffect(() => {
    void refresh()
    const events = new EventSource("/api/events")
    events.addEventListener("freshness", () => {
      setStream("live")
      void refresh()
    })
    events.addEventListener("unavailable", () => setStream("unavailable"))
    events.onerror = () => setStream("reconnecting")
    return () => events.close()
  }, [refresh])

  const projects = useMemo(() => [...new Set((snapshot?.goals ?? []).map((goal) => goal.project_id))].sort(), [snapshot])
  const goals = useMemo(
    () =>
      (snapshot?.goals ?? [])
        .filter((goal) => project === "" || goal.project_id === project)
        .sort((left, right) => right.submitted_at.localeCompare(left.submitted_at)),
    [project, snapshot]
  )
  const selected = snapshot === null || goalId === null ? null : goalView(snapshot, goalId)
  const pending =
    snapshot === null
      ? []
      : pendingDecisions(snapshot).filter((decision) => project === "" || decision.project_id === project)

  return (
    <div className="shell">
      <header className="topbar">
        <h1>Evergreen Terrace</h1>
        <select
          aria-label="Project"
          onChange={(event) => setProject(event.target.value)}
          value={project}
        >
          <option value="">All projects</option>
          {projects.map((name) => (
            <option
              key={name}
              value={name}
            >
              {name}
            </option>
          ))}
        </select>
        <span
          className={`freshness tone-${stream === "live" ? "good" : "waiting"}`}
          title="Read model watermark"
        >
          {stream} · {snapshot === null ? "loading" : lagText(freshnessLag(snapshot))}
        </span>
        {error === null ? null : <span className="error">{error}</span>}
      </header>
      <nav className="goals">
        <h2>Goals</h2>
        {goals.map((goal) => {
          const plan = snapshot?.plans
            .filter((candidate) => candidate.goalId === goal.id)
            .sort((a, b) => b.revision - a.revision)[0]
          return (
            <button
              className={`goal-link ${goal.id === goalId ? "selected" : ""}`}
              key={goal.id}
              onClick={() => setGoalId(goal.id)}
              type="button"
            >
              <span>{goal.title}</span>
              <span className={`badge tone-${stateTone(plan?.status ?? "idle")}`}>{plan?.status ?? "no plan"}</span>
            </button>
          )
        })}
      </nav>
      <main>
        {pending.length > 0 ? (
          <section className="pending">
            <h2>Waiting on you ({pending.length})</h2>
            {pending.map((decision) => (
              <DecisionCard
                decision={decision}
                key={decision.id}
                onResolved={() => void refresh()}
              />
            ))}
          </section>
        ) : null}
        {selected === null ? (
          <p className="muted">Select a goal.</p>
        ) : (
          <GoalDetail
            onChanged={() => void refresh()}
            view={selected}
          />
        )}
      </main>
      <aside className="events">
        <JarvisPanel
          goalId={selected?.goal.id ?? null}
          goalTitle={selected?.goal.title ?? null}
        />
        <h2>Events</h2>
        <ol>
          {(snapshot?.events ?? []).slice(0, 60).map((event) => (
            <li key={event.eventId}>
              <span className="mono">{new Date(event.occurredAt).toLocaleTimeString()}</span> {event.eventType}{" "}
              <span className="muted">
                {event.aggregateType} {event.aggregateId.slice(0, 8)} #{event.sequence} · {event.actor.kind}
              </span>
            </li>
          ))}
        </ol>
      </aside>
    </div>
  )
}
