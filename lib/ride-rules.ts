export type RideSettings = {
  minFare: number;
  maxFare: number;
  maxPickupMinutes: number;
  currency: string;
  excludedKeywords: string[];
  preferredKeywords: string[];
};

export type RideRequest = {
  text?: string;
  fare?: number;
  currency?: string;
  pickupMinutes?: number;
  destination?: string;
};

export type Decision = {
  eligible: boolean;
  preferred: boolean;
  reason: string;
  fare?: number;
  currency?: string;
  pickupMinutes?: number;
  destination?: string;
};

const number = String.raw`(\d+(?:[.,]\d{1,2})?)`;

export function parseRideRequest(input: string): RideRequest {
  const text = input.replace(/\s+/g, " ").trim();
  const fareMatch = text.match(new RegExp(`(?:fare|price|earnings|\u0642\u064a\u0645\u0629\u0020\u0627\u0644\u0631\u062d\u0644\u0629|\u0627\u0644\u0633\u0639\u0631)\\s*[:：]?\\s*(?:(SAR|SR|ر.س|JOD|د.أ)\\s*)?${number}\\s*(?:(SAR|SR|ر.س|JOD|د.أ))?`, "i"));
  const pickupMatch = text.match(new RegExp(`(?:pickup|pick-up|arrival|arrive|to\u0020pickup|\u0648\u0642\u062a\u0020\u0627\u0644\u0648\u0635\u0648\u0644|\u0648\u0642\u062a\u0020\u0627\u0644\u0627\u0633\u062a\u0644\u0627\u0645)\\D{0,20}${number}\\s*(?:min|mins|minute|minutes|دقيقة|دقائق)`, "i"));
  const currencyToken = fareMatch?.[1] ?? fareMatch?.[3];
  const destinationMatch = text.match(/(?:destination|drop-?off|to|الوجهة|الى|إلى)\s*[:：]?\s*([^,;|]{2,80})/i);
  const normalizedFare = fareMatch?.[2].replace(",", ".");
  const normalizedPickup = pickupMatch?.[1].replace(",", ".");
  const currency = currencyToken?.toUpperCase() === "SR" || currencyToken === "ر.س" ? "SAR" : currencyToken === "د.أ" ? "JOD" : currencyToken?.toUpperCase();

  return {
    text,
    fare: normalizedFare ? Number(normalizedFare) : undefined,
    currency,
    pickupMinutes: normalizedPickup ? Number(normalizedPickup) : undefined,
    destination: destinationMatch?.[1]?.trim(),
  };
}

export function evaluateRide(request: RideRequest, settings: RideSettings): Decision {
  const currency = request.currency ?? settings.currency;
  const base = { fare: request.fare, currency, pickupMinutes: request.pickupMinutes, destination: request.destination };
  if (!Number.isFinite(request.fare) || request.fare === undefined) return { eligible: false, preferred: false, reason: "Fare not clearly identified", ...base };
  if (!Number.isFinite(request.pickupMinutes) || request.pickupMinutes === undefined) return { eligible: false, preferred: false, reason: "Pickup time not clearly identified", ...base };
  if (!request.destination?.trim()) return { eligible: false, preferred: false, reason: "Destination not clearly identified", ...base };
  if (currency !== settings.currency) return { eligible: false, preferred: false, reason: `Currency mismatch (${currency})`, ...base };
  if (request.fare < settings.minFare) return { eligible: false, preferred: false, reason: `Below minimum ${settings.currency} ${settings.minFare}`, ...base };
  if (request.fare > settings.maxFare) return { eligible: false, preferred: false, reason: `Above maximum ${settings.currency} ${settings.maxFare}`, ...base };
  if (request.pickupMinutes > settings.maxPickupMinutes) return { eligible: false, preferred: false, reason: `Pickup exceeds ${settings.maxPickupMinutes} min`, ...base };
  const excluded = settings.excludedKeywords.find((term) => term.trim() && request.destination!.toLocaleLowerCase().includes(term.trim().toLocaleLowerCase()));
  if (excluded) return { eligible: false, preferred: false, reason: `Excluded destination: ${excluded}`, ...base };
  const preferred = settings.preferredKeywords.some((term) => term.trim() && request.destination!.toLocaleLowerCase().includes(term.trim().toLocaleLowerCase()));
  return { eligible: true, preferred, reason: preferred ? "All rules match · preferred destination" : "All configured rules match", ...base };
}

export function evaluateText(text: string, settings: RideSettings): Decision {
  const parsed = parseRideRequest(text);
  return evaluateRide({ ...parsed, destination: parsed.destination }, settings);
}
