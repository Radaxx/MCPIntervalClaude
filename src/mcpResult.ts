import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { IntervalsApiError } from "./client/errors.js";

export function toJsonResult(data: unknown): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

export function toErrorResult(err: unknown): CallToolResult {
  if (err instanceof IntervalsApiError) {
    return {
      content: [{ type: "text", text: err.message }],
      isError: true,
    };
  }
  if (err instanceof Error) {
    return {
      content: [{ type: "text", text: `Erreur inattendue : ${err.message}` }],
      isError: true,
    };
  }
  return {
    content: [{ type: "text", text: "Erreur inattendue inconnue." }],
    isError: true,
  };
}
