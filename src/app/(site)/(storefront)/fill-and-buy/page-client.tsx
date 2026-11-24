/**
 * Custom order — 自定义下单
 */
"use client";
import { ImageUpload, type ImageUploadFile } from "@/components/image-upload";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getErrorMessage } from "@/lib/error-message";
import {
  addProcurementManualCartItem,
  ProcurementApiError,
} from "@/lib/procurement/client";
import {
  parseProcurementAmount,
  safeProcurementPaymentUrl,
} from "@/lib/procurement/payment";
import {
  manualPurchasePlatformLabels,
  procurementCartChanged,
  purchaseLoginHref,
  startManualPurchaseCheckout,
  UNRECOGNIZED_PRODUCT_NOTICE,
} from "@/lib/procurement/purchase";
import { useProcurementSessionStore } from "@/lib/procurement/session-store";
import type {
  ProcurementManualOrderForm,
  ProcurementManualPlatform,
} from "@/lib/procurement/types";
import { cn } from "@/lib/utils";
import { Minus, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
type StepIconProps = {
  isActive: boolean;
  className?: string;
};
function ProcessStep1Icon({ isActive, className }: StepIconProps) {
  const fill = isActive ? "fill-primary" : "fill-[#A2A2A2]";
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      className={cn("h-8 w-8", className)}
      aria-hidden
    >
      <path
        d="M7.98719 1.91992H24.0128C24.9711 1.91982 25.8949 2.27807 26.6026 2.92429C27.3102 3.57051 27.7507 4.458 27.8374 5.4124L29.6998 25.8924C29.7481 26.4238 29.6851 26.9595 29.5149 27.4652C29.3446 27.9709 29.0708 28.4356 28.711 28.8296C28.3511 29.2236 27.9131 29.5383 27.4248 29.7535C26.9366 29.9688 26.4088 30.08 25.8752 30.0799H6.12479C5.59124 30.0799 5.06355 29.9687 4.57537 29.7533C4.08719 29.538 3.64925 29.2233 3.28946 28.8293C2.92967 28.4353 2.65593 27.9707 2.48571 27.465C2.31548 26.9594 2.25251 26.4238 2.30079 25.8924L4.16255 5.4124C4.24927 4.45811 4.68965 3.57071 5.39719 2.92451C6.10474 2.2783 7.02832 1.91998 7.98655 1.91992H7.98719Z"
        className={fill}
      />
      <path
        d="M20.5267 6.72074C20.5688 6.60186 20.6338 6.49241 20.7181 6.39866C20.8024 6.30491 20.9044 6.22868 21.0182 6.17434C21.1319 6.11999 21.2553 6.08858 21.3812 6.08191C21.5071 6.07524 21.6331 6.09344 21.752 6.13546C21.8709 6.17748 21.9803 6.24251 22.0741 6.32683C22.1679 6.41115 22.2441 6.51311 22.2984 6.62688C22.3528 6.74066 22.3842 6.86403 22.3909 6.98995C22.3975 7.11586 22.3793 7.24186 22.3373 7.36074C21.8739 8.67115 21.0156 9.80568 19.8807 10.6081C18.7457 11.4106 17.39 11.8414 16 11.8414C14.6101 11.8414 13.2543 11.4106 12.1194 10.6081C10.9844 9.80568 10.1262 8.67115 9.66274 7.36074C9.62072 7.24186 9.60252 7.11586 9.60919 6.98995C9.61586 6.86403 9.64727 6.74066 9.70162 6.62688C9.75597 6.51311 9.83219 6.41115 9.92595 6.32683C10.0197 6.24251 10.1291 6.17748 10.248 6.13546C10.3669 6.09344 10.4929 6.07524 10.6188 6.08191C10.7447 6.08858 10.8681 6.11999 10.9819 6.17434C11.0957 6.22868 11.1976 6.30491 11.2819 6.39866C11.3663 6.49241 11.4313 6.60186 11.4733 6.72074C11.8045 7.65656 12.4177 8.46673 13.2283 9.03973C14.039 9.61273 15.0073 9.9204 16 9.9204C16.9927 9.9204 17.9611 9.61273 18.7717 9.03973C19.5824 8.46673 20.1955 7.65656 20.5267 6.72074Z"
        className={isActive ? "fill-white" : fill}
      />
    </svg>
  );
}
function ProcessStep2Icon({ isActive, className }: StepIconProps) {
  const fill = isActive ? "fill-primary" : "fill-[#A2A2A2]";
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      className={cn("h-8 w-8", className)}
      aria-hidden
    >
      <path
        d="M29.334 10.0679C29.672 10.6419 29.848 11.2839 29.868 11.9959V25.8039C29.832 26.9339 29.44 27.8719 28.692 28.6199C27.944 29.3679 27.006 29.7599 25.876 29.7959H5.85998C4.72998 29.7599 3.78998 29.3679 3.04398 28.6199C2.29598 27.8719 1.90398 26.9339 1.86798 25.8039V11.9959C1.86798 11.2859 2.04998 10.6419 2.41398 10.0679C2.77798 9.4939 3.26198 9.0059 3.86398 8.6059L13.872 2.3979C14.492 1.9979 15.188 1.7959 15.964 1.7959C16.738 1.7959 17.436 1.9959 18.056 2.3979L28.064 8.6059C28.572 9.0059 28.996 9.4939 29.334 10.0679ZM21.322 17.2459C21.678 16.8819 21.856 16.3979 21.856 15.7959C21.856 15.1939 21.678 14.7119 21.322 14.3459C20.966 13.9819 20.478 13.7999 19.86 13.7999H11.876C11.256 13.7999 10.768 13.9819 10.414 14.3459C10.058 14.7099 9.87998 15.1939 9.87998 15.7959C9.87998 16.3979 10.058 16.8799 10.414 17.2459C10.77 17.6099 11.256 17.7919 11.876 17.7919H19.86C20.478 17.7919 20.966 17.6099 21.322 17.2459ZM21.322 25.2439C21.678 24.8879 21.856 24.4059 21.856 23.7939C21.856 23.1839 21.678 22.6999 21.322 22.3439C20.966 21.9879 20.478 21.8019 19.86 21.7839H11.876C11.256 21.8019 10.768 21.9899 10.414 22.3439C10.06 22.6979 9.87998 23.1819 9.87998 23.7939C9.87998 24.4039 10.058 24.8879 10.414 25.2439C10.77 25.5999 11.256 25.7859 11.876 25.8039H19.86C20.478 25.7859 20.966 25.5999 21.322 25.2439Z"
        className={fill}
      />
    </svg>
  );
}
function ProcessStep3Icon({ isActive, className }: StepIconProps) {
  const fill = isActive ? "fill-primary" : "fill-[#A2A2A2]";
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      className={cn("h-8 w-8", className)}
      aria-hidden
    >
      <path
        d="M0.00187684 9.81491L12.0665 16.9029L12.0609 16.966V31.1172L0 24.0311V9.85692L0.00187684 9.81491ZM25.9981 9.80728V18.3045L25.7598 18.3121C24.6197 18.3699 23.5074 18.6915 22.5078 19.2526C21.5082 19.8137 20.6476 20.5995 19.9913 21.5501C19.3351 22.5008 18.9006 23.5912 18.721 24.7385C18.5413 25.8858 18.6211 27.0597 18.9545 28.1708L13.9372 31.1172V16.9316L13.9353 16.8972L26 9.80728H25.9981ZM6.0905 5.17676L6.18806 5.27033L6.30252 5.34862L18.067 12.261L12.9916 15.2436L0.971928 8.1823L6.08862 5.17676H6.0905ZM12.9972 1.11719L25.0149 8.17848L19.9414 11.1573L7.92553 4.0979L12.9991 1.11719H12.9972Z"
        className={fill}
      />
      <path
        d="M26.5 20.1172C27.9587 20.1172 29.3576 20.6967 30.3891 21.7281C31.4205 22.7596 32 24.1585 32 25.6172C32 27.0759 31.4205 28.4748 30.3891 29.5063C29.3576 30.5377 27.9587 31.1172 26.5 31.1172C25.0413 31.1172 23.6424 30.5377 22.6109 29.5063C21.5795 28.4748 21 27.0759 21 25.6172C21 24.1585 21.5795 22.7596 22.6109 21.7281C23.6424 20.6967 25.0413 20.1172 26.5 20.1172ZM29.041 23.0872L25.686 26.4404L24.1295 24.8839L22.8333 26.18L24.3898 27.7365L24.3733 27.7549L25.6695 29.051L30.3372 24.3834L29.041 23.0872Z"
        className={fill}
      />
    </svg>
  );
}
function ProcessStep4Icon({ isActive, className }: StepIconProps) {
  const fill = isActive ? "fill-primary" : "fill-[#A2A2A2]";
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      className={cn("h-8 w-8", className)}
      aria-hidden
    >
      <path
        d="M30.528 27.6161C30.528 28.0214 30.4587 28.4001 30.32 28.7521C30.1814 29.1041 29.9841 29.4134 29.7281 29.6801C29.472 29.9467 29.1734 30.1547 28.8321 30.3041C28.4907 30.4534 28.1174 30.5281 27.712 30.5281H4.48005C4.07471 30.5281 3.69071 30.4534 3.32805 30.3041C2.96538 30.1547 2.64538 29.9467 2.36805 29.6801C2.09071 29.4134 1.87205 29.1041 1.71205 28.7521C1.55205 28.4001 1.47205 28.0214 1.47205 27.6161V11.6481C1.47205 10.8374 1.75471 10.1494 2.32005 9.58407C2.88538 9.01874 3.57338 8.73607 4.38405 8.73607H27.616C28.4267 8.73607 29.1147 9.01874 29.68 9.58407C30.2454 10.1494 30.528 10.8374 30.528 11.6481V16.0001H23.264C22.4534 16.0001 21.7654 16.2774 21.2 16.8321C20.6347 17.3867 20.352 18.0694 20.352 18.8801C20.3734 19.4347 20.4907 19.9254 20.704 20.3521C20.8747 20.7147 21.1574 21.0454 21.552 21.3441C21.9467 21.6427 22.5174 21.7921 23.264 21.7921H30.528V27.6161ZM26.1761 7.26407H11.648C12.8 6.66674 13.888 6.09074 14.912 5.53607C15.808 5.06674 16.6934 4.59741 17.568 4.12807C18.4427 3.65874 19.1254 3.29607 19.616 3.04007C20.3627 2.63474 21.0294 2.44807 21.616 2.48007C22.2027 2.51207 22.6987 2.61341 23.104 2.78407C23.5734 3.01874 23.9787 3.32807 24.32 3.71207L26.1761 7.26407ZM21.824 18.8801C21.824 18.4747 21.9627 18.1334 22.24 17.8561C22.5174 17.5787 22.8587 17.4401 23.264 17.4401C23.6694 17.4401 24.0107 17.5787 24.288 17.8561C24.5654 18.1334 24.704 18.4747 24.704 18.8801C24.704 19.2854 24.5654 19.6321 24.288 19.9201C24.0107 20.2081 23.6694 20.3521 23.264 20.3521C22.8587 20.3521 22.5174 20.2081 22.24 19.9201C21.9627 19.6321 21.824 19.2854 21.824 18.8801Z"
        className={fill}
      />
    </svg>
  );
}
function ProcessStep5Icon({ isActive, className }: StepIconProps) {
  const fill = isActive ? "fill-primary" : "fill-[#A2A2A2]";
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      className={cn("h-8 w-8", className)}
      aria-hidden
    >
      <path
        d="M1.99999 28.8333C1.99999 29.475 2.52499 30 3.16666 30H28.8333C29.475 30 30 29.475 30 28.8333V9H1.99999V28.8333ZM18.3042 18.3333H25.3333V20.6667H18.3042V18.3333ZM15.9708 23H25.3333V25.3333H15.9708V23ZM15.3875 7.83333H1.97083L4.77083 2.90417C5.20833 2.32083 5.87916 2 6.60833 2H15.3875V7.83333ZM30.0292 7.83333H16.6125V2H25.3917C26.1208 2 26.7917 2.35 27.2292 2.90417L30.0292 7.83333Z"
        className={fill}
      />
    </svg>
  );
}
const STEP_ICONS = [
  ProcessStep1Icon,
  ProcessStep2Icon,
  ProcessStep3Icon,
  ProcessStep4Icon,
  ProcessStep5Icon,
] as const;
function StepSeparator({ isActive }: { isActive: boolean }) {
  return (
    <span
      className={cn(
        "h-[30px] w-[30px] shrink-0 self-center",
        isActive ? "bg-primary/30" : "bg-[#DFDFDF]",
      )}
      style={{ clipPath: "polygon(0 0, 100% 50%, 0 100%)" }}
      aria-hidden
    />
  );
}
interface Specification {
  key: string;
  value: string;
}

