import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { IntervalsClient } from "../client/intervalsClient.js";
import { toErrorResult, toJsonResult } from "../mcpResult.js";
import type { IntervalsSportSettings } from "../types/intervals.js";

function summarizeSport(settings: IntervalsSportSettings) {
  return {
    sports: settings.types,
    ftp: settings.ftp,
    lthr: settings.lthr,
    max_hr: settings.max_hr,
    hr_zones: settings.hr_zones,
    hr_zone_names: settings.hr_zone_names,
    pace_zones: settings.pace_zones,
    power_zones: settings.power_zones,
  };
}

export function registerGetAthleteProfile(server: McpServer, client: IntervalsClient): void {
  server.registerTool(
    "get_athlete_profile",
    {
      title: "Profil athlète",
      description:
        "Retourne le profil Intervals.icu de l'athlète : FTP, zones de FC, zones d'allure/puissance par sport, poids, préférences d'unités.",
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async () => {
      try {
        const athlete = await client.getAthlete();
        return toJsonResult({
          name: athlete.name,
          sex: athlete.sex,
          timezone: athlete.timezone,
          units: athlete.measurement_preference,
          weight_kg: athlete.weight,
          resting_hr: athlete.icu_resting_hr,
          sports: (athlete.sportSettings ?? []).map(summarizeSport),
        });
      } catch (err) {
        return toErrorResult(err);
      }
    },
  );
}
