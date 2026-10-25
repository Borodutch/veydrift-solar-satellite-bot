import { readFile, stat, unlink, utimes, writeFile } from "node:fs/promises";
import { hostname } from "node:os";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Zero-downtime deploys for a worker that must run on one instance only. Tugport starts the new
 * container next to the old one, so the worker holds a lock file on a volume both containers mount
 * (HANDOVER_LOCK). The new container boots, waits for the lock and starts as soon as the old one
 * releases it on SIGTERM (or stops refreshing it for 10 s, if it died).
 *
 * `stop` ends the work and saves its state; the lock is released right after it. `drain` then waits
 * for anything still running before the exit. Without HANDOVER_LOCK (local runs) it starts right away.
 * Resolves with what `start` returns.
 */
export async function pollWithHandover(start, stop, drain = async () => {}) {
  const lock = process.env.HANDOVER_LOCK;
  // A restarted container keeps its hostname and pid, so it takes its own lock back at once
  const me = `${hostname()} ${process.pid}`;
  const owner = () => readFile(lock, "utf8").catch(() => "");
  let beat;
  if (lock) {
    for (;;) {
      const current = await owner();
      const age = await stat(lock).then((s) => Date.now() - s.mtimeMs, () => Infinity);
      if (!current || current === me || age > 10000) {
        await writeFile(lock, me);
        // Two waiters can write at once; the last write wins
        await sleep(200);
        if ((await owner()) === me) break;
      }
      await sleep(200);
    }
    beat = setInterval(() => {
      const now = new Date();
      utimes(lock, now, now).catch(() => {});
    }, 1000);
    console.log("Holding the handover lock");
  }
  let stopping = false;
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    clearInterval(beat);
    // Tugport kills the old container 30 s after SIGTERM
    await Promise.race([stop(), sleep(10000)]).catch(console.error);
    if (lock && (await owner()) === me) await unlink(lock).catch(() => {});
    await Promise.race([drain(), sleep(15000)]).catch(console.error);
    process.exit(0);
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
  return start();
}
