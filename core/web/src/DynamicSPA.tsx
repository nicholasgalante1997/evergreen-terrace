import { createBrowserRouter, RouterProvider } from "react-router"

type BrowserRouterInstance = ReturnType<typeof createBrowserRouter>

interface DynamicSPAProps {
  router: BrowserRouterInstance
}

function DynamicSPA({ router }: DynamicSPAProps) {
  return <RouterProvider router={router} />
}

export default DynamicSPA
