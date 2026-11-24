import type { ReactNode } from "react";
import { default as Addresses } from "@/assets/images/member-empty/addresses.svg";
import { default as Favorites } from "@/assets/images/member-empty/favorites.svg";
import { default as History } from "@/assets/images/member-empty/history.svg";
import { default as Messages } from "@/assets/images/member-empty/messages.svg";
import { default as Orders } from "@/assets/images/member-empty/orders.svg";
import { default as Shipments } from "@/assets/images/member-empty/shipments.svg";
import { default as Shops } from "@/assets/images/member-empty/shops.svg";
import { default as Wallet } from "@/assets/images/member-empty/wallet.svg";
import { default as Warehouse } from "@/assets/images/member-empty/warehouse.svg";
import { cn } from "@/lib/utils";

const illustrations = {
  addresses: Addresses,
  favorites: Favorites,
  history: History,
  messages: Messages,
  orders: Orders,
  shipments: Shipments,
  shops: Shops,
  wallet: Wallet,
  warehouse: Warehouse,
};

export function MemberEmptyState({
  variant,
  label,
  compact = false,
  children,
}: {
  variant: keyof typeof illustrations;
  label: string;
  compact?: boolean;
  children?: ReactNode;
}) {
  const Illustration = illustrations[variant];
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 px-4",
        compact ? "py-4" : "py-8 sm:py-12",
      )}
    >
      <div role="status" className="flex w-full justify-center">
        <Illustration
          aria-hidden="true"
          focusable="false"
          className={cn("h-auto max-w-full", compact ? "w-32" : "w-44 sm:w-56")}
        />
        <span className="sr-only">{label}</span>
      </div>
      {children}
    </div>
  );
}
