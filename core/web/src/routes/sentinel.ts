import { type RouteObject } from "react-router"

export default {
  path: "momentum-sentinel",
  lazy: {
    Component: async () => {
      const componentModule = await import("@/pages/Sentinel")
      return "default" in componentModule ? componentModule.default : componentModule
    }
  }
} as RouteObject
