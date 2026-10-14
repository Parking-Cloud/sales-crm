import { NUMBER_FORMAT_IT } from "@/lib/format";

// Maximum distance of the car parks shown for a location, in metres.
// Same key, default and limits as the app_settings check constraint.
export const MAX_PARKING_DISTANCE_KEY = "distanza_massima_parcheggi_m";
export const MAX_PARKING_DISTANCE_DEFAULT_M = 5000;
export const MAX_PARKING_DISTANCE_MIN_M = 500;
export const MAX_PARKING_DISTANCE_MAX_M = 20000;

// "5 km", "0,5 km", "12,5 km".
export function formatKm(meters: number): string {
  return `${NUMBER_FORMAT_IT.format(meters / 1000)} km`;
}
