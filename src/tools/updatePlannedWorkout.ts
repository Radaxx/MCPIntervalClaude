import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { IntervalsClient } from "../client/intervalsClient.js";
import { toErrorResult, toJsonResult } from "../mcpResult.js";
import { formatDistanceKm, formatDuration } from "../format.js";
import { dateSchema } from "./shared.js";

const inputShape = {
  event_id: z.string().min(1).describe("ID de la séance planifiée à modifier (obtenu via get_planned_workouts)"),
  date: dateSchema.optional().describe("Nouvelle date (YYYY-MM-DD). Omis = inchangée."),
  type: z.string().min(1).optional().describe("Nouveau type de sport (ex: Run, Ride). Omis = inchangé."),
  name: z.string().min(1).optional().describe("Nouveau titre. Omis = inchangé."),
  description: z
    .string()
    .optional()
    .describe(
      "Nouvelle description (même syntaxe structurée que create_planned_workout : %Pace pour la " +
        "course, %LTHR ou %FTP pour le vélo). Omis = inchangée.",
    ),
  planned_duration_minutes: z
    .number()
    .positive()
    .optional()
    .describe("Nouvelle durée prévue en minutes. Omis = inchangée."),
  planned_distance_km: z.number().positive().optional().describe("Nouvelle distance prévue en km. Omis = inchangée."),
  planned_load: z
    .number()
    .nonnegative()
    .optional()
    .describe("Nouvelle charge d'entraînement prévue. Omis = inchangée."),
};

export function registerUpdatePlannedWorkout(server: McpServer, client: IntervalsClient): void {
  server.registerTool(
    "update_planned_workout",
    {
      title: "Modifier une séance planifiée",
      description:
        "Modifie une séance planifiée existante dans le calendrier Intervals.icu. Seuls les " +
        "champs fournis sont changés, les autres restent tels quels. Opération d'écriture.",
      inputSchema: inputShape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({
      event_id,
      date,
      type,
      name,
      description,
      planned_duration_minutes,
      planned_distance_km,
      planned_load,
    }) => {
      try {
        const event = await client.updateEvent(event_id, {
          date,
          type,
          name,
          description,
          durationSec: planned_duration_minutes ? Math.round(planned_duration_minutes * 60) : undefined,
          distanceM: planned_distance_km ? Math.round(planned_distance_km * 1000) : undefined,
          load: planned_load,
        });

        return toJsonResult({
          id: event.id,
          date: event.start_date_local,
          type: event.type,
          name: event.name,
          description: event.description,
          planned_duration: formatDuration(event.moving_time as number | undefined),
          planned_distance_km: formatDistanceKm(event.distance as number | undefined),
          planned_load: event.icu_training_load,
        });
      } catch (err) {
        return toErrorResult(err);
      }
    },
  );
}
