import { memo, useState } from "react"
import { pipeline } from "@/utils/pipeline"
import { EventsExplorer } from "@/components/EventsExplorer"
import { SqlPlayground } from "@/components/SqlPlayground"

type Tab = "explorer" | "sql"

function EventsPage() {
  const [tab, setTab] = useState<Tab>("sql")

  return (
    <div className="ev-page">
      <div className="ev-page__tabs">
        <button
          className={`ev-page__tab ${tab === "sql" ? "ev-page__tab--active" : ""}`}
          onClick={() => setTab("sql")}
        >
          SQL
        </button>
        <button
          className={`ev-page__tab ${tab === "explorer" ? "ev-page__tab--active" : ""}`}
          onClick={() => setTab("explorer")}
        >
          Explorer
        </button>
      </div>
      <div className="ev-page__content">{tab === "sql" ? <SqlPlayground /> : <EventsExplorer />}</div>
    </div>
  )
}

export default pipeline(memo)(EventsPage)
