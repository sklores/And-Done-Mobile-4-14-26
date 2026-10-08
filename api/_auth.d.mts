export function requireSession(req: unknown, res: unknown, env?: Record<string, string | undefined>): boolean;
export function hasSession(req: unknown, env?: Record<string, string | undefined>): boolean;
export function sessionCookie(env?: Record<string, string | undefined>): string;
export function clearCookie(): string;
export function readJson(req: unknown): Promise<Record<string, unknown>>;
