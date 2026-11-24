import { z } from "zod";

const sortTokens = ["PRICE_ASC", "PRICE_DESC", "SALE_QTY_ASC", "SALE_QTY_DESC"] as const;
/** HioBuy /v1/products/search, OpenAPI 1.0.8 checked 2026-11-12. */
export const productSearchInput = z.object({
  channel: z.enum(["1688", "taobao", "weidian"]),
  keyword: z.string().trim().min(1).max(120),
  page: z.number().int().min(1).max(400).default(1),
  page_size: z.number().int().min(1).max(50).default(20),
  language: z.string().max(20).default("en"),
  user_id: z.string().trim().min(1).max(200).optional().describe("微店搜索用户 ID；省略时使用上游授权账号 openid。"),
  sort: z.enum(sortTokens).optional().describe("价格或销量升降序；省略表示综合排序。与 sort_field + sort_order 二选一。"),
  sort_field: z.enum(["price", "sales", "credit", ...sortTokens, "bid", "sale", "monthSold", "rePurchaseRate"]).optional()
    .describe("排序字段或完整排序标记。credit/rePurchaseRate 为 1688 复购率；淘宝忽略 credit。兼容 HioBuy 文档中的别名。"),
  sort_order: z.enum(["asc", "desc"]).optional().describe("统一字段的排序方向，上游默认 asc；完整排序标记已包含方向时忽略。"),
  price_start: z.number().nonnegative().optional().describe("最低价格，人民币元，允许小数；不是分。"),
  price_end: z.number().nonnegative().optional().describe("最高价格，人民币元，允许小数；不是分。"),
  ship_within_hours: z.union([z.literal(0), z.literal(24), z.literal(48)]).optional().describe("发货时效；0 表示当天发货，仅 1688 支持，淘宝忽略 0。"),
  experience_score_level: z.number().int().min(1).max(4).optional().describe("1688 体验评分等级 1–4；淘宝忽略。"),
  product_attrs: z.string().trim().max(2000).optional().describe("1688 商品标签，逗号分隔：isOnePsale,isOnePsaleFreePost,new7,new30,1688Selection,isQqyx。"),
  filter: z.string().trim().max(2000).optional().describe("1688 原生筛选键，逗号分隔，由上游与语义筛选字段合并。"),
  category_ids: z.string().trim().max(2000).optional().describe("1688 上游类目 ID，逗号分隔；不是本站分类 UUID。淘宝忽略。"),
  category_id: z.number().int().nonnegative().optional().describe("已弃用的单个上游类目 ID，建议改用 category_ids。"),
  category_id_list: z.string().trim().max(2000).optional().describe("已弃用的类目列表，建议改用 category_ids。"),
  product_collection_id: z.string().trim().max(200).optional().describe("1688 业务商品池 ID。"),
  sale_filters: z.array(z.object({
    sale_type: z.enum(["sales7", "sales14", "sales30", "totalSales"]),
    sale_start: z.string().max(100).optional(),
    sale_end: z.string().max(100).optional(),
  }).strict()).max(20).optional().describe("1688 销量区间；上下限按上游契约传字符串。"),
  keyword_translate: z.boolean().optional().describe("1688 关键词翻译开关。"),
}).strict().refine(value => value.price_start === undefined || value.price_end === undefined || value.price_start <= value.price_end,
  { message: "Minimum search price must not exceed maximum price.", path: ["price_end"] });
