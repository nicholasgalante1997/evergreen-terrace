import type { EventsExplorerViewProps, DbEvent } from "./types"
import { EVENT_TYPES } from "./types"

// ── Usage card ────────────────────────────────────────────────────────────────

function UsageCard({ s }: { s: NonNullable<EventsExplorerViewProps["usage"][number]> }) {
  const cost = s.total_cost_usd != null ? `$${s.total_cost_usd.toFixed(4)}` : "—"
  const inTok = s.total_input_tokens?.toLocaleString() ?? "—"
  const outTok = s.total_output_tokens?.toLocaleString() ?? "—"
  const cached = s.total_cached_tokens?.toLocaleString() ?? "—"

  return (
    <div className="ev-usage-card">
      <div className="ev-usage-card__project">{s.project || "(no project)"}</div>
      <div className="ev-usage-card__cost">{cost}</div>
      <div className="ev-usage-card__stats">
        <span>{inTok} in</span>
        <span className="ev-usage-card__sep">·</span>
        <span>{outTok} out</span>
        {s.total_cached_tokens ? (
          <>
            <span className="ev-usage-card__sep">·</span>
            <span className="ev-usage-card__cached">{cached} cached</span>
          </>
        ) : null}
      </div>
      <div className="ev-usage-card__beads">
        {s.bead_count} bead{s.bead_count !== 1 ? "s" : ""}
      </div>
    </div>
  )
}

// ── Event row ─────────────────────────────────────────────────────────────────

const TYPE_CLASS: Record<string, string> = {
  output: "ev-type--output",
  status: "ev-type--status",
  error: "ev-type--error",
  tool_use: "ev-type--tool",
  usage: "ev-type--usage"
}

function EventLogRow({ ev }: { ev: DbEvent }) {
  const typeClass = TYPE_CLASS[ev.type] ?? ""
  const beadShort = ev.bead_id.slice(-8)
  const ts = ev.ts.slice(0, 19).replace("T", " ")

  return (
    <div className="ev-row">
      <span className="ev-row__ts">{ts}</span>
      {ev.project && <span className="ev-row__project">{ev.project}</span>}
      <span
        className="ev-row__bead"
        title={ev.bead_id}
      >
        …{beadShort}
      </span>
      <span className={`ev-row__type ${typeClass}`}>{ev.type}</span>
      <span className="ev-row__content">{ev.content}</span>
    </div>
  )
}

// ── Main view ─────────────────────────────────────────────────────────────────

export function EventsExplorerView({
  events,
  usage,
  loading,
  usageLoading,
  error,
  filter,
  onFilterChange,
  onTypeToggle,
  onQuery,
  onClear
}: EventsExplorerViewProps) {
  return (
    <div className="ev-layout">
      {/* Usage summary */}
      <div className="ev-summary">
        <div className="ev-summary__label">
          Cost &amp; Token Usage
          {usageLoading && <span className="ev-summary__loading"> loading…</span>}
        </div>
        {!usageLoading && usage.length === 0 && (
          <span className="ev-summary__empty">No usage data — run the conductor to see costs.</span>
        )}
        <div className="ev-summary__cards">
          {usage.map((s) => (
            <UsageCard
              key={s.project}
              s={s}
            />
          ))}
        </div>
      </div>

      {/* Filter bar */}
      <div className="ev-filter">
        <div className="ev-filter__row">
          <label className="ev-filter__group">
            <span className="ev-filter__label">Project</span>
            <input
              className="ev-filter__input"
              type="text"
              placeholder="e.g. pokemon-tcg"
              value={filter.project}
              onChange={(e) => onFilterChange({ project: e.target.value })}
            />
          </label>

          <label className="ev-filter__group">
            <span className="ev-filter__label">Bead ID</span>
            <input
              className="ev-filter__input ev-filter__input--mono"
              type="text"
              placeholder="bead-abc-001"
              value={filter.beadId}
              onChange={(e) => onFilterChange({ beadId: e.target.value })}
            />
          </label>

          <label className="ev-filter__group">
            <span className="ev-filter__label">Queue Item</span>
            <input
              className="ev-filter__input ev-filter__input--mono"
              type="text"
              placeholder="uuid"
              value={filter.queueItemId}
              onChange={(e) => onFilterChange({ queueItemId: e.target.value })}
            />
          </label>

          <label className="ev-filter__group">
            <span className="ev-filter__label">Since</span>
            <input
              className="ev-filter__input"
              type="datetime-local"
              value={filter.since}
              onChange={(e) => onFilterChange({ since: e.target.value })}
            />
          </label>

          <label className="ev-filter__group ev-filter__group--narrow">
            <span className="ev-filter__label">Limit</span>
            <input
              className="ev-filter__input ev-filter__input--narrow"
              type="number"
              min={1}
              max={5000}
              value={filter.limit}
              onChange={(e) => onFilterChange({ limit: Number(e.target.value) })}
            />
          </label>
        </div>

        <div className="ev-filter__row ev-filter__row--types">
          <span className="ev-filter__label">Types</span>
          {EVENT_TYPES.map((t) => (
            <button
              key={t}
              className={`ev-type-chip ${filter.types.has(t) ? "ev-type-chip--on" : ""} ${TYPE_CLASS[t] ?? ""}`}
              onClick={() => onTypeToggle(t)}
            >
              {t}
            </button>
          ))}
          <div className="ev-filter__spacer" />
          <button
            className="btn btn--primary"
            onClick={onQuery}
            disabled={loading}
          >
            {loading ? "Querying…" : "Query"}
          </button>
          {events.length > 0 && (
            <button
              className="btn"
              onClick={onClear}
              disabled={loading}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Results */}
      <div className="ev-log">
        {error && <div className="ev-log__error">{error}</div>}

        {!loading && !error && events.length === 0 && (
          <div className="ev-log__empty">Set filters and click Query to inspect the event log.</div>
        )}

        {events.length > 0 && (
          <div className="ev-log__meta">
            {events.length.toLocaleString()} event{events.length !== 1 ? "s" : ""}
          </div>
        )}

        <div className="ev-log__rows">
          {events.map((ev) => (
            <EventLogRow
              key={ev.id}
              ev={ev}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
