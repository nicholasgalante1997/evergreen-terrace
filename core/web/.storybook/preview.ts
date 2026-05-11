import type { Preview, Decorator } from "@storybook/react"
import "../src/index.css"

const withTheme: Decorator = (Story, context) => {
  const theme = (context.globals as Record<string, string>)["theme"] ?? "dark"
  document.documentElement.dataset["theme"] = theme
  return Story()
}

const preview: Preview = {
  decorators: [withTheme],
  globalTypes: {
    theme: {
      name: "Theme",
      description: "Global theme",
      defaultValue: "dark",
      toolbar: {
        icon: "circlehollow",
        items: [
          { value: "dark",  title: "Dark" },
          { value: "light", title: "Light" },
        ],
        showName: true,
      },
    },
  },
  parameters: {
    backgrounds: { disable: true },
    controls: { matchers: { color: /(background|color)$/i } },
  },
}

export default preview
