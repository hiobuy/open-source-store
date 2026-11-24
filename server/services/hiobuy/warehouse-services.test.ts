import { afterEach, expect, it, vi } from "vitest";
import { readWarehouseCatalog, warehouseUnavailable } from "./warehouse-services";

afterEach(() => vi.unstubAllGlobals());

it.each(["INBOUND", "OUTBOUND"] as const)("keeps %s yuan prices when requests are unavailable", async stage => {
  const row = { stage, code: "2", name: "Test", description: "", pricing_type: "PER_PACKAGE", unit: "package",
    price: 8.25, currency: "CNY", min_quantity: 1, max_quantity: 1, requires_confirmation: false, status: "ACTIVE" };
  const read = vi.fn(async (url: string, options: RequestInit) => {
    expect(options.method ?? "GET").toBe("GET");
    const { pathname, searchParams } = new URL(url);
    if (pathname.endsWith("/value-added-services")) {
      expect(searchParams.get("stage")).toBe(stage);
      expect(searchParams.get("language")).toBe("zh-CN");
      return Response.json({ data: [row, { ...row, status: "INACTIVE" }] });
    }
    expect(pathname).toBe("/v1/fulfillment/service-requests");
    expect(searchParams.get("resource_type")).toBe(stage === "INBOUND" ? "PACKAGE" : "SHIPMENT");
    return Response.json({ error: { code: "INTERNAL_ERROR" } }, { status: 500 });
  });
  vi.stubGlobal("fetch", read);
  const result = await readWarehouseCatalog("test", stage, "zh-CN");
  expect(read).toHaveBeenCalledTimes(2);
  expect(result.items).toHaveLength(1);
  expect(result).toMatchObject({ stage, items: [{ stage, code: "2", price: 8.25, currency: "CNY" }],
    requestListAvailable: false, message: warehouseUnavailable });
});

it("distinguishes a valid empty directory from a missing directory", async () => {
  vi.stubGlobal("fetch", async () => Response.json({ data: [] }));
  expect(await readWarehouseCatalog("test", "INBOUND")).toEqual({
    stage: "INBOUND", items: [], requestListAvailable: true, applicationAvailable: false, message: null,
  });
  vi.stubGlobal("fetch", async () => Response.json({ error: {} }));
  await expect(readWarehouseCatalog("test", "INBOUND")).rejects.toMatchObject({ status: 503, message: warehouseUnavailable });
});
