import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { IntervalsClient } from "../client/intervalsClient.js";
import { registerCreatePlannedWorkout } from "./createPlannedWorkout.js";
import { registerDeletePlannedWorkout } from "./deletePlannedWorkout.js";
import { registerGetActivities } from "./getActivities.js";
import { registerGetActivityDetail } from "./getActivityDetail.js";
import { registerGetAthleteProfile } from "./getAthleteProfile.js";
import { registerGetPlannedWorkouts } from "./getPlannedWorkouts.js";
import { registerGetTrainingLoadSummary } from "./getTrainingLoadSummary.js";
import { registerGetWellness } from "./getWellness.js";
import { registerUpdatePlannedWorkout } from "./updatePlannedWorkout.js";

export function registerAllTools(server: McpServer, client: IntervalsClient): void {
  registerGetActivities(server, client);
  registerGetActivityDetail(server, client);
  registerGetWellness(server, client);
  registerGetAthleteProfile(server, client);
  registerGetTrainingLoadSummary(server, client);
  registerGetPlannedWorkouts(server, client);
  registerCreatePlannedWorkout(server, client);
  registerUpdatePlannedWorkout(server, client);
  registerDeletePlannedWorkout(server, client);
}
