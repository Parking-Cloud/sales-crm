// CRM-03: warn (never block) when the seats of active subscription products
// exceed the car park's sellable seats.
export function subscriptionSeats(
  products: { tipo: string; attivo: boolean; posti_disponibili: number | null }[],
): number {
  return products
    .filter((product) => product.attivo && product.tipo === "abbonamento")
    .reduce((sum, product) => sum + (product.posti_disponibili ?? 0), 0);
}

export function seatsExceeded(sellable: number | null, seats: number): boolean {
  return sellable !== null && seats > sellable;
}
