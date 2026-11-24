import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@/admin/index.css";

export const metadata: Metadata = {
  title: { absolute: "Admin" },
  robots: { index: false, follow: false },
};

const ADMIN_FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;700;800&family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,500,0,0&display=swap";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="admin-root" dir="ltr">
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link rel="stylesheet" href={ADMIN_FONTS_HREF} precedence="default" />
      {children}
    </div>
  );
}
