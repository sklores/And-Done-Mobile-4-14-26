export function fromSeed(view: string, env?: Record<string, string | undefined>): Promise<unknown>;
export function proxy(view: string): (req: unknown, res: unknown) => Promise<void>;
