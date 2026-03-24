import { createRequestHandler } from "@trigger.dev/sdk/v3/next"

export const { GET, POST } = createRequestHandler()

export const dynamic = "force-dynamic"
