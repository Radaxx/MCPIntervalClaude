import type { Config } from "./config.js";
import type {
  IntervalsActivity,
  IntervalsActivityDetail,
  IntervalsAthlete,
  IntervalsEvent,
  IntervalsIntervalsResponse,
  IntervalsWellnessEntry,
} from "../types/intervals.js";
import {
  IntervalsApiError,
  IntervalsAuthError,
  IntervalsNotFoundError,
  IntervalsRateLimitError,
} from "./errors.js";

const DEFAULT_TIMEOUT_MS = 15_000;

export interface ListActivitiesParams {
  oldest: string;
  newest: string;
  type?: string;
  limit?: number;
}

export interface GetWellnessParams {
  oldest: string;
  newest: string;
}

export interface ListEventsParams {
  oldest: string;
  newest: string;
  category?: string;
}

export interface CreateEventParams {
  date: string;
  type: string;
  name: string;
  description?: string;
  durationSec?: number;
  distanceM?: number;
  load?: number;
}

interface RequestOptions {
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  timeoutMs?: number;
}

/**
 * Client HTTP minimal pour l'API REST Intervals.icu. Authentification HTTP
 * Basic : username fixe "API_KEY", password = clé API personnelle. La clé
 * n'est jamais journalisée, y compris en cas d'erreur (voir
 * handleErrorResponse). Seule createEvent effectue une écriture (POST) ;
 * toutes les autres méthodes sont en lecture seule (GET).
 */
export class IntervalsClient {
  private readonly baseUrl: string;
  private readonly authHeader: string;

  constructor(private readonly config: Config) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    // btoa (plutôt que Buffer) pour rester portable entre Node (stdio) et
    // les runtimes edge sans API Node (Cloudflare Workers).
    this.authHeader = `Basic ${btoa(`API_KEY:${config.apiKey}`)}`;
  }

  get athleteId(): string {
    return this.config.athleteId;
  }

  async getActivities(params: ListActivitiesParams): Promise<IntervalsActivity[]> {
    const activities = await this.get<IntervalsActivity[]>(
      `/athlete/${encodeURIComponent(this.athleteId)}/activities`,
      {
        query: {
          oldest: params.oldest,
          newest: params.newest,
          limit: params.limit,
        },
      },
    );

    const filtered = params.type
      ? activities.filter((a) => a.type === params.type)
      : activities;

    return params.limit ? filtered.slice(0, params.limit) : filtered;
  }

  async getActivity(activityId: string): Promise<IntervalsActivityDetail> {
    return this.get<IntervalsActivityDetail>(`/activity/${encodeURIComponent(activityId)}`);
  }

  async getActivityIntervals(activityId: string): Promise<IntervalsIntervalsResponse> {
    try {
      return await this.get<IntervalsIntervalsResponse>(
        `/activity/${encodeURIComponent(activityId)}/intervals`,
      );
    } catch (err) {
      if (err instanceof IntervalsNotFoundError) {
        // Pas d'intervalles définis pour cette activité : pas une erreur.
        return { icu_intervals: [] };
      }
      throw err;
    }
  }

  async getWellness(params: GetWellnessParams): Promise<IntervalsWellnessEntry[]> {
    return this.get<IntervalsWellnessEntry[]>(
      `/athlete/${encodeURIComponent(this.athleteId)}/wellness`,
      {
        query: { oldest: params.oldest, newest: params.newest },
      },
    );
  }

  async getAthlete(): Promise<IntervalsAthlete> {
    return this.get<IntervalsAthlete>(`/athlete/${encodeURIComponent(this.athleteId)}`);
  }

  async getEvents(params: ListEventsParams): Promise<IntervalsEvent[]> {
    return this.get<IntervalsEvent[]>(
      `/athlete/${encodeURIComponent(this.athleteId)}/events`,
      {
        query: {
          oldest: params.oldest,
          newest: params.newest,
          category: params.category,
        },
      },
    );
  }

  /**
   * Crée une séance planifiée dans le calendrier Intervals.icu (écriture).
   * `description` peut utiliser la syntaxe texte structurée d'Intervals.icu
   * (échauffement/intervalles/récupération avec cibles), auquel cas
   * icu_training_load est généralement calculé automatiquement si non fourni.
   */
  async createEvent(params: CreateEventParams): Promise<IntervalsEvent> {
    return this.post<IntervalsEvent>(`/athlete/${encodeURIComponent(this.athleteId)}/events`, {
      category: "WORKOUT",
      start_date_local: `${params.date}T00:00:00`,
      type: params.type,
      name: params.name,
      description: params.description,
      moving_time: params.durationSec,
      distance: params.distanceM,
      icu_training_load: params.load,
    });
  }

  private async get<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.request<T>(path, "GET", options);
  }

  private async post<T>(path: string, body: unknown, options: RequestOptions = {}): Promise<T> {
    return this.request<T>(path, "POST", { ...options, body });
  }

  private async request<T>(
    path: string,
    method: "GET" | "POST",
    options: RequestOptions = {},
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (options.query) {
      for (const [key, value] of Object.entries(options.query)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: {
          Authorization: this.authHeader,
          Accept: "application/json",
          ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new IntervalsApiError(`Timeout en appelant Intervals.icu (${path})`, 0);
      }
      throw new IntervalsApiError(
        `Erreur réseau en appelant Intervals.icu (${path}): ${
          err instanceof Error ? err.message : String(err)
        }`,
        0,
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      await this.handleErrorResponse(path, response);
    }

    return (await response.json()) as T;
  }

  private async handleErrorResponse(path: string, response: Response): Promise<never> {
    // Ne jamais inclure this.authHeader ou config.apiKey dans les erreurs/logs.
    if (response.status === 401) {
      throw new IntervalsAuthError(await safeReadBody(response));
    }
    if (response.status === 404) {
      throw new IntervalsNotFoundError(path);
    }
    if (response.status === 429) {
      const retryAfter = response.headers.get("Retry-After");
      throw new IntervalsRateLimitError(
        retryAfter ? Number(retryAfter) : undefined,
        await safeReadBody(response),
      );
    }
    throw new IntervalsApiError(
      `Intervals.icu a répondu ${response.status} pour ${path}`,
      response.status,
      await safeReadBody(response),
    );
  }
}

async function safeReadBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}
