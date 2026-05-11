import type { RouteObject } from "react-router"
import Layout from "@/layout/Layout"
import MetricsRoute from "./metrics"
import QueueRoute from "./queue"
import SentinelRoute from "./sentinel"
import EventsRoute from "./events"
import DocsRoute from "./docs"

const rootRoute: RouteObject = {
  path: "/",
  Component: Layout,
  children: [QueueRoute, MetricsRoute, SentinelRoute, EventsRoute, DocsRoute]
}

export const RouteSet: RouteObject[] = [rootRoute]
