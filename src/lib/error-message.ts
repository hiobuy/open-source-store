/** Read an error raised by fetch or the business API without assuming its shape. */
export function getErrorMessage(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  if ("message" in error && typeof error.message === "string" && error.message)
    return error.message;
  if ("msg" in error && typeof error.msg === "string") return error.msg;
  return "";
}
