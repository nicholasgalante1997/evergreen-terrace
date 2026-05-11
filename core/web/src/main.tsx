import "@fontsource/dm-sans/400.css"
import "@fontsource/dm-sans/500.css"
import "@fontsource/dm-sans/600.css"
import "@fontsource/dm-sans/700.css"
import "@fontsource/geist-mono/400.css"
import "./index.css"
import React from "react"
import { createRoot } from "react-dom/client"
import { App } from "./App"

const root = document.getElementById("root")
if (!root) throw new Error("no #root element")
createRoot(root).render(<App />)
