import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { IntervalsClient } from "../client/intervalsClient.js";
import { toErrorResult, toJsonResult } from "../mcpResult.js";

const inputShape = {
  event_id: z.string().min(1).describe("ID de la séance planifiée à supprimer (obtenu via get_planned_workouts)"),
};

export function registerDeletePlannedWorkout(server: McpServer, client: IntervalsClient): void {
  server.registerTool(
    "delete_planned_workout",
    {
      title: "Supprimer une séance planifiée",
      description:
        "Supprime définitivement une séance planifiée du calendrier Intervals.icu. Opération " +
        "d'écriture irréversible : n'affecte que des séances futures/planifiées, jamais des " +
        "activités déjà réalisées.",
      inputSchema: inputShape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ event_id }) => {
      try {
        await client.deleteEvent(event_id);
        return toJsonResult({ deleted: true, id: event_id });
      } catch (err) {
        return toErrorResult(err);
      }
    },
  );
}
