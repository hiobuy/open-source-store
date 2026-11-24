import {
  purchaseLoginHref,
  purchaseProductTitle,
  unrecognizedProductHref,
} from "@/lib/procurement/purchase";
import type { ProcurementProduct } from "@/lib/procurement/types";
import { productPathFromSlug } from "@/lib/product-request";
import { getServerProduct } from "@/lib/server/product";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import PageClient from "./page-client";

interface Props {
  params: Promise<{ slug: string[] }>;
}

async function productRequest({ params }: Props) {
  const { slug } = await params;
  const pathname = productPathFromSlug(slug);
  const result = await getServerProduct(pathname);
  return { ...result, returnPath: pathname };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const [result, t] = await Promise.all([
    productRequest(props),
    getTranslations(),
  ]);
  const { product } = result;
  if (!product) return { title: t("Product details") };
  const title = purchaseProductTitle(product, result.language);
  const image = product.images[0];
  return {
    title,
    openGraph: {
      title,
      type: "website",
      ...(image ? { images: [image] } : {}),
    },
  };
}

export default async function Page(props: Props) {
  const result = await productRequest(props);
  // The product API requires a session: send guests straight to login.
  if (result.status === 401) redirect(purchaseLoginHref(result.returnPath));
  // Any other failure (unsupported link, missing product, upstream error)
  // falls back to the manual order form.
  const { product, language } = result;
  if (!product || !language) redirect(unrecognizedProductHref);
  return (
    <>
      <style>{"body { background-color: #fff; }"}</style>
      <main className="min-w-0 flex-1">
        <div className="site-container">
          <ProductDetails product={product} language={language} />
        </div>
      </main>
    </>
  );
}

async function ProductDetails({
  product,
  language,
}: {
  product: ProcurementProduct;
  language: string;
}) {
  const title = purchaseProductTitle(product, language);
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Product",
            name: title,
            image: product.images,
          }).replace(/</g, "\\u003c"),
        }}
      />
      <PageClient
        key={`${product.channel}:${product.id}`}
        product={product}
        title={title}
      />
    </>
  );
}
