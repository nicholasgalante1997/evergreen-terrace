import type { StorybookConfig } from "@storybook/react-vite"
import { mergeConfig } from "vite"

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-essentials", "@storybook/addon-interactions", "@chromatic-com/storybook"],
  framework: {
    name: "@storybook/react-vite",
    options: {}
  },
  viteFinal: async (cfg) =>
    mergeConfig(cfg, {
      resolve: {
        alias: {
          "@": new URL("../src", import.meta.url).pathname
        }
      }
    })
}

export default config
