export type PackagePurchaseLink = {
  id: string;
  orderId: string;
  orderNumber: string;
  platform: string;
  itemId: string;
  name: string;
  sku: string;
  saleUnitCents: number | null;
  saleCurrency: string | null;
  imageUrl: string | null;
  variantLabel: string | null;
  orderedQuantity: number;
  allocatedQuantity: number;
  receivedQuantity: number;
};
