import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const sessionOwner = "lib/serverRelaySession.ts";

function productionTypescriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return productionTypescriptFiles(path);
    if (extname(path) !== ".ts" || path.endsWith(".test.ts")) return [];
    return [path];
  });
}

describe("Wired server relay access boundary", () => {
  it("keeps low-level relay connection and subscription ownership in the finite session", () => {
    const violations = ["lib", "api", "scripts"]
      .flatMap((directory) =>
        productionTypescriptFiles(join(repositoryRoot, directory)),
      )
      .map((path) => ({
        path: relative(repositoryRoot, path),
        source: readFileSync(path, "utf8"),
      }))
      .filter(({ path }) => path !== sessionOwner)
      .filter(
        ({ source }) =>
          /\bRelay\.connect\s*\(/.test(source) ||
          /\.subscribe\s*\(/.test(source) ||
          /import\s*{[^}]*\bRelay\b[^}]*}\s*from\s*["']nostr-tools["']/.test(
            source,
          ),
      )
      .map(({ path }) => path);

    expect(violations).toEqual([]);
  });
});
