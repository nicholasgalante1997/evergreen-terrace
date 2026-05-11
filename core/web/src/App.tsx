import React from "react"
import { createBrowserRouter } from "react-router"
import DynamicSPA from "./DynamicSPA"
import { RouteSet } from "./routes"

function AppComponent() {
  return <DynamicSPA router={createBrowserRouter([...RouteSet])} />
}

export const App = React.memo(AppComponent)
