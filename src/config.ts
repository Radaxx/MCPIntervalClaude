import { z } from "zod";

const envSchema = z.object({
  INTERVALS_API_KEY: z.string().min(1, "INTERVALS_API_KEY est requis"),
  INTERVALS_ATHLETE_ID: z.string().min(1, "INTERVALS_ATHLETE_ID est requis"),
  INTERVALS_BASE_URL: z.string().url().optional(),
});

export interface Config {
  apiKey: string;
  athleteId: string;
  baseUrl: string;
}

export function loadConfig(): Config {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Configuration invalide. Vérifie ton fichier .env :\n${issues}`,
    );
  }

  return {
    apiKey: parsed.data.INTERVALS_API_KEY,
    athleteId: parsed.data.INTERVALS_ATHLETE_ID,
    baseUrl: parsed.data.INTERVALS_BASE_URL ?? "https://intervals.icu/api/v1",
  };
}
