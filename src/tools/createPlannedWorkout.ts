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
      "Description de la séance. Pour que ce soit une vraie séance structurée avec étapes " +
        "(échauffement, intervalles, récupération avec cibles) — donc aussi une vraie séance " +
        "structurée une fois synchronisée vers Garmin — utilise la syntaxe texte d'Intervals.icu : " +
        "chaque étape est une ligne commençant par '-', avec une durée (ex: 10m, 45s) ou une " +
        "distance (ex: 1km, 400m), suivie d'une cible optionnelle : '%Pace' pour la course à pied " +
        "(ex: '95-100% Pace'), '%FTP' ou '%LTHR' pour le vélo (ex: '105% FTP' ou '90-95% LTHR') — " +
        "PAR DÉFAUT utilise '%LTHR' (zones FC) pour le vélo, car pas de capteur de puissance " +
        "actuellement ; ne bascule sur '%FTP' que si l'utilisateur confirme utiliser un capteur de " +
        "puissance. La notation courte de zone FC seule (ex: 'Z2') a été testée et n'est PAS " +
        "reconnue, ne pas l'utiliser. Pour répéter un bloc, mets une ligne 'Nx' suivie des étapes " +
        "indentées à répéter. Toute ligne qui ne commence pas par '-' et ne matche pas 'Nx' est un " +
        "simple titre de section (libre, ignoré pour le calcul). Exemples validés :\n" +
        "Vélo (FC) : Warmup\n- 10m 60-70% LTHR\n\nMain set\n4x\n- 3m 90-95% LTHR\n- 2m 60% LTHR\n\nCooldown\n- 10m 60% LTHR\n\n" +
        "Vélo (puissance) : Warmup\n- 10m 60-70% FTP\n\nMain set\n4x\n- 3m 105% FTP\n- 2m 55% FTP\n\nCooldown\n- 10m 55% FTP\n\n" +
        "Course à pied : Warmup\n- 10m 60-70% Pace\n\nMain set\n6x\n- 3m 95-100% Pace\n- 2m 60% Pace\n\nCooldown\n- 10m 60% Pace\n\n" +
        "Avec ce format, Intervals.icu calcule automatiquement la durée totale et la charge " +
        "d'entraînement (pas besoin de renseigner planned_duration_minutes/planned_load). " +
        "Laisser vide (ou en prose libre) pour une simple note sans étapes ni cibles.",
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
