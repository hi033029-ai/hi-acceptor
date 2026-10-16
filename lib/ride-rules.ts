export type AreaCircle = {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
};

export type RideSettings = {
  minFare: number;
  maxFare: number;
  maxPickupMinutes: number;
  currency: string;
  excludedAreas: AreaCircle[];
  preferredArea: AreaCircle | null;
};

export type RideRequest = {
  text?: string;
  fare?: number;
  currency?: string;
  pickupMinutes?: number;
  destination?: string;
  destinationLatitude?: number;
  destinationLongitude?: number;
};

export type Decision = {
  eligible: boolean;
  preferred: boolean;
  reason: string;
  fare?: number;
  currency?: string;
  pickupMinutes?: number;
  destination?: string;
  matchedExcludedArea?: string;
};

const number = String.raw`(\d+(?:[.,]\d{1,2})?)`;

export function parseRideRequest(input: string): RideRequest {
  const text = input.replace(/\s+/g, " ").trim();
  const fareMatch = text.match(new RegExp(`(?:fare|price|earnings|\u0642\u064a\u0645\u0629\u0020\u0627\u0644\u0631\u062d\u0644\u0629|\u0627\u0644\u0633\u0639\u0631)\\s*[:：]?\\s*(?:(SAR|SR|ر.س)\\s*)?${number}\\s*(?:(SAR|SR|ر.س))?`, "i"));
  const pickupMatch = text.match(new RegExp(`(?:pickup|pick-up|arrival|arrive|to\u0020pickup|\u0648\u0642\u062a\u0020\u0627\u0644\u0648\u0635\u0648\u0644|\u0648\u0642\u062a\u0020\u0627\u0644\u0627\u0633\u062a\u0644\u0627\u0645)\\D{0,20}${number}\\s*(?:min|mins|minute|minutes|دقيقة|دقائق)`, "i"));
  const currencyToken = fareMatch?.[1] ?? fareMatch?.[3];
  const destinationMatch = text.match(/(?:destination|drop-?off|to|الوجهة|الى|إلى)\s*[:：]?\s*([^,;|]{2,80})/i);
  const currency = currencyToken?.toUpperCase() === "SR" || currencyToken === "ر.س" ? "SAR" : currencyToken?.toUpperCase();
  return {
    text,
    fare: fareMatch?.[2] ? Number(fareMatch[2].replace(",", ".")) : undefined,
    currency,
    pickupMinutes: pickupMatch?.[1] ? Number(pickupMatch[1].replace(",", ".")) : undefined,
    destination: destinationMatch?.[1]?.trim(),
  };
}

export function distanceMeters(aLat: number, aLng: number, bLat: number, bLng: number) {
  const radians = (value: number) => (value * Math.PI) / 180;
  const dLat = radians(bLat - aLat);
  const dLng = radians(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(aLat)) * Math.cos(radians(bLat)) * Math.sin(dLng / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function evaluateRide(request: RideRequest, settings: RideSettings): Decision {
  const currency = request.currency ?? settings.currency;
  const base = { fare: request.fare, currency, pickupMinutes: request.pickupMinutes, destination: request.destination };
  if (!Number.isFinite(settings.minFare) || !Number.isFinite(settings.maxFare) || settings.maxFare <= settings.minFare) return { eligible: false, preferred: false, reason: "Set a valid minimum and maximum fare first", ...base };
  if (!Number.isFinite(request.fare) || request.fare === undefined) return { eligible: false, preferred: false, reason: "Fare not clearly identified", ...base };
  if (!Number.isFinite(request.pickupMinutes) || request.pickupMinutes === undefined) return { eligible: false, preferred: false, reason: "Pickup time not clearly identified", ...base };
  if (!request.destination?.trim()) return { eligible: false, preferred: false, reason: "Destination not clearly identified", ...base };
  if (currency !== settings.currency) return { eligible: false, preferred: false, reason: `Currency mismatch (${currency})`, ...base };
  if (request.fare < settings.minFare) return { eligible: false, preferred: false, reason: `Below minimum ${settings.currency} ${settings.minFare}`, ...base };
  if (request.fare > settings.maxFare) return { eligible: false, preferred: false, reason: `Above maximum ${settings.currency} ${settings.maxFare}`, ...base };
  if (request.pickupMinutes > settings.maxPickupMinutes) return { eligible: false, preferred: false, reason: `Pickup exceeds ${settings.maxPickupMinutes} min`, ...base };

  let excludedArea: AreaCircle | undefined;
  if (settings.excludedAreas.length > 0) {
    const hasPoint = Number.isFinite(request.destinationLatitude) && Number.isFinite(request.destinationLongitude);
    if (!hasPoint) return { eligible: false, preferred: false, reason: "Destination location could not be verified against your excluded circles", ...base };
    excludedArea = settings.excludedAreas.find((area) => distanceMeters(area.latitude, area.longitude, request.destinationLatitude!, request.destinationLongitude!) <= area.radiusMeters);
    if (excludedArea) return { eligible: false, preferred: false, reason: `Inside excluded area: ${excludedArea.label}`, matchedExcludedArea: excludedArea.label, ...base };
  }
  const preferred = Boolean(settings.preferredArea && Number.isFinite(request.destinationLatitude) && Number.isFinite(request.destinationLongitude) && distanceMeters(settings.preferredArea.latitude, settings.preferredArea.longitude, request.destinationLatitude!, request.destinationLongitude!) <= settings.preferredArea.radiusMeters);
  return { eligible: true, preferred, reason: preferred ? "All rules match · inside preferred area" : "All configured rules match", ...base };
}

export function evaluateText(text: string, settings: RideSettings): Decision {
  return evaluateRide(parseRideRequest(text), settings);
}
