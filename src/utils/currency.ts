export interface CurrencyInfo {
  code: string;
  symbol: string;
  rate: number;
}

export const getTimezoneCurrency = (): CurrencyInfo => {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    if (tz.includes("Asia/Kolkata") || tz.includes("Calcutta") || tz.includes("India")) {
      return { code: 'INR', symbol: '₹', rate: 83.0 };
    }
    if (tz.includes("Europe") || tz.includes("London") || tz.includes("GB") || tz.includes("Paris") || tz.includes("Berlin") || tz.includes("Rome") || tz.includes("Madrid")) {
      if (tz.includes("London") || tz.includes("Belfast")) {
        return { code: 'GBP', symbol: '£', rate: 0.79 };
      }
      return { code: 'EUR', symbol: '€', rate: 0.92 };
    }
    if (tz.includes("Canada") || tz.includes("Toronto") || tz.includes("Vancouver") || tz.includes("CA")) {
      return { code: 'CAD', symbol: 'C$', rate: 1.36 };
    }
    if (tz.includes("Australia") || tz.includes("Sydney") || tz.includes("Melbourne") || tz.includes("AU")) {
      return { code: 'AUD', symbol: 'A$', rate: 1.51 };
    }
    if (tz.includes("Japan") || tz.includes("Tokyo")) {
      return { code: 'JPY', symbol: '¥', rate: 155.0 };
    }
  } catch (e) {
    // ignore
  }
  return { code: 'USD', symbol: '$', rate: 1.0 };
};

export const formatPrice = (usdAmount: number, currency: CurrencyInfo): string => {
  const converted = usdAmount * currency.rate;
  if (currency.code === 'JPY' || currency.code === 'INR') {
    return `${currency.symbol}${Math.round(converted).toLocaleString()}`;
  }
  return `${currency.symbol}${converted.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
