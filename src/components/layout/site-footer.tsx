import Link from "next/link";
import { getTranslations } from "next-intl/server";

export async function SiteFooter() {
  const t = await getTranslations();
  const columns = [
    {
      title: t.raw("Customer Service"),
      links: [
        { label: t.raw("Help Center"), url: "/help-center" },
        { label: t.raw("Contact Us"), url: "/blog/contact" },
      ],
    },
    {
      title: t.raw("Shopping Agent Guide"),
      links: [
        { label: t.raw("Beginner's Guide"), url: "/blog/guide" },
        { label: t.raw("Service & Fees"), url: "/blog/service-fees" },
        {
          label: t.raw("Returns and Refunds"),
          url: "/blog/returns-and-refunds",
        },
      ],
    },
    {
      title: t.raw("Payment"),
      links: [
        { label: t.raw("Top up"), url: "/blog/topup" },
        {
          label: t.raw("International Credit Card"),
          url: "/blog/international-credit-card",
        },
      ],
    },
    {
      title: t.raw("Delivery"),
      links: [
        { label: t.raw("Charges"), url: "/blog/charges" },
        { label: t.raw("Packaging"), url: "/blog/packaging" },
        {
          label: t.raw("Customs and Taxation"),
          url: "/blog/customs-and-taxation",
        },
      ],
    },
  ];
  const images = [
    {
      image:
        "https://api-dev.hiobuy.net/uploads/c321a72a-dcb3-446a-a327-0f307dcf96e3/1782193352651-57vy5k.png",
      alt: t.raw("Paypal"),
      url: "",
    },
    {
      image:
        "https://api-dev.hiobuy.net/uploads/c321a72a-dcb3-446a-a327-0f307dcf96e3/1782193411597-zpvd3u.png",
      alt: t.raw("Visa"),
      url: "",
    },
    {
      image:
        "https://api-dev.hiobuy.net/uploads/c321a72a-dcb3-446a-a327-0f307dcf96e3/1782193428501-nrwvq9.png",
      alt: t.raw("matercard"),
      url: "",
    },
    {
      image:
        "https://api-dev.hiobuy.net/uploads/c321a72a-dcb3-446a-a327-0f307dcf96e3/1782193460528-xetyjp.png",
      alt: t.raw("DHL"),
      url: "",
    },
    {
      image:
        "https://api-dev.hiobuy.net/uploads/c321a72a-dcb3-446a-a327-0f307dcf96e3/1782193478609-bk1g7z.png",
      alt: t.raw("Post"),
      url: "",
    },
  ];
  return (
    <footer className="hidden bg-[#111827] px-2 py-6 text-white md:px-0 md:py-12 lg:block">
      <div className="site-container">
        <div>
          <div className="mb-8 hidden grid-cols-4 gap-6 md:grid lg:gap-8">
            {columns.map((column) => (
              <div key={column.title}>
                <h3 className="mb-4 text-base font-bold lg:text-lg">
                  {column.title}
                </h3>
                <ul className="space-y-2">
                  {column.links.map((link) => (
                    <li key={link.url}>
                      <Link
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-[#ACBCD9] hover:underline lg:text-base"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="mb-6 border-t border-white opacity-30" />
          <div className="text-sm">
            <div className="flex flex-wrap items-center gap-1.5">
              {images.map((item) => (
                <span key={item.image}>
                  <img
                    src={item.image}
                    alt={item.alt}
                    className="h-12 w-auto object-contain"
                  />
                </span>
              ))}
            </div>
            <div className="mt-2 opacity-80">{t.raw("@2024 XXXX Limit")}</div>
          </div>
        </div>
      </div>
    </footer>
  );
}
