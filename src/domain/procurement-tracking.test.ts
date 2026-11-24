import { describe, expect, it } from "vitest";
import { canTransitionAftersale, receivingProgress } from "./procurement-tracking";
describe("merchant receiving and aftersales", () => {
  it("keeps unallocated and unreceived quantities separate", () => {
    expect(receivingProgress(5, 3, 2)).toEqual({ ordered: 5, allocated: 3, received: 2, unallocated: 2, outstanding: 3, status: "partially_received" });
    expect(receivingProgress(5, 5, 0).status).toBe("not_received");
    expect(receivingProgress(5, 5, 5).status).toBe("fully_received");
    expect(() => receivingProgress(3, 4, 1)).toThrow();
    expect(() => receivingProgress(3, 2, 3)).toThrow();
    expect(() => receivingProgress(3, 2, -1)).toThrow();
    expect(() => receivingProgress(3, 2, 1.5)).toThrow();
  });
  it("allows handling notes and resolution, keeping closed cases immutable", () => {
    expect(canTransitionAftersale("open", "in_progress")).toBe(true);
    expect(canTransitionAftersale("in_progress", "in_progress")).toBe(true);
    expect(canTransitionAftersale("in_progress", "resolved")).toBe(true);
    expect(canTransitionAftersale("open", "cancelled")).toBe(true);
    expect(canTransitionAftersale("in_progress", "open")).toBe(false);
    expect(canTransitionAftersale("resolved", "open")).toBe(false);
    expect(canTransitionAftersale("cancelled", "cancelled")).toBe(false);
  });
});
