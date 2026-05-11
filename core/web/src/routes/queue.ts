import { type RouteObject } from "react-router"

export default {
  index: true,
  lazy: {
    Component: async () => {
      const componentModule = await import("@/pages/Queue")
      return "default" in componentModule ? componentModule.default : componentModule
    }
  }
} as RouteObject
