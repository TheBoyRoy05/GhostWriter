import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The server keeps its database at <server dir>/../data, so running a copy gives it a throwaway data/.
const REPO = join(import.meta.dir, "..");
const sandbox = await mkdtemp(join(tmpdir(), "ghostwriter-e2e-"));

for (const dir of ["server", "shared"]) await cp(join(REPO, dir), join(sandbox, dir), { recursive: true });
await mkdir(join(sandbox, "data"));
console.log(`e2e API sandbox ${sandbox}`);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    await rm(sandbox, { recursive: true, force: true });
    process.exit(0);
  });
}

await import(join(sandbox, "server/server.ts"));
