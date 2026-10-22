// A page announced in the menu, not built yet.
export function PagePlaceholder({ title, detail }: { title: string; detail?: string }) {
  return (
    <>
      <h1 className="text-h2 font-semibold leading-tight">{title}</h1>
      <p className="mt-2 text-body text-black-60">In arrivo{detail ? `: ${detail}` : "."}</p>
    </>
  );
}
