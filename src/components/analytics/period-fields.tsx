"use client";

import { useState } from "react";
import { Field, Input, Select } from "@/components/ui/field";
import { PERIOD_PRESETS, type PeriodPreset } from "@/lib/analytics/period";

// Period of the Analytics filters: the start and end dates appear only for a
// custom period (the presets compute them).
export function PeriodFields({ preset, da, a }: { preset: PeriodPreset; da: string; a: string }) {
  const [value, setValue] = useState<PeriodPreset>(preset);
  return (
    <>
      <Field id="analytics-periodo" label="Periodo">
        <Select id="analytics-periodo" name="periodo" value={value} onChange={(event) => setValue(event.target.value as PeriodPreset)}>
          {Object.entries(PERIOD_PRESETS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
      {value === "personalizzato" && (
        <>
          <Field id="analytics-da" label="Dal">
            <Input id="analytics-da" name="da" type="date" defaultValue={da} required />
          </Field>
          <Field id="analytics-a" label="Al">
            <Input id="analytics-a" name="a" type="date" defaultValue={a} required />
          </Field>
        </>
      )}
    </>
  );
}
