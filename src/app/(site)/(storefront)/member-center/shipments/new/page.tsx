import { getTranslations } from "next-intl/server";
import PageClient from "./page-client";

export async function generateMetadata() {
  const t = await getTranslations();
  return { title: t("Combine packages") };
}

export default function Page() {
  return (
    <main className="min-w-0 flex-1">
      <PageClient />
    </main>
  );
}
