import { Alert } from "@/components/ui/alert";

// Shown on the pages of a disabled feature (block 1a-9).
export function FeatureDisabled({ title }: { title: string }) {
  return (
    <>
      <h1 className="text-h2 leading-tight font-semibold">{title}</h1>
      <Alert tone="info" title="Funzione disattivata" className="mt-6">
        Questa funzione non è più nel menu. I dati restano salvati.
      </Alert>
    </>
  );
}
