export default {
  title: "evergreen-terrace",
  description: "Personal engineering org — agent team, work queue, metrics, and parallel execution for a one-person shop operating at principal scope.",

  navigation: [
    { type: "page", path: "/", title: "Introduction" },
    { type: "page", path: "/getting-started", title: "Getting Started" },
    { type: "page", path: "/architecture", title: "Architecture" },
    {
      type: "group",
      title: "Core Services",
      items: [
        { type: "page", path: "/queue", title: "Work Queue" },
        { type: "page", path: "/metrics", title: "Metrics" },
        { type: "page", path: "/sentinel", title: "Sentinel" },
        { type: "page", path: "/conductor", title: "Conductor" },
        { type: "page", path: "/desktop", title: "Desktop App" },
      ],
    },
    {
      type: "group",
      title: "Agent Team",
      items: [
        { type: "page", path: "/agents", title: "Agents" },
        { type: "page", path: "/skills", title: "Skills" },
      ],
    },
    { type: "page", path: "/integrations", title: "Integrations" },
    { type: "page", path: "/phases", title: "Roadmap" },
  ],

  theme: {
    darkMode: "media",
  },

  output: {
    outDir: "./dist",
  },
};
