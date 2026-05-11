import { memo } from "react"
import { useLocation, useNavigate } from "react-router"
import { pipeline } from "@/utils/pipeline"
import { HeaderView } from "./View"

function HeaderComponent() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  return (
    <HeaderView
      pathname={pathname}
      onNavigate={navigate}
    />
  )
}

export const Header = pipeline(memo)(HeaderComponent)
