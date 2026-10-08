import { useEffect, useState } from "react";

/** A blink every few seconds at an irregular cadence -- alive, not metronomic. */
export function useGizmoBlink({ minMs = 4500, maxMs = 9000, holdMs = 170 } = {}) {
  const [blink, setBlink] = useState(false);
  useEffect(() => {
    let next: ReturnType<typeof setTimeout>, open: ReturnType<typeof setTimeout>;
    const schedule = () => {
      next = setTimeout(() => {
        setBlink(true);
        open = setTimeout(() => { setBlink(false); schedule(); }, holdMs);
      }, minMs + Math.random() * (maxMs - minMs));
    };
    schedule();
    return () => { clearTimeout(next); clearTimeout(open); };
  }, [minMs, maxMs, holdMs]);
  return blink;
}
