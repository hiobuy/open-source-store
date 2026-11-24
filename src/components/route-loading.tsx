import { default as LoadingCart } from "@/assets/images/loading.svg";

export function RouteLoading() {
  return (
    <div className="bg-background fixed inset-0 z-60 flex items-center justify-center">
      <LoadingCart
        className="route-loading-cart size-36 md:h-42"
        role="img"
        aria-label="Loading"
      />
    </div>
  );
}
