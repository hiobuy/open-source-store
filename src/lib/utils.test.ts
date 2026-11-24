import { describe, expect, it } from "vitest";

import { cn } from "@/lib/utils";

describe("cn", () => {
  it("merges conflicting utilities and conditional classes", () => {
    expect(cn("px-2 text-sm", { "font-bold": true }, false, "px-4")).toBe(
      "text-sm font-bold px-4",
    );
  });
});
