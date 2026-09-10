export function fromSeed(view: string, env?: Record<string, string | undefined>, extra?: Record<string, string>): Promise<unknown>;
export function proxy(view: string): (req: unknown, res: unknown, env?: Record<string, string | undefined>) => Promise<void>;
export function passThrough(req: { url?: string }): Record<string, string>;
export function seedEnv(env?: Record<string, string | undefined>): { base: string; key: string; org: string };
