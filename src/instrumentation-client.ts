export const ROUTER_TRANSITION_START_EVENT =
  "storefront-router-transition-start";

export function onRouterTransitionStart(url: string) {
  window.dispatchEvent(
    new CustomEvent(ROUTER_TRANSITION_START_EVENT, { detail: url }),
  );
}
