import type { SqlPlaygroundViewProps } from "./types"
import { EXAMPLE_QUERIES } from "./types"

function ResultTable({ columns, rows, rowCount, truncated }: NonNullable<SqlPlaygroundViewProps["result"]>) {
  return (
    <div className="sql-result">
      <div className="sql-result__meta">
        {rowCount.toLocaleString()} row{rowCount !== 1 ? "s" : ""}
        {truncated && <span className="sql-result__truncated"> · truncated at 2,000 — add LIMIT to your query</span>}
      </div>
      <div className="sql-result__scroll">
        <table className="sql-table">
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col}
                  className="sql-table__th"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={i}
                className="sql-table__row"
              >
                {row.map((cell, j) => (
                  <td
                    key={j}
                    className="sql-table__td"
                  >
                    {cell === null ? <span className="sql-null">null</span> : String(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function SqlPlaygroundView({ sql, result, loading, error, onSqlChange, onRun, onClear }: SqlPlaygroundViewProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault()
      onRun()
    }
  }

  return (
    <div className="sql-layout">
      {/* Editor */}
      <div className="sql-editor">
        <textarea
          className="sql-editor__textarea"
          value={sql}
          onChange={(e) => onSqlChange(e.target.value)}
          onKeyDown={handleKeyDown}
          spellCheck={false}
          placeholder="SELECT * FROM events ORDER BY inserted_at DESC LIMIT 100"
        />
        <div className="sql-editor__bar">
          <div className="sql-editor__examples">
            {EXAMPLE_QUERIES.map((q) => (
              <button
                key={q.label}
                className="sql-example-btn"
                onClick={() => onSqlChange(q.sql)}
                title={q.sql}
              >
                {q.label}
              </button>
            ))}
          </div>
          <div className="sql-editor__actions">
            <span className="sql-editor__hint">Ctrl+Enter to run</span>
            {result && (
              <button
                className="btn"
                onClick={onClear}
                disabled={loading}
              >
                Clear
              </button>
            )}
            <button
              className="btn btn--primary"
              onClick={onRun}
              disabled={loading || !sql.trim()}
            >
              {loading ? "Running…" : "Run"}
            </button>
          </div>
        </div>
      </div>

      {/* Output */}
      <div className="sql-output">
        {error && (
          <div className="sql-error">
            <span className="sql-error__label">Error</span>
            <span className="sql-error__msg">{error}</span>
          </div>
        )}
        {!error && !result && !loading && (
          <div className="sql-output__empty">Write a query above and press Run — or click an example to start.</div>
        )}
        {result && result.columns.length === 0 && <div className="sql-output__empty">Query returned no rows.</div>}
        {result && result.columns.length > 0 && <ResultTable {...result} />}
      </div>
    </div>
  )
}
