import { differenceInCalendarDays, isValid, parseISO } from 'date-fns';

export function getRecorridoTitleSuffix(fecha: string, now: Date = new Date()): string {
	if (!fecha) return '';

	const parsedDate = parseISO(fecha);
	if (!isValid(parsedDate)) return '';

	const daysAgo = differenceInCalendarDays(now, parsedDate);

	if (daysAgo === 0) return 'de hoy';
	if (daysAgo === 1) return 'de ayer';
	if (daysAgo === 2) return 'de antier';
	if (daysAgo > 2 && daysAgo < 7) return `de hace ${daysAgo} dias`;

	return '';
}

export function getRecorridoRelativeLabel(fecha: string, now: Date = new Date()): string {
	if (!fecha) return '';

	const parsedDate = parseISO(fecha);
	if (!isValid(parsedDate)) return '';

	const daysAgo = differenceInCalendarDays(now, parsedDate);

	if (daysAgo === 0) return 'Hoy';
	if (daysAgo === 1) return 'Ayer';
	if (daysAgo === 2) return 'Antier';
	if (daysAgo > 2 && daysAgo < 7) return `Hace ${daysAgo} dias`;

	return '';
}

export function formatRecorridoTitle(fecha: string, now: Date = new Date()): string {
	const suffix = getRecorridoTitleSuffix(fecha, now);
	return suffix ? `Recorrido ${suffix}` : 'Recorrido';
}