// lib/currency.ts
export const DEFAULT_CURRENCY = "USD";
export const DEFAULT_LOCALE = "en-US";

export const COUNTRY_TO_CURRENCY: Record<string, { currency: string; locale: string }> = {
  US: { currency: "USD", locale: "en-US" },
  GB: { currency: "GBP", locale: "en-GB" },
  KE: { currency: "KES", locale: "en-KE" },
  ZA: { currency: "ZAR", locale: "en-ZA" },
  NG: { currency: "NGN", locale: "en-NG" },
  // ...extend
};

export function currencyForCountry(countryCode?: string) {
  if (!countryCode) return { currency: DEFAULT_CURRENCY, locale: DEFAULT_LOCALE };
  return COUNTRY_TO_CURRENCY[countryCode.toUpperCase()] ?? { currency: DEFAULT_CURRENCY, locale: DEFAULT_LOCALE };
}
