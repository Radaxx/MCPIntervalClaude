export interface UserRecord {
  passwordHash: string;
  intervalsApiKey: string;
  intervalsAthleteId: string;
  intervalsBaseUrl?: string;
}

export function userKey(username: string): string {
  return `user:${username.trim().toLowerCase()}`;
}

export async function getUser(kv: KVNamespace, username: string): Promise<UserRecord | null> {
  const raw = await kv.get(userKey(username));
  if (!raw) return null;
  return JSON.parse(raw) as UserRecord;
}
