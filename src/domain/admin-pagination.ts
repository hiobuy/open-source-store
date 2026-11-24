export const ADMIN_PAGE_SIZES = [5, 10, 20, 25, 50] as const;

export function adminPage(value: unknown) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : 1;
}

export function adminPageSize(value: unknown, fallback = 20) {
  const number = Number(value);
  return ADMIN_PAGE_SIZES.some(size => size === number) ? number : fallback;
}

export function paginationWindow(page: number, pageSize: number, total: number) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(adminPage(page), pages);
  const numbers = pages <= 7 ? Array.from({ length: pages }, (_, index) => index + 1) :
    [...new Set([1, pages, ...Array.from({ length: 5 }, (_, index) => Math.min(Math.max(current - 2, 1), pages - 4) + index)])].sort((a, b) => a - b);
  const buttons: (number | "ellipsis")[] = [];
  for (const number of numbers) {
    const previous = buttons.at(-1);
    if (typeof previous === "number" && number - previous > 1) buttons.push("ellipsis");
    buttons.push(number);
  }
  return { page: current, pages, from: total ? (current - 1) * pageSize + 1 : 0, to: Math.min(total, current * pageSize), buttons };
}

export function paginateAdminItems<T>(items: T[], page: number, pageSize: number) {
  const current = paginationWindow(page, pageSize, items.length).page;
  return { items: items.slice((current - 1) * pageSize, current * pageSize), page: current, pageSize, total: items.length };
}
