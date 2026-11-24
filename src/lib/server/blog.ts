import "server-only";
import type { BlogPost } from "@/content/blog/types";
import chargesPost from "@/content/blog/charges.json";
import contactPost from "@/content/blog/contact.json";
import customsAndTaxationPost from "@/content/blog/customs-and-taxation.json";
import guidePost from "@/content/blog/guide.json";
import internationalCreditCardPost from "@/content/blog/international-credit-card.json";
import packagingPost from "@/content/blog/packaging.json";
import prohibitedItemsPost from "@/content/blog/prohibited-items.json";
import purchasingAgentDisclaimerPost from "@/content/blog/purchasing-agent-disclaimer.json";
import registrationAgreementPost from "@/content/blog/registration-agreement.json";
import returnsAndRefundsPost from "@/content/blog/returns-and-refunds.json";
import serviceFeesPost from "@/content/blog/service-fees.json";
import topupPost from "@/content/blog/topup.json";
import userStatementPost from "@/content/blog/user-statement.json";

const posts: Record<string, BlogPost> = {
  charges: chargesPost,
  contact: contactPost,
  "customs-and-taxation": customsAndTaxationPost,
  guide: guidePost,
  "international-credit-card": internationalCreditCardPost,
  packaging: packagingPost,
  "prohibited-items": prohibitedItemsPost,
  "purchasing-agent-disclaimer": purchasingAgentDisclaimerPost,
  "registration-agreement": registrationAgreementPost,
  "returns-and-refunds": returnsAndRefundsPost,
  "service-fees": serviceFeesPost,
  topup: topupPost,
  "user-statement": userStatementPost,
};

/** Blog content is bundled with the project; no CMS, network or runtime file reads. */
export function getBlogPost(slug: string): BlogPost | null {
  return Object.prototype.hasOwnProperty.call(posts, slug) ? posts[slug] : null;
}
