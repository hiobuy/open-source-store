export type WarehouseStage = "INBOUND" | "OUTBOUND";

export type WarehouseService = {
  code: string;
  stage: WarehouseStage;
  name: string;
  description: string;
  pricingType: string;
  unit: string;
  /** Catalog reference price in CNY yuan. */
  price: number;
  currency: "CNY";
  minQuantity: number | null;
  maxQuantity: number | null;
  requiresConfirmation: boolean;
};

export type WarehouseServiceCatalog = {
  stage: WarehouseStage;
  items: WarehouseService[];
  requestListAvailable: boolean;
  applicationAvailable: boolean;
  message: string | null;
};
