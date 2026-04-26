import { defineConfig } from "@trigger.dev/sdk/v3"

export default defineConfig({
  project: process.env.TRIGGER_PROJECT_ID ?? "proj_lead-hunting-engine",
  dirs: ["./trigger"],
  // maxDuration em segundos — default para todas as tasks
  maxDuration: 300,
  retries: {
    enabledInDev: false,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 30000,
      factor: 2,
    },
  },
})
