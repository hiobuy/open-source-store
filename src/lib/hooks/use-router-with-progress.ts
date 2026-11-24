"use client";
import { useRouter as useNextRouter } from "next/navigation";
/** 派发导航开始事件，供 RouteProgressBar 监听 */
export const NAVIGATION_START_EVENT = "next-navigation-start";
export function useRouterWithProgress() {
  const router = useNextRouter();
  return {
    ...router,
    push: (
      href: string,
      options?: {
        scroll?: boolean;
      },
    ) => {
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent(NAVIGATION_START_EVENT, { detail: href }),
        );
      }
      return router.push(href, options);
    },
    replace: (
      href: string,
      options?: {
        scroll?: boolean;
      },
    ) => {
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent(NAVIGATION_START_EVENT, { detail: href }),
        );
      }
      return router.replace(href, options);
    },
  };
}
