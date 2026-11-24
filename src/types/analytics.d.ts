interface Window {
  __ga4Enabled?: boolean;
  __facebookPixelEnabled?: boolean;
  fbq?: (
    command: string,
    event: string,
    params?: Record<string, unknown>,
  ) => void;
  gtag?: (
    command: string,
    event: string,
    params?: Record<string, unknown>,
  ) => void;
}
