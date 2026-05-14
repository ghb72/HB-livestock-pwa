import { differenceInCalendarDays, differenceInCalendarMonths, format, isValid, parseISO } from 'date-fns';
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

export function formatAgeFromDate(dateStr: string | null | undefined, today = new Date()): string {
	const birthDate = parseStoredDate(dateStr);
	if (!birthDate) return '';

	const days = differenceInCalendarDays(today, birthDate);
	if (days < 0) return '';
	if (days < 30) return `${days} ${days === 1 ? 'día' : 'días'}`;

	const totalMonths = differenceInCalendarMonths(today, birthDate);
	if (totalMonths < 12) {
		return `${totalMonths} ${totalMonths === 1 ? 'mes' : 'meses'}`;
	}

	const years = Math.floor(totalMonths / 12);
	const months = totalMonths % 12;
	if (months === 0) {
		return `${years} ${years === 1 ? 'año' : 'años'}`;
	}

	return `${years} ${years === 1 ? 'año' : 'años'} ${months} ${months === 1 ? 'mes' : 'meses'}`;
}
