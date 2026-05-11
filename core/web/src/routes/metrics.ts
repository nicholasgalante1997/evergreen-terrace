import { type RouteObject } from "react-router"

export default {
  path: "metrics",
  lazy: {
    Component: async () => {
      const componentModule = await import("@/pages/Metrics")
      return "default" in componentModule ? componentModule.default : componentModule
    }
  }
} as RouteObject
