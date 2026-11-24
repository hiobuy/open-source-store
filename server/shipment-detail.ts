import { and, eq } from "drizzle-orm";
import { savedPackageGoods } from "../src/domain/package-goods";
import type { ShipmentDetail, ShipmentPackageProduct } from "../src/types/api";
import { packagePurchaseLinks } from "./admin-package-purchases";
import { getShipment } from "./data";
import type { Database } from "./db/client";
import { packages, shipmentPackages } from "./db/schema";
import { warehousePackagePhotos } from "./photos";

export async function getShipmentDetail(db: Database, userId: string, id: string, envToken?: string) {
  const shipment = await getShipment(db, userId, id, envToken);
  const scope = and(eq(shipmentPackages.shipmentId, id), eq(packages.userId, userId));
  const contents = db.select({ id: packages.id }).from(shipmentPackages)
    .innerJoin(packages, eq(packages.id, shipmentPackages.packageId)).where(scope);
  const [rows, purchases, photos] = await Promise.all([
    db.select({ id: packages.id, packageStatus: packages.packageStatus, receivedAt: packages.receivedAt,
      productName: packages.productName, quantity: packages.quantity, fulfillmentItems: packages.fulfillmentItems })
      .from(shipmentPackages).innerJoin(packages, eq(packages.id, shipmentPackages.packageId)).where(scope),
    packagePurchaseLinks(db, contents),
    warehousePackagePhotos(db, userId, contents),
  ]);
  const byId = new Map(rows.map(row => [row.id, row]));
  const detailedPackages = shipment.packages.flatMap((pkg): ShipmentDetail["packages"] => {
    const row = byId.get(pkg.id);
    if (!row) return [];
    const goodsItems = savedPackageGoods(row.fulfillmentItems).map(({ name, quantity, imageUrl }) => ({ name, quantity, imageUrl }));
    const links = purchases.get(pkg.id) ?? [];
    const itemSource = links.length ? "purchase" : goodsItems.length ? "fulfillment" : row.productName ? "prealert" : null;
    const items: ShipmentPackageProduct[] = links.map(link => ({
      itemId: link.itemId, orderId: link.orderId, orderNumber: link.orderNumber,
      name: link.name, sku: link.sku, variantLabel: link.variantLabel, imageUrl: link.imageUrl,
      quantity: link.allocatedQuantity, receivedQuantity: link.receivedQuantity,
      unitPriceCents: link.saleUnitCents, currency: link.saleCurrency,
    }));
    if (!links.length) {
      const fallback = goodsItems.length ? goodsItems : row.productName ? [{ name: row.productName, quantity: row.quantity, imageUrl: null }] : [];
      for (const goods of fallback) items.push({
        ...goods, itemId: null, orderId: null, orderNumber: null, sku: null, variantLabel: null,
        receivedQuantity: null, unitPriceCents: null, currency: null,
      });
    }
    return [{ ...pkg, packageStatus: row.packageStatus, receivedAt: row.receivedAt == null ? null : new Date(row.receivedAt).toISOString(), goodsItems, itemSource, items, photos: photos.get(pkg.id) ?? [] }];
  });
  return { ...shipment, packages: detailedPackages, packageCount: detailedPackages.length };
}
