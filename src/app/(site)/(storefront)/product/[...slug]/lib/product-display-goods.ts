import type {
  GoodsInfo,
  GoodsPropItem,
  PropItem,
} from "@/lib/client/services/goods-types";
import type {
  ProcurementProduct,
  ProcurementProductAttribute,
} from "@/lib/procurement/types";

const attributeMetadata = new Set([
  "name",
  "value",
  "original_name",
  "original_value",
  "prop_id",
  "language",
  "translated",
  "image",
]);

interface SpecPair {
  name: string;
  value: string;
  image?: string;
}

/** A procurement attribute is one named option, not a map of field names. */
function specPairs(
  attributes: Record<string, string | undefined>[],
): SpecPair[] {
  return attributes.flatMap((attribute) => {
    const name = attribute.name?.trim();
    const value = attribute.value?.trim();
    if (name && value) {
      const image = attribute.image?.trim();
      return [{ name, value, image: image || undefined }];
    }
    return Object.entries(attribute).flatMap(([key, entry]) => {
      const option = entry?.trim();
      if (!option || attributeMetadata.has(key)) return [];
      return [{ name: key, value: option }];
    });
  });
}

function yuan(cents: number | null | undefined) {
  return typeof cents === "number" ? cents / 100 : undefined;
}

function positiveInteger(value: number | null | undefined) {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : undefined;
}

function specificationItem(
  attribute: ProcurementProductAttribute,
): GoodsPropItem | null {
  const name = attribute.name?.trim() || attribute.original_name?.trim() || "";
  const value =
    attribute.value?.trim() || attribute.original_value?.trim() || "";
  return name && value ? { name, value } : null;
}

/** Adapt the procurement variants to the existing grouped SKU controls. */
export function productDisplayGoods(
  product: ProcurementProduct,
  title: string,
): GoodsInfo {
  const groups = new Map<string, PropItem>();
  const propsImg: Record<string, string> = {};
  const specsBySku = product.variants.map((variant) =>
    specPairs(variant.attributes),
  );
  const groupNames = [
    ...new Set(specsBySku.flatMap((specs) => specs.map((spec) => spec.name))),
  ];
  const signatures = specsBySku.map((specs) =>
    JSON.stringify(
      groupNames.map(
        (name) => specs.find((spec) => spec.name === name)?.value ?? "",
      ),
    ),
  );
  const hasCompleteDistinctAttributes =
    groupNames.length > 0 &&
    specsBySku.every((specs) =>
      groupNames.every((name) =>
        specs.some((spec) => spec.name === name && spec.value),
      ),
    ) &&
    new Set(signatures).size === signatures.length;
  const labels = specsBySku.map((specs) =>
    specs
      .map((spec) => spec.value)
      .filter(Boolean)
      .join(" / "),
  );
  const duplicateLabels = new Set(
    labels.filter((label, index) => label && labels.indexOf(label) !== index),
  );

  const variants = product.variants.map((variant, index) => {
    const specs = specsBySku[index];
    const label = labels[index];
    const selected =
      hasCompleteDistinctAttributes ||
      (product.variants.length === 1 && specs.length > 0)
        ? groupNames.map((name) => specs.find((spec) => spec.name === name))
        : [
            {
              name: "SKU",
              value: label
                ? duplicateLabels.has(label)
                  ? `${label} (${variant.skuId})`
                  : label
                : variant.skuId,
            },
          ];
    const properties = selected.flatMap((spec) => {
      if (!spec?.value) return [];
      let group = groups.get(spec.name);
      if (!group) {
        group = { id: groups.size + 1, name: spec.name, children: [] };
        groups.set(spec.name, group);
      }
      let option = group.children.find((child) => child.name === spec.value);
      if (!option) {
        option = { id: group.children.length + 1, name: spec.value };
        group.children.push(option);
      }
      const key = `${group.id}:${option.id}`;
      if (spec.image && !propsImg[key]) propsImg[key] = spec.image;
      return [key];
    });
    return {
      sku_id: variant.skuId,
      spec_id: variant.skuId,
      quantity: variant.stock ?? undefined,
      price: yuan(variant.price?.unitPriceCents),
      sku_img: variant.image ?? undefined,
      properties: properties.join(";"),
    };
  });

  return {
    platform: product.channel,
    title,
    detail_url: product.sourceUrl ?? undefined,
    pic_url: product.images[0],
    item_imgs: product.images,
    props_list: [...groups.values()],
    props_img: propsImg,
    props: (product.attributes ?? []).flatMap((attribute) => {
      const item = specificationItem(attribute);
      return item ? [item] : [];
    }),
    skus: { sku: variants },
    desc:
      product.description?.translated?.trim() ||
      product.description?.original?.trim() ||
      "",
    min_order_quantity: positiveInteger(product.minOrderQuantity),
    batch_number: positiveInteger(product.orderQuantityMultiple),
  };
}
