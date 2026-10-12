import type { FieldErrors, RawValues } from "./validation";

// State returned by the car park and product server actions to their forms.
export type FormState = {
  // Increments on every response, so the form remounts with the new values.
  version: number;
  status: "idle" | "error" | "confirm-geocode" | "geocode-failed";
  message?: string;
  fieldErrors?: FieldErrors;
  values?: RawValues;
  geocode?: { formattedAddress: string; lat: number; lng: number };
};

export const INITIAL_FORM_STATE: FormState = { version: 0, status: "idle" };
