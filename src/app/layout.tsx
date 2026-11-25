import type { Metadata } from "next";
import { Poppins, Noto_Sans_Arabic } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";

import { LocaleHydrator } from "@/components/locale-hydrator";
import { LOCALE_HTML_LANG, parseLocale, localeDirection } from "@/lib/locale";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
});

const arabic = Noto_Sans_Arabic({
  variable: "--font-arabic",
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();

  return {
    title: {
      default: "HIOBuy Store Demo | Open-Source Commerce Platform",
      template: "%s · HIOBuy Store Demo | Open-Source Commerce Platform",
    },
    description: t("HIOBuy Store Demo"),
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = parseLocale(await getLocale());
  const messages = await getMessages();

  return (
    <html
      lang={LOCALE_HTML_LANG[locale]}
      dir={localeDirection(locale)}
      className={`${poppins.variable} ${arabic.variable} h-full antialiased`}
    >
      <body className="bg-background text-foreground flex min-h-full flex-col">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <LocaleHydrator locale={locale}>
            {children}
          </LocaleHydrator>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
