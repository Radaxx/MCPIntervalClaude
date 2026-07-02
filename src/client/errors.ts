export class IntervalsApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = "IntervalsApiError";
  }
}

export class IntervalsAuthError extends IntervalsApiError {
  constructor(body?: unknown) {
    super(
      "Authentification refusée par Intervals.icu (401). Vérifie que INTERVALS_API_KEY est correcte, active, et générée dans Settings > Developer Settings.",
      401,
      body,
    );
    this.name = "IntervalsAuthError";
  }
}

export class IntervalsRateLimitError extends IntervalsApiError {
  constructor(
    public readonly retryAfterSeconds: number | undefined,
    body?: unknown,
  ) {
    super(
      `Limite de requêtes Intervals.icu atteinte (429).${
        retryAfterSeconds ? ` Réessaie dans ${retryAfterSeconds}s.` : " Réessaie plus tard."
      }`,
      429,
      body,
    );
    this.name = "IntervalsRateLimitError";
  }
}

export class IntervalsNotFoundError extends IntervalsApiError {
  constructor(resource: string) {
    super(`Ressource introuvable sur Intervals.icu : ${resource}`, 404);
    this.name = "IntervalsNotFoundError";
  }
}