const MANUAL_PLATFORMS = [
  { id: "jd", domains: ["jd.com"] },
  {
    id: "pinduoduo",
    domains: ["pinduoduo.com", "yangkeduo.com"],
  },
  { id: "poizon", domains: ["poizon.com", "dewu.com"] },
] as const satisfies ReadonlyArray<{
  id: ProcurementManualPlatform;
  domains: readonly string[];
}>;

function inferManualPlatform(hostname: string) {
  return MANUAL_PLATFORMS.find(({ domains }) =>
    domains.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
    ),
  )?.id;
}

export default function PageClient() {
  const t = useTranslations();
  // Product pages that fail to load redirect here with a notice flag.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("notice") !== UNRECOGNIZED_PRODUCT_NOTICE) return;
    toast.error(t("Unable to recognize this product"), {
      id: UNRECOGNIZED_PRODUCT_NOTICE,
    });
    url.searchParams.delete("notice");
    window.history.replaceState(window.history.state, "", url);
  }, [t]);
  const processSteps = [
    t("Submit Order"),
    t("Storage & Inspection"),
    t("Submit Parcel"),
    t("Pay International Shipping"),
    t("Wait for Delivery"),
  ].map((label) => ({ label }));
  const [sellerName, setSellerName] = useState("");
  const [productLink, setProductLink] = useState("");
  const [selectedPlatform, setSelectedPlatform] = useState<
    ProcurementManualPlatform | ""
  >("");
  const rawLink = productLink.trim();
  const productUrl = safeProcurementPaymentUrl(rawLink);
  const inferredPlatform = productUrl
    ? inferManualPlatform(productUrl.hostname)
    : undefined;
  const [productName, setProductName] = useState("");
  const [specifications, setSpecifications] = useState<Specification[]>([
    { key: "", value: "" },
  ]);
  const [productImages, setProductImages] = useState<ImageUploadFile[]>([]);
  const [message, setMessage] = useState("");
  const maxMessageLength = 1000;
  const [unitPrice, setUnitPrice] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [domesticShipping, setDomesticShipping] = useState("");
  const [agreed, setAgreed] = useState(false);
  const router = useRouter();
  const [submitting, setSubmitting] = useState<"cart" | "order" | null>(null);
  const pending = useRef(false);
  const attempts = useRef<
    Partial<
      Record<
        "cart" | "order",
        {
          body: string;
          id: string;
        }
      >
    >
  >({});
  const handleSpecificationChange = (
    index: number,
    field: "key" | "value",
    value: string,
  ) => {
    const newSpecs = [...specifications];
    newSpecs[index][field] = value;
    setSpecifications(newSpecs);
  };
  const handleAddSpecification = () => {
    setSpecifications([...specifications, { key: "", value: "" }]);
  };
  const handleRemoveSpecification = (index: number) => {
    if (specifications.length > 1) {
      const newSpecs = specifications.filter((_, i) => i !== index);
      setSpecifications(newSpecs);
    }
  };
  const handleIncreaseQuantity = () => {
    setQuantity(Math.min(quantity + 1, 999));
  };
  const handleDecreaseQuantity = () => {
    if (quantity > 1) {
      setQuantity(quantity - 1);
    }
  };
  const unitPriceCents = parseProcurementAmount(unitPrice);
  const domesticShippingCents = parseProcurementAmount(
    domesticShipping || "0",
    true,
  );
  const calculateTotal = () =>
    (
      ((unitPriceCents ?? 0) * quantity + (domesticShippingCents ?? 0)) /
      100
    ).toFixed(2);

  async function submit(mode: "cart" | "order") {
    if (pending.current) return;
    const { hasSession, clientStateVersion } =
      useProcurementSessionStore.getState();
    const login = purchaseLoginHref("/fill-and-buy");
    if (!hasSession) {
      router.push(login);
      return;
    }

    if (!productUrl || productUrl.href.length > 2048) {
      toast.error(
        rawLink
          ? t("Enter a valid HTTPS product link")
          : t("Please enter the product link"),
      );
      return;
    }
    const sourcePlatform = inferredPlatform ?? selectedPlatform;
    if (!sourcePlatform) {
      toast.error(t("Please select the product platform"));
      return;
    }
    const name = productName.trim();
    const seller = sellerName.trim();
    if (!name) {
      toast.error(t("Please enter the product name"));
      return;
    }
    if (!seller) {
      toast.error(t("Please enter the seller name"));
      return;
    }
    if (unitPriceCents == null || unitPriceCents > 99_999_999) {
      toast.error(t("Please enter a valid unit price"));
      return;
    }
    if (domesticShippingCents == null || domesticShippingCents > 99_999_999) {
      toast.error(t("Please enter a valid domestic shipping amount"));
      return;
    }
    if (mode === "order" && !agreed) {
      toast.error(t("Please agree to the terms"));
      return;
    }

    const specification =
      specifications
        .map(({ key, value }) =>
          [key.trim(), value.trim()].filter(Boolean).join(": "),
        )
        .filter(Boolean)
        .join("; ") || "—";
    if (specification.length > 500) {
      toast.error(t("Specifications must be 500 characters or fewer"));
      return;
    }

    const uploaded = productImages[0];
    const imageUrl = uploaded
      ? safeProcurementPaymentUrl(
          new URL(uploaded.url, window.location.origin).href,
        )
      : null;
    if (uploaded && (!imageUrl || imageUrl.href.length > 2048)) {
      toast.error(t("The product image must have an HTTPS link"));
      return;
    }

    const fields: Omit<ProcurementManualOrderForm, "id"> = {
      sourcePlatform,
      sellerName: seller,
      domesticShippingCents,
      remark: message.trim(),
      items: [
        {
          productUrl: productUrl.href,
          name,
          specification,
          unitPriceCents,
          quantity,
          imageUrl: imageUrl?.href ?? null,
          remark: "",
        },
      ],
    };
    const body = JSON.stringify([clientStateVersion, fields]);
    const previous = attempts.current[mode];
    const id = previous?.body === body ? previous.id : crypto.randomUUID();
    attempts.current[mode] = { body, id };

    pending.current = true;
    setSubmitting(mode);
    try {
      if (mode === "cart") {
        await addProcurementManualCartItem({ id, ...fields });
        delete attempts.current.cart;
        if (
          useProcurementSessionStore.getState().clientStateVersion !==
          clientStateVersion
        )
          return;
        window.dispatchEvent(new Event(procurementCartChanged));
        toast.success(t("Added to cart"));
      } else {
        if (
          useProcurementSessionStore.getState().clientStateVersion !==
          clientStateVersion
        )
          return;
        router.push(startManualPurchaseCheckout({ id, ...fields }));
      }
    } catch (error) {
      if (
        useProcurementSessionStore.getState().clientStateVersion !==
        clientStateVersion
      )
        return;
      if (error instanceof ProcurementApiError && error.status === 401) {
        router.push(login);
      } else {
        toast.error(
          getErrorMessage(error) ||
            (mode === "cart"
              ? t("Failed to add to cart Please try again")
              : t("Failed to submit order Please try again")),
        );
      }
    } finally {
      pending.current = false;
      setSubmitting(null);
    }
  }
  return (
    <div className="min-h-screen pt-3 pb-30 md:pt-0 md:pb-0">
      {/* 顶部步骤条 */}
      <div className="custom-process-container my-4 hidden rounded-xl bg-[#F5F5F5] p-4 md:flex">
        <div className="flex w-full items-center">
          {processSteps.map((step, index) => {
            const isActive = index === 0;
            const Icon = STEP_ICONS[index] ?? ProcessStep1Icon;
            const textColor = isActive ? "text-primary" : "text-[#A2A2A2]";
            const iconBg = isActive ? "bg-primary/30" : "bg-[#DFDFDF]";
            return (
              <Fragment key={`${index}-${step.label}`}>
                <div className="flex min-w-0 flex-1 flex-col items-center gap-2">
                  <span
                    className={cn("text-xs font-medium md:text-sm", textColor)}
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div
                    className={cn(
                      "flex h-12 w-12 items-center justify-center rounded-xl md:h-14 md:w-14",
                      iconBg,
                    )}
                  >
                    <Icon isActive={isActive} />
                  </div>
                  <span
                    className={cn(
                      "text-bold w-full px-1 text-center text-[14px] leading-tight",
                      textColor,
                    )}
                  >
                    {step.label}
                  </span>
                </div>
                {index < processSteps.length - 1 && (
                  <StepSeparator isActive={isActive} />
                )}
              </Fragment>
            );
          })}
        </div>
      </div>

      <div className="custom-order-container rounded-[12px] bg-white">
        {/* Product Details Section */}
        <div className="custom-content-container rounded-[12px] bg-white p-4 md:px-6">
          <h2 className="mb-2 text-[14px] font-bold text-[#333333] md:mb-6 md:text-[20px]">
            {t("Product Details")}{" "}
            {/* <span classNapme="text-primary font-normal">{t("(* required)")}</span> */}
          </h2>

          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
            <div className="min-w-0 flex-1 space-y-4">
              {/* Product Link */}
              <div className="flex flex-col gap-2">
                <label className="text-[12px] font-medium text-[#333333] md:text-sm">
                  {t("Product Link")}
                  <span className="text-primary">{"*"}</span>
                </label>
                <input
                  type="url"
                  maxLength={2048}
                  value={productLink}
                  onChange={(event) => {
                    setProductLink(event.target.value);
                    setSelectedPlatform("");
                  }}
                  placeholder={t("Input the product link here")}
                  className="focus:border-primary focus:ring-primary/20 h-[44px] w-full rounded-[8px] border border-[#E2E4F0] bg-white px-3 text-sm font-normal text-[#333333] placeholder:text-gray-400 focus:ring-2 focus:outline-none"
                />
              </div>

              {productUrl && !inferredPlatform && (
                <div className="flex flex-col gap-2">
                  <label
                    htmlFor="fill-buy-platform"
                    className="text-[12px] font-medium text-[#333333] md:text-sm"
                  >
                    {t("Platform")}
                    <span className="text-primary">{"*"}</span>
                  </label>
                  <Select
                    value={selectedPlatform}
                    onValueChange={(value) =>
                      setSelectedPlatform(value as ProcurementManualPlatform)
                    }
                  >
                    <SelectTrigger
                      id="fill-buy-platform"
                      aria-required
                      className="focus:border-primary focus:ring-primary/20 h-[44px] w-full rounded-[8px] border border-[#E2E4F0] bg-white text-sm font-normal text-[#333333] focus:ring-2"
                    >
                      <SelectValue placeholder={t("Please select")} />
                    </SelectTrigger>
                    <SelectContent>
                      {MANUAL_PLATFORMS.map(({ id }) => (
                        <SelectItem key={id} value={id}>
                          {manualPurchasePlatformLabels[id]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Product Name */}
              <div className="flex flex-col gap-2">
                <label className="text-[12px] font-medium text-[#333333] md:text-sm">
                  {t("Product Name")}{" "}
                  <span className="text-primary">{"*"}</span>
                </label>
                <input
                  type="text"
                  maxLength={500}
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  placeholder={t("Input the product name here")}
                  className="focus:border-primary focus:ring-primary/20 h-[44px] w-full rounded-[8px] border border-[#E2E4F0] bg-white px-3 text-sm font-normal text-[#333333] placeholder:text-gray-400 focus:ring-2 focus:outline-none"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label
                  htmlFor="fill-buy-seller"
                  className="text-[12px] font-medium text-[#333333] md:text-sm"
                >
                  {t("Seller")}
                  <span className="text-primary">{"*"}</span>
                </label>
                <input
                  id="fill-buy-seller"
                  type="text"
                  maxLength={200}
                  value={sellerName}
                  onChange={(event) => setSellerName(event.target.value)}
                  className="focus:border-primary focus:ring-primary/20 h-[44px] w-full rounded-[8px] border border-[#E2E4F0] bg-white px-3 text-sm font-normal text-[#333333] placeholder:text-gray-400 focus:ring-2 focus:outline-none"
                />
              </div>

              {/* Specifications */}
              <div className="flex flex-col gap-2">
                <label className="text-[12px] font-medium text-[#333333] md:text-sm">
                  {t("Specifications")}
                </label>
                <div className="space-y-2">
                  {specifications.map((spec, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={spec.key}
                        onChange={(e) =>
                          handleSpecificationChange(
                            index,
                            "key",
                            e.target.value,
                          )
                        }
                        placeholder={t("color")}
                        className="focus:border-primary focus:ring-primary/20 h-[36px] w-[143px] rounded-[8px] border border-[#E2E4F0] bg-white px-3 text-sm font-normal text-[#333333] placeholder:text-gray-400 focus:ring-2 focus:outline-none"
                      />
                      <div className="flex h-6 w-6 items-center justify-center">
                        <img
                          src="/assets/images/common/link.png"
                          alt={t("link")}
                          className="h-4 w-4"
                        />
                      </div>
                      <input
                        type="text"
                        value={spec.value}
                        onChange={(e) =>
                          handleSpecificationChange(
                            index,
                            "value",
                            e.target.value,
                          )
                        }
                        placeholder={t("red")}
                        className="focus:border-primary focus:ring-primary/20 h-[36px] w-[143px] rounded-[8px] border border-[#E2E4F0] bg-white px-3 text-sm font-normal text-[#333333] placeholder:text-gray-400 focus:ring-2 focus:outline-none"
                      />
                      <button
                        onClick={() => handleRemoveSpecification(index)}
                        className="flex h-10 w-10 items-center justify-center text-gray-400 transition-colors hover:text-red-500"
                      >
                        <img
                          src="/assets/images/common/delete.png"
                          alt={t("delete")}
                          className="h-4 w-4 cursor-pointer"
                        />
                      </button>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-500">
                  {t(
                    "Leave product description and specification information (such as color, size, etc)",
                  )}
                </p>
                <button
                  onClick={handleAddSpecification}
                  className="border-primary text-primary hover:bg-primary/5 h-[42px] w-full rounded-[8px] border border-dashed bg-white text-sm font-normal transition-colors md:w-[341px]"
                >
                  {t("Add specification")}
                </button>
              </div>

              {/* Message */}
              <div className="flex flex-col gap-2">
                <label className="text-[12px] font-medium text-[#333333] md:text-sm">
                  {t("Notes")}
                </label>
                <div className="relative w-full">
                  <textarea
                    value={message}
                    onChange={(e) => {
                      if (e.target.value.length <= maxMessageLength) {
                        setMessage(e.target.value);
                      }
                    }}
                    placeholder={t(
                      "Leave a message for procurement If there are no special procurement requirements, you do not need to write anything",
                    )}
                    className="focus:border-primary focus:ring-primary/20 h-[100px] w-full resize-none rounded-[8px] border border-[#E2E4F0] bg-white px-3 py-2 text-sm font-normal text-[#333333] placeholder:text-gray-400 focus:ring-2 focus:outline-none"
                  />
                  <div className="absolute end-2 bottom-2 text-xs text-gray-400">
                    {message.length}/{maxMessageLength}
                  </div>
                </div>
              </div>

              {/* Product image */}
              <div className="flex flex-col gap-2">
                <label className="text-[12px] font-medium text-[#333333] md:text-sm">
                  {t("Product image")}
                </label>
                <ImageUpload
                  value={productImages}
                  onChange={setProductImages}
                  limit={1}
                  width={80}
                  height={80}
                />
              </div>
            </div>

            {/* Disclaimer */}
            <div className="w-full shrink-0 lg:w-[300px] xl:w-[340px]">
              <div className="border-primary bg-primary/10 rounded-[8px] border p-4">
                <div className="mb-3 flex items-center gap-2">
                  <span className="bg-primary flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white">
                    !
                  </span>
                  <span className="text-sm font-bold text-[#333333]">
                    {t("Disclaimer")}
                  </span>
                </div>
                <p className="text-[11px] leading-relaxed font-normal text-[#999999] md:text-xs">
                  {t(
                    "Products on this page are sourced via purchasing services from third-party platforms and channels, including JD, Pinduoduo, and Dewu (POIZON) For such products, returns without quality issues or merchant-related problems are not accepted We only assists with seller inquiries, purchasing on your behalf, and arranging third-party logistics delivery We cannot verify the quality or authenticity of the products Please review carefully and make your own judgment before placing an order",
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Fee Section */}
        <div className="custom-content-container rounded-[12px] bg-white p-4 md:p-6">
          <h2 className="mb-2 text-[14px] font-bold text-[#333333] md:mb-6 md:text-[20px]">
            {t("Fee")}
          </h2>

          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
            <div className="min-w-0 flex-1 space-y-4">
              {/* Unit Price */}
              <div className="flex flex-col gap-2">
                <label className="text-[12px] font-medium text-[#333333] md:text-sm">
                  {t("Unit Price(CNY)")}
                  <span className="text-primary">{"*"}</span>
                </label>
                <input
                  type="number"
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(e.target.value)}
                  placeholder={t("Enter unit price in CNY, eg 9900")}
                  className="focus:border-primary focus:ring-primary/20 h-[44px] w-full rounded-[8px] border border-[#E2E4F0] bg-white px-3 text-sm font-normal text-[#333333] placeholder:text-gray-400 focus:ring-2 focus:outline-none"
                />
                <p className="text-[11px] font-normal text-[#999999]">
                  {t(
                    "If the price is unknown, fill in an order under 10 CNY and then wait for the agent to confirm the difference",
                  )}
                </p>
              </div>

              {/* Quantity */}
              <div className="flex flex-col gap-2">
                <label className="text-[12px] font-medium text-[#333333] md:text-sm">
                  {t("Quantity")}
                  <span className="text-primary">{"*"}</span>
                </label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleDecreaseQuantity}
                    disabled={quantity <= 1}
                    className="flex h-[36px] w-[36px] items-center justify-center rounded-[6px] border border-[#E2E4F0] text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={999}
                    step={1}
                    value={quantity}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      if (Number.isInteger(value) && value >= 1)
                        setQuantity(Math.min(value, 999));
                    }}
                    className="focus:border-primary focus:ring-primary/20 h-[36px] w-[100px] rounded-[6px] border border-[#E2E4F0] bg-white px-3 text-center text-sm font-normal text-[#333333] focus:ring-2 focus:outline-none"
                  />
                  <button
                    onClick={handleIncreaseQuantity}
                    disabled={quantity >= 999}
                    className="flex h-[36px] w-[36px] items-center justify-center rounded-[6px] border border-[#E2E4F0] text-gray-600 transition-colors hover:bg-gray-50"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Domestic Shipping */}
              <div className="flex flex-col gap-2">
                <label className="text-[12px] font-medium text-[#333333] md:text-sm">
                  {t("Domestic Shipping")}
                  <span className="text-primary">{"*"}</span>
                </label>
                <input
                  type="number"
                  value={domesticShipping}
                  onChange={(e) => setDomesticShipping(e.target.value)}
                  placeholder={t(
                    "Enter shipping cost to warehouse in CNY, eg 0",
                  )}
                  className="focus:border-primary focus:ring-primary/20 h-[44px] w-full rounded-[8px] border border-[#E2E4F0] bg-white px-3 text-sm font-normal text-[#333333] placeholder:text-gray-400 focus:ring-2 focus:outline-none"
                />
                <p className="text-[11px] font-normal text-[#999999]">
                  {t(
                    "Please enter the shipping cost from the seller to the HaiouBuy warehouse",
                  )}
                </p>
              </div>
            </div>

            {/* Fee Statement */}
            <div className="w-full shrink-0 lg:w-[300px] xl:w-[340px]">
              <div className="border-primary bg-primary/10 rounded-[8px] border p-4">
                <div className="mb-3 flex items-center gap-2">
                  <span className="bg-primary flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white">
                    !
                  </span>
                  <span className="text-sm font-bold">
                    {t("Fee Statement")}
                  </span>
                </div>
                <p className="text-[11px] leading-relaxed font-normal text-[#999999] md:text-xs">
                  {t(
                    "On this page, you are submitting third-party products (JD, Pinduoduo, and Dewu (POIZON)) HaiouBuy can only help you contact the seller in the link for product consultation, purchase for you, and arrange third-party logistics delivery services HaiouBuy cannot distinguish the quality or authenticity of goods Please note this before purchasing",
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Order Summary Section - PC */}
        <div className="custom-submit-container hidden border-t border-[#E2E4F0] bg-white px-4 py-4 md:block">
          <div className="flex items-center justify-between gap-6">
            {/* Agreement - Left */}
            <div className="flex min-w-0 flex-1 items-start gap-2">
              <Checkbox
                id="agreement"
                checked={agreed}
                onCheckedChange={(checked) => setAgreed(checked === true)}
                className="mt-0.5"
              />
              <label
                htmlFor="agreement"
                className="text-xs leading-relaxed font-normal text-[#666666]"
              >
                {t("I have read and agreed to the")}{" "}
                <a
                  href="/blog/prohibited-items"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:opacity-80"
                >
                  {t("Prohibited Items Statement")}
                </a>{" "}
                {/* {t("and")}{" "} */}
                <a
                  href="/blog/purchasing-agent-disclaimer"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:opacity-80"
                >
                  {t("Disclaimer")}
                </a>
              </label>
            </div>

            {/* Total + Buttons - Right */}
            <div className="flex shrink-0 items-center gap-4">
              <div className="text-end">
                <div className="text-sm text-[#333333]">
                  <span>{t("Total amount to be paid:")}</span>
                  <span className="text-primary ms-1 text-base font-bold">
                    CNY {calculateTotal()}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] leading-snug text-[#999999]">
                  {t("International shipping is charged separately")}{" "}
                  <button
                    type="button"
                    onClick={() => router.push("/freight-estimation")}
                    className="text-primary cursor-pointer hover:opacity-80"
                  >
                    {t("Freight Estimator >")}
                  </button>
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => void submit("cart")}
                  disabled={submitting !== null}
                  className="border-primary text-primary hover:bg-primary/5 inline-flex h-11 w-[140px] items-center justify-center rounded-full border bg-white text-sm font-normal transition-colors disabled:cursor-not-allowed"
                >
                  {submitting === "cart" ? <Spinner /> : t("Add to Cart")}
                </button>
                <button
                  type="button"
                  onClick={() => void submit("order")}
                  disabled={submitting !== null}
                  className="bg-primary hover:bg-primary/90 h-11 w-[140px] rounded-full text-sm font-normal text-white transition-colors disabled:cursor-not-allowed"
                >
                  {t("Submit Order")}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Mobile Order Summary Section */}
        <div className="fixed start-0 end-0 bottom-0 md:hidden">
          {/* Agreement Checkbox - Top with light orange background */}
          <div className="w-full bg-[#FFDECC] px-2 py-4">
            <div className="flex items-start gap-2">
              <Checkbox
                id="agreement-mobile"
                checked={agreed}
                onCheckedChange={(checked) => setAgreed(checked === true)}
              />
              <label
                htmlFor="agreement-mobile"
                className="text-[11px] font-medium text-[#333333]"
              >
                <span>{t("I have read and accepted")}</span>
                <a
                  href="/blog/prohibited-items"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline"
                >
                  {t("'Prohibited Items Declaration'")}
                </a>
                <a
                  href="/blog/purchasing-agent-disclaimer"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline"
                >
                  {t("'Disclaimer'")}
                </a>
              </label>
            </div>
          </div>

          {/* Total Amount and Buttons - White background */}
          <div className="flex w-full items-center justify-between gap-2 bg-white px-3 py-2">
            {/* Total Amount - Left side */}
            <div className="min-w-0 flex-1">
              <div className="mb-1 text-end text-[14px] font-bold text-[#FF5B00]">
                CNY {calculateTotal()}
              </div>
              <p className="text-end text-[8px] font-normal text-[#999999]">
                {t(
                  "Total amount to be paid (international shipping fees are not included)",
                )}
              </p>
            </div>

            {/* Action Buttons - Right side */}
            <div className="flex shrink-0 gap-2">
              <button
                onClick={() => void submit("cart")}
                disabled={submitting !== null}
                className="border-primary text-primary hover:bg-primary/5 inline-flex h-[38px] w-[108px] items-center justify-center rounded-[30px] border bg-white text-sm font-normal transition-colors disabled:cursor-not-allowed"
              >
                {submitting === "cart" ? <Spinner /> : t("Add to Cart")}
              </button>
              <button
                onClick={() => void submit("order")}
                disabled={submitting !== null}
                className="bg-primary hover:bg-primary/90 h-[38px] w-[78px] rounded-[30px] text-sm font-normal text-white shadow-[0px_2px_6px_0px_rgba(165,64,1,0.35)] transition-colors disabled:cursor-not-allowed"
              >
                {t("Submit")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
