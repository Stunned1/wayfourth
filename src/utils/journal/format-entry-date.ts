/**
 * Formats a journal entry date string for display.
 *
 * If the input is an ISO date string (`YYYY-MM-DD`), it renders a localized, friendly label.
 * Otherwise, it returns the input as-is.
 */
export function formatEntryDate(entryDate: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(entryDate)) {
    const [y, m, d] = entryDate.split('-').map((v) => Number(v));
    const dt = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
    return dt.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  return entryDate;
}

