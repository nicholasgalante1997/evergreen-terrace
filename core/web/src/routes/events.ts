import { type RouteObject } from "react-router"

export default {
  path: "events",
  lazy: {
    Component: async () => {
      const m = await import("@/pages/Events")
      return "default" in m ? m.default : m
    }
  }
} as RouteObject
