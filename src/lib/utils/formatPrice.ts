export function formatPrice(
  isFree: boolean,
  priceMin: number | null,
  priceMax: number | null,
  ticketUrl: string | null
): string {
  if (isFree) return 'Free';
  if (priceMin !== null && priceMax !== null) {
    return priceMin === priceMax
      ? `$${priceMin.toFixed(0)}`
      : `$${priceMin.toFixed(0)}–$${priceMax.toFixed(0)}`;
  }
  if (priceMin !== null) return `From $${priceMin.toFixed(0)}`;
  if (ticketUrl) return 'View Tickets';
  return '—';
}
