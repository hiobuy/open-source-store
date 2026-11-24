import { getTranslations } from "next-intl/server";
import PageClient from "./page-client";

export async function generateMetadata() {
  const t = await getTranslations();
  return { title: t("Browsing history") };
}

export default function Page() {
  return <PageClient />;
}
