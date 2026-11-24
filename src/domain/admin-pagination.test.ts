import { describe, expect, it } from "vitest";
import { adminPage, adminPageSize, paginateAdminItems, paginationWindow } from "./admin-pagination";
import { demoPackages, demoShipments } from "./demo";

describe("admin list pagination", () => {
  it("normalizes invalid URL inputs and retains the API default", () => {
    for (const input of [undefined, null, "abc", "0", "-1", "1.5", "Infinity", "1e30"]) expect(adminPage(input)).toBe(1);
    expect(adminPage("3")).toBe(3);
    expect(adminPageSize("50")).toBe(50);
    expect(adminPageSize("200", 25)).toBe(25);
    expect(adminPageSize(undefined)).toBe(20);
  });
  it("clamps an out-of-range page after removal or filtering", () => {
    const result = paginateAdminItems(Array.from({ length: 14 }, (_, i) => i), 7, 5);
    expect(result).toEqual({ items: [10, 11, 12, 13], total: 14, page: 3, pageSize: 5 });
    expect(paginationWindow(result.page, 5, 14)).toMatchObject({ from: 11, to: 14, pages: 3 });
    expect(paginationWindow(9, 20, 0)).toMatchObject({ page: 1, pages: 1, from: 0, to: 0, buttons: [1] });
  });
  it("keeps first, last and nearby pages reachable without rendering every page", () => {
    expect(paginationWindow(5, 5, 500).buttons).toEqual([1, "ellipsis", 3, 4, 5, 6, 7, "ellipsis", 100]);
    expect(paginationWindow(1, 5, 500).buttons).toEqual([1, 2, 3, 4, 5, "ellipsis", 100]);
    expect(paginationWindow(100, 5, 500).buttons).toEqual([1, "ellipsis", 96, 97, 98, 99, 100]);
    expect(paginationWindow(2, 5, 14).buttons).toEqual([1, 2, 3]);
  });
  it.each([demoPackages, demoShipments])("applies page size consistently to demo lists without changing counts", list => {
    const first = list({ page: "1", pageSize: "5" });
    const next = list({ page: "2", pageSize: "5" });
    expect(first.items).toHaveLength(5);
    expect(next.items).toHaveLength(5);
    expect(first.items.some(a => next.items.some(b => a.id === b.id))).toBe(false);
    expect(first.total).toBe(next.total);
    expect(first.counts).toEqual(next.counts);
    expect(list({ page: "99999", pageSize: "5" }).page).toBe(Math.ceil(first.total / 5));
    expect(list({}).pageSize).toBe(25);
  });
});
