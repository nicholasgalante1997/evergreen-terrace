import type { Preview } from "@storybook/react"
import "../src/index.css"

const preview: Preview = {
  parameters: {
    backgrounds: {
      default: "dark",
      values: [
        { name: "dark", value: "#0d1117" },
        { name: "surface", value: "#161b22" }
      ]
    },
    controls: { matchers: { color: /(background|color)$/i } }
  }
}

export default preview
