type PagePlaceholderProps = {
  title: string;
};

export function PagePlaceholder({ title }: PagePlaceholderProps) {
  return (
    <>
      <h1 className="text-h2 font-semibold leading-tight">{title}</h1>
      <p className="mt-2 text-body text-black-60">
        Disponibile nei prossimi rilasci
      </p>
    </>
  );
}
