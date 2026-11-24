import { describe, expect, it } from "vitest";
import {
  convertCnyFenToTargetMinor,
  convertTargetMinorToCnyFen,
  formatMinor,
} from "./currency";

const USD_UNITS = 14705882;

describe("currency conversion", () => {
  it("converts CNY fen to target minor units with round-half-up", () => {
    expect(convertCnyFenToTargetMinor(100, USD_UNITS)).toBe(15);
    expect(convertCnyFenToTargetMinor(1999, USD_UNITS)).toBe(294);
    expect(convertCnyFenToTargetMinor(68000, USD_UNITS)).toBe(10000);
    expect(convertCnyFenToTargetMinor(0, USD_UNITS)).toBe(0);
  });

  it("matches exact BigInt arithmetic for large amounts", () => {
    const fen = 999999999999;
    const expected = Number(
      (BigInt(fen) * BigInt(USD_UNITS) + BigInt(50000000)) / BigInt(100000000),
    );
    expect(convertCnyFenToTargetMinor(fen, USD_UNITS)).toBe(expected);
  });

  it("handles negative amounts symmetrically", () => {
    for (const fen of [1, 100, 1999, 68000, 999999999999]) {
      const positive = convertCnyFenToTargetMinor(fen, USD_UNITS);
      const expected = positive === 0 ? 0 : -positive;
      expect(convertCnyFenToTargetMinor(-fen, USD_UNITS)).toBe(expected);
    }
  });

  it("keeps identity when unitsPerCnyE8 is 1e8", () => {
    expect(convertCnyFenToTargetMinor(123456, 100000000)).toBe(123456);
    expect(convertTargetMinorToCnyFen(123456, 100000000)).toBe(123456);
  });

  it("estimates the inverse conversion", () => {
    expect(convertTargetMinorToCnyFen(10000, USD_UNITS)).toBe(68000);
    expect(convertTargetMinorToCnyFen(-10000, USD_UNITS)).toBe(-68000);
  });

  it("formats minor units", () => {
    expect(formatMinor(1234)).toBe("12.34");
    expect(formatMinor(-5)).toBe("-0.05");
    expect(formatMinor(100, 0)).toBe("1");
  });
});
