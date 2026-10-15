import { MailIcon, PhoneIcon, TaskIcon } from "@/components/ui/icons";
import { STEP_TYPE_LABELS, waitLabel, type StepType } from "@/lib/cadences/schedule";

const ICONS: Record<StepType, typeof PhoneIcon> = { chiamata: PhoneIcon, email: MailIcon, attivita: TaskIcon };

// The steps of a cadence in a row: icon with the type in words and the
// wait from the previous step.
export function StepStrip({ steps }: { steps: { id: string; tipo: StepType; attesaGiorni: number }[] }) {
  if (steps.length === 0) return <p className="text-caption text-black-60">Nessun passo.</p>;
  return (
    <ol className="flex flex-wrap items-center gap-1" aria-label="Passi">
      {steps.map((step, index) => {
        const Icon = ICONS[step.tipo];
        return (
          <li key={step.id} className="flex items-center gap-1">
            {index > 0 && <span aria-hidden="true" className="text-black-40">→</span>}
            <span className="inline-flex items-center gap-1 rounded-pill border border-grey-60 bg-white px-2 py-0.5 text-caption text-black-80">
              <Icon className="text-brand-blue" size={14} />
              <span className="font-semibold">{STEP_TYPE_LABELS[step.tipo]}</span>
              <span className="text-black-60">{waitLabel(step.attesaGiorni)}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
