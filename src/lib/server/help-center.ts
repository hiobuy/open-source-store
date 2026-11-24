import "server-only";
import categories from "@/content/help-center/categories.json";
import beginnersGuide from "@/content/help-center/beginners-guide-how-to-buy-products-from-china-with-our-website.json";
import payTwice from "@/content/help-center/why-do-i-need-to-pay-twice.json";
import fees from "@/content/help-center/what-fees-do-i-need-to-pay.json";
import restrictedItems from "@/content/help-center/restricted-and-prohibited-items-what-cant-be-purchased-or-shipped.json";
import consolidation from "@/content/help-center/how-to-consolidate-and-ship-your-items-from-the-warehouse.json";
import customerService from "@/content/help-center/how-to-contact-customer-service-and-get-help-faster.json";
import refunds from "@/content/help-center/returns-refunds-and-after-sales-what-should-i-do-if-something-goes-wrong.json";
import orderStatus from "@/content/help-center/order-status-guide-what-does-each-status-mean.json";
import customs from "@/content/help-center/customs-duties-and-taxes-what-should-i-know.json";
import shippingFee from "@/content/help-center/how-is-international-shipping-fee-calculated.json";
import type {
  HelpCenterArticle,
  HelpCenterArticleSummary,
  HelpCenterCategory,
} from "@/content/help-center/types";

const articles: HelpCenterArticle[] = [
  beginnersGuide,
  payTwice,
  fees,
  restrictedItems,
  consolidation,
  customerService,
  refunds,
  orderStatus,
  customs,
  shippingFee,
];

export function getHelpCategories(): HelpCenterCategory[] {
  return categories;
}

export function getHelpCategory(id: string): HelpCenterCategory | null {
  return categories.find((category) => String(category.id) === id) ?? null;
}

export function getHelpArticle(slug: string): HelpCenterArticle | null {
  return articles.find((article) => article.slug === slug) ?? null;
}

export function getHelpArticleById(id: string): HelpCenterArticle | null {
  return articles.find((article) => String(article.id) === id) ?? null;
}

/** Lists only expose metadata; full article bodies stay on the server. */
export function getHelpArticleSummaries({
  categoryId = "",
  keyword = "",
  curated = false,
}: {
  categoryId?: string;
  keyword?: string;
  curated?: boolean;
} = {}): HelpCenterArticleSummary[] {
  const query = keyword.trim().toLocaleLowerCase("en");
  return articles
    .filter(
      (article) =>
        (!categoryId || String(article.category_id) === categoryId) &&
        (!curated || article.curated) &&
        (!query || article.title.toLocaleLowerCase("en").includes(query)),
    )
    .map(({ id, slug, title, category_id, curated }) => ({
      id,
      slug,
      title,
      category_id,
      curated,
    }));
}
