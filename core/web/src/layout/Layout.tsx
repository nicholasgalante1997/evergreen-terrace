import { Outlet } from "react-router"
import { Header } from "@/components/Header"

function Layout() {
  return (
    <div className="app">
      <Header />
      <Outlet />
    </div>
  )
}

export default Layout
