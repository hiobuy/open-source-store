import { and, asc, eq, inArray, like, ne, or, type SQLWrapper } from "drizzle-orm";
import type { Database } from "./db/client";
import { packages, procurementItemPackages as links, procurementItems as items, procurementOrders as orders, procurementBills as bills } from "./db/schema";
import { purchaseItemPrice } from "./purchase-detail";
import { readProductMedia } from "./purchase-media";
import type { PackagePurchaseLink } from "../src/types/admin-packages";

export async function packagePurchaseLinks(db: Database, packageIds: string[] | SQLWrapper) {
  const result = new Map<string, PackagePurchaseLink[]>();
  if (Array.isArray(packageIds) && !packageIds.length) return result;
  const rows = await db.select({ packageId: links.packageId, id: links.id, orderId: orders.id, orderNumber: orders.number,
    platform: orders.platform, itemId: items.id, name: items.name, sku: items.sku, snapshot: items.productSnapshot, position: items.position, billCurrency: bills.currency, billSnapshot: bills.snapshot,
    orderedQuantity: items.quantity, allocatedQuantity: links.allocatedQuantity, receivedQuantity: links.receivedQuantity,
  }).from(links).innerJoin(items, and(eq(items.id, links.itemId), eq(items.orderId, links.orderId)))
    .innerJoin(orders, eq(orders.id, links.orderId)).innerJoin(packages, and(eq(packages.id, links.packageId), eq(packages.userId, orders.customerId)))
    .leftJoin(bills, and(eq(bills.orderId, orders.id), eq(bills.customerId, orders.customerId), ne(bills.status, "void")))
    .where(and(inArray(links.packageId, packageIds), eq(links.active, true))).orderBy(asc(orders.createdAt), asc(items.position), asc(links.id));
  for (const { packageId, snapshot, position, billCurrency, billSnapshot, ...row } of rows) {
    const price = purchaseItemPrice({ id: row.itemId, position, quantity: row.orderedQuantity }, billCurrency && billSnapshot ? { currency: billCurrency, snapshot: billSnapshot } : undefined);
    const media = readProductMedia(snapshot);
    result.set(packageId, [...(result.get(packageId) ?? []), { ...row, saleUnitCents: price.unitPriceCents, saleCurrency: price.currency, imageUrl: media.imageUrl, variantLabel: media.variantLabel }]);
  }
  return result;
}

export async function findPackagePurchaseMatches(db: Database, query: string) {
  const rows = await db.selectDistinct({ id: links.packageId }).from(links)
    .innerJoin(items, and(eq(items.id, links.itemId), eq(items.orderId, links.orderId)))
    .innerJoin(orders, eq(orders.id, links.orderId)).innerJoin(packages, and(eq(packages.id, links.packageId), eq(packages.userId, orders.customerId)))
    .where(and(eq(links.active, true), or(like(orders.number, `%${query}%`), like(items.name, `%${query}%`), like(items.sku, `%${query}%`))));
  return new Set(rows.map(row => row.id));
}
