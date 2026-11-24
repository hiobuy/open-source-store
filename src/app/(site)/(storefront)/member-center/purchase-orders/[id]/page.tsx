import { getTranslations } from "next-intl/server";
import PageClient from "./page-client";

export async function generateMetadata() {
  const t = await getTranslations();
  return { title: t("Order details") };
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main className="min-w-0 flex-1">
      <PageClient key={id} id={id} />
    </main>
  );
}
