export type InlineScrollDirection = "start" | "end";
type RtlScrollType = "default" | "negative" | "reverse";
let rtlScrollType: RtlScrollType | undefined;
function getRtlScrollType(): RtlScrollType {
  if (rtlScrollType || typeof document === "undefined")
    return rtlScrollType || "default";
  const container = document.createElement("div");
  const child = document.createElement("div");
  container.dir = "rtl";
  container.style.cssText =
    "width:4px;height:1px;overflow:scroll;position:absolute;visibility:hidden;";
  child.style.width = "8px";
  container.appendChild(child);
  document.body.appendChild(container);
  if (container.scrollLeft > 0) {
    rtlScrollType = "default";
  } else {
    container.scrollLeft = 1;
    rtlScrollType = container.scrollLeft === 0 ? "negative" : "reverse";
  }
  container.remove();
  return rtlScrollType;
}
function isRtl(element: HTMLElement): boolean {
  return getComputedStyle(element).direction === "rtl";
}
function getNormalizedScrollLeft(element: HTMLElement): number {
  const max = Math.max(0, element.scrollWidth - element.clientWidth);
  if (!isRtl(element)) return element.scrollLeft;
  switch (getRtlScrollType()) {
    case "negative":
      return max + element.scrollLeft;
    case "reverse":
      return max - element.scrollLeft;
    default:
      return element.scrollLeft;
  }
}
function setNormalizedScrollLeft(
  element: HTMLElement,
  value: number,
  behavior: ScrollBehavior,
) {
  const max = Math.max(0, element.scrollWidth - element.clientWidth);
  const next = Math.min(max, Math.max(0, value));
  let scrollLeft = next;
  if (isRtl(element)) {
    switch (getRtlScrollType()) {
      case "negative":
        scrollLeft = next - max;
        break;
      case "reverse":
        scrollLeft = max - next;
        break;
    }
  }
  element.scrollTo({ left: scrollLeft, behavior });
}
export function getInlineScrollState(element: HTMLElement) {
  const max = Math.max(0, element.scrollWidth - element.clientWidth);
  const position = getNormalizedScrollLeft(element);
  const hasOverflow = max > 1;
  const rtl = isRtl(element);
  return {
    canScrollStart: hasOverflow && (rtl ? position < max - 1 : position > 1),
    canScrollEnd: hasOverflow && (rtl ? position > 1 : position < max - 1),
  };
}
export function scrollInlineBy(
  element: HTMLElement,
  direction: InlineScrollDirection,
  amount: number,
  behavior: ScrollBehavior = "smooth",
) {
  const delta =
    (direction === "end" ? 1 : -1) * (isRtl(element) ? -1 : 1) * amount;
  setNormalizedScrollLeft(
    element,
    getNormalizedScrollLeft(element) + delta,
    behavior,
  );
}
export function scrollInlineTo(
  element: HTMLElement,
  direction: InlineScrollDirection,
  behavior: ScrollBehavior = "smooth",
) {
  const max = Math.max(0, element.scrollWidth - element.clientWidth);
  const target =
    direction === "start"
      ? isRtl(element)
        ? max
        : 0
      : isRtl(element)
        ? 0
        : max;
  setNormalizedScrollLeft(element, target, behavior);
}
