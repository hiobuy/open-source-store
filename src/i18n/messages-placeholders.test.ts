import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const dir = join(process.cwd(), "messages");
const placeholders = (text: string) =>
  [...new Set(text.match(/\{\{?\s*[\w]+\s*\}?\}/g) ?? [])].sort();

describe("messages placeholders", () => {
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    it(`${file} keeps the same placeholders as its keys`, () => {
      const messages = JSON.parse(readFileSync(join(dir, file), "utf8")) as Record<string, unknown>;
      const mismatches: string[] = [];
      for (const [key, value] of Object.entries(messages)) {
        const expected = placeholders(key);
        if (expected.length === 0 || typeof value !== "string") continue;
        if (JSON.stringify(placeholders(value)) !== JSON.stringify(expected)) {
          mismatches.push(`${key} => ${value}`);
        }
      }
      expect(mismatches).toEqual([]);
    });
  }
});
