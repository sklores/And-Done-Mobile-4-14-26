export function fromSeed(view: string, env?: Record<string, string | undefined>, extra?: Record<string, string>): Promise<unknown>;
export function proxy(view: string): (req: unknown, res: unknown) => Promise<void>;
export function passThrough(req: { url?: string }): Record<string, string>;
