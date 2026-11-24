import { getTranslations } from "next-intl/server";
import PageClient from "./page-client";

export async function generateMetadata() {
  const t = await getTranslations();
  return { title: t("Pay shipping") };
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    session_id?: string | string[];
    purpose?: string | string[];
  }>;
}) {
  const [{ id }, { session_id, purpose }] = await Promise.all([
    params,
    searchParams,
  ]);
  // A wallet top-up started from this page also returns here with a Stripe
  // session; only the checkout's own card payment should be tracked.
  const sessionId =
    typeof session_id === "string" && purpose !== "topup" ? session_id : "";
  return (
    <>
      <style>{"body {\n  background-color: #fff;\n}"}</style>
      <main className="min-w-0 flex-1">
        <div className="site-container">
          <PageClient
            key={`${id}:${sessionId}`}
            id={id}
            sessionId={sessionId}
          />
        </div>
      </main>
    </>
  );
}
