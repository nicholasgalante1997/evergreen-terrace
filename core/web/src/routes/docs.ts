import type { RouteObject } from "react-router"

const DocsRoute: RouteObject = {
  path: "docs",
  children: [
    {
      index: true,
      lazy: async () => {
        const { default: Component } = await import("@/pages/Docs")
        return { Component }
      },
    },
    {
      path: ":slug",
      lazy: async () => {
        const { default: Component } = await import("@/pages/Docs")
        return { Component }
      },
    },
  ],
}

export default DocsRoute
