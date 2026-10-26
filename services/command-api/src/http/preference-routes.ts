/** @module Learned-preference routes. */

import { preferenceProposalSchema } from "@evergreen-terrace/contracts"
import type { HttpRoute } from "@evergreen-terrace/service-runtime"
import type { CommandDatabase } from "../persistence/command-database"
import { evidenceErrorResponse } from "./command-route-errors"
import { parseCommandBody } from "./command-route-input"

export const preferenceRoutes = (database: CommandDatabase): HttpRoute[] => [
  {
    handle: async ({ request }) => {
      const input = await parseCommandBody(request, preferenceProposalSchema, "invalid_preference_proposal")
      if (input instanceof Response) {
        return input
      }
      try {
        const result = await database.proposePreference(input)
        return Response.json(result, { status: result.created ? 201 : 200 })
      } catch (error) {
        return evidenceErrorResponse(error, "preference_proposal_failed")
      }
    },
    method: "POST",
    name: "preferences.propose",
    path: "/v1/preferences"
  },
  {
    handle: async ({ url }) =>
      Response.json({
        preferences: await database.listPreferences(
          url.searchParams.get("projectId"),
          url.searchParams.get("promoted") === "true"
        )
      }),
    method: "GET",
    name: "preferences.list",
    path: "/v1/preferences"
  }
]
