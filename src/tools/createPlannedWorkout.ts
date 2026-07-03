import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { IntervalsClient } from "../client/intervalsClient.js";
import { toErrorResult, toJsonResult } from "../mcpResult.js";
import { formatDistanceKm, formatDuration } from "../format.js";
import { dateSchema } from "./shared.js";

const inputShape = {
  date: dateSchema.describe("Date de la séance (YYYY-MM-DD)"),
  type: z.string().min(1).describe("Type de sport (ex: Run, Ride, Swim, WeightTraining)"),
  name: z.string().min(1).describe("Titre de la séance"),
  description: z
    .string()
    .optional()
    .describe(
      "Description de la séance. Peut utiliser la syntaxe texte structurée d'Intervals.icu " +
        "(échauffement / intervalles / récupération avec cibles en %FTP, %allure ou %FC) : " +
        "Intervals.icu calcule alors généralement la charge d'entraînement automatiquement. " +
        "Laisser vide pour une simple note.",
    ),
  planned_duration_minutes: z
    .number()
    .positive()
    .optional()
    .describe("Durée prévue en minutes"),
  planned_distance_km: z.number().positive().optional().describe("Distance prévue en km"),
  planned_load: z
    .number()
    .nonnegative()
    .optional()
    .describe(
      "Charge d'entraînement prévue (icu_training_load). Si omis et que la description est " +
        "structurée, Intervals.icu la calcule automatiquement.",
    ),
};

export function registerCreatePlannedWorkout(server: McpServer, client: IntervalsClient): void {
  server.registerTool(
    "create_planned_workout",
    {
      title: "Planifier une séance",
      description:
        "Ajoute une séance planifiée dans le calendrier Intervals.icu. Opération d'écriture : " +
        "crée une nouvelle entrée, ne modifie ni ne supprime rien d'existant.",
      inputSchema: inputShape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({
      date,
      type,
      name,
      description,
      planned_duration_minutes,
      planned_distance_km,
      planned_load,
    }) => {
      try {
        const event = await client.createEvent({
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
