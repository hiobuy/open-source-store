import type messages from "../../messages/en.json";
import type { Locale as SupportedLocale } from "@/lib/locale";

declare module "next-intl" {
  interface AppConfig {
    Locale: SupportedLocale;
    Messages: typeof messages;
  }
}
