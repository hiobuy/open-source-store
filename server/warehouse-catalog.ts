import type { Database } from "./db/client";
import { AppError } from "./errors";
import { resolveHioBuyToken } from "./freight";
import { readWarehouseCatalog } from "./services/hiobuy/warehouse-services";
import type { WarehouseStage } from "../src/domain/warehouse-service-catalog";

export async function warehouseCatalog(db: Database, envToken: string | undefined, stage: WarehouseStage, language = "en") {
  if (!["en", "zh", "zh-CN", "zh-TW"].includes(language)) {
    throw new AppError("VALIDATION_ERROR", "Unsupported catalog language.");
  }
  return readWarehouseCatalog(await resolveHioBuyToken(db, envToken), stage, language);
}
