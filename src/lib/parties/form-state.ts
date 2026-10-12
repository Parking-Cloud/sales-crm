import type { FieldErrors, RawValues } from "@/lib/parking/validation";
import type { DuplicateMatch } from "./queries";

// State returned by the party, location and contact server actions.
export type PartyFormState = {
  version: number;
  status: "idle" | "error" | "duplicate-block" | "duplicate-warning" | "confirm-geocode" | "geocode-failed";
  message?: string;
  fieldErrors?: FieldErrors;
  values?: RawValues;
  duplicates?: DuplicateMatch[];
  geocode?: { formattedAddress: string; lat: number; lng: number };
};

export const INITIAL_PARTY_FORM_STATE: PartyFormState = { version: 0, status: "idle" };
