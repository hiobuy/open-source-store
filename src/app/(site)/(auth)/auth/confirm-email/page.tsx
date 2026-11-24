import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import ConfirmEmail from "./page-client";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("Verify Your Email"), referrer: "no-referrer" };
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  return <ConfirmEmail token={typeof token === "string" ? token : ""} />;
}
