export interface SentinelConfig {
  last_run?: string
  mode: "on-demand" | "cron"
  cron_schedule?: string
}

export interface SentinelStatus {
  last_run: string
  mode: string
  next_run: string | null
  run_in_progress: boolean
}
