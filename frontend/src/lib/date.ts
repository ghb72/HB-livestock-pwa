import { format, isValid, parseISO } from 'date-fns';
import type { Locale } from 'date-fns';

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function todayLocalDate(): string {
	return format(new Date(), 'yyyy-MM-dd');
}

export function parseStoredDate(dateStr: string | null | undefined): Date | null {
	if (!dateStr) return null;

	try {
		const parsed = DATE_ONLY_PATTERN.test(dateStr) ? parseISO(dateStr) : new Date(dateStr);
		return isValid(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

export function formatStoredDate(
	dateStr: string | null | undefined,
	pattern: string,
	locale?: Locale
): string {
	const parsed = parseStoredDate(dateStr);
	if (!parsed) return dateStr ?? '';
	return format(parsed, pattern, locale ? { locale } : undefined);
}
