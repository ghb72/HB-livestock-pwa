/**
 * Consistency rules for observed mating records ("montas").
 *
 * A mating observation infers a birth ~283 days later. When the cow actually
 * gives birth well before that inferred date, the observation cannot be the
 * origin of that pregnancy — she was already pregnant when she was seen being
 * mounted. Left alone, such a record hijacks the reproductive calendar: it
 * becomes the cow's "last monta" and paints her as gestating while she is in
 * fact in postpartum.
 *
 * Two outcomes, depending on whether a human confirmed the pregnancy:
 *
 * - Not confirmed → the record is *archived*: excluded from the reproductive
 *   inference and badged in the history. Purely derived, never written.
 * - Confirmed ('Sí') → the observed date is *corrected* to `birth - 283`, which
 *   makes the record describe the pregnancy that actually happened. This is
 *   written, and the original date is kept as a note.
 *
 * The correction is idempotent: with `fecha_monta = birth - 283`, the window
 * test below becomes `birth < birth - 30`, which is false, so a corrected
 * record never enters the window again.
 */

import { addDays, format, subDays } from 'date-fns';
import { formatStoredDate, parseStoredDate } from './date';
import { updateReproductionRecord } from './store';
import type { Animal, ReproductionRecord } from './types';

export const GESTATION_DAYS = 283;

/** How far before the inferred birth a real birth has to fall to contradict the mating. */
export const MONTA_TOLERANCE_DAYS = 30;

export interface MontaCorrection {
	reproduccion_id: string;
	vaca_id: string;
	/** ISO date originally observed. */
	previousMontaDate: string;
	/** ISO date the record is moved to — `birthDate - GESTATION_DAYS`. */
	correctedMontaDate: string;
	/** ISO date of the birth that contradicts the observation. */
	birthDate: string;
	/** Notes as they stand now; the trace line is appended to these. */
	notas: string;
}

export interface MontaReconciliation {
	/**
	 * Mating records that are contradicted and were not confirmed — excluded from
	 * inference. Keyed by `reproduccion_id`, valued with the ISO date of the birth
	 * that contradicts them, so the UI can say why.
	 */
	archived: Map<string, string>;
	/** Contradicted records whose pregnancy was confirmed — their date is rewritten. */
	corrections: MontaCorrection[];
}

function toIsoDate(date: Date): string {
	return format(date, 'yyyy-MM-dd');
}

/**
 * Every known birth date per cow, ascending. Births reach the app two ways: as
 * `fecha_parto_real` on a reproduction record, or as a calf registered with the
 * cow as `madre_id` and no reproduction event of its own.
 */
function birthDatesByCow(records: ReproductionRecord[], animals: Animal[]): Map<string, string[]> {
	const byCow = new Map<string, string[]>();

	const push = (cowId: string, date: string) => {
		const id = cowId?.trim();
		if (!id || !date) return;
		const dates = byCow.get(id);
		if (dates) dates.push(date);
		else byCow.set(id, [date]);
	};

	for (const record of records) {
		if (record.deleted === 0) push(record.vaca_id, record.fecha_parto_real);
	}
	for (const animal of animals) {
		if (animal.deleted === 0) push(animal.madre_id, animal.fecha_nacimiento);
	}

	for (const dates of byCow.values()) dates.sort();
	return byCow;
}

/**
 * Classifies every mating observation against the cow's known births.
 * Pure — reads nothing, writes nothing.
 */
export function planMontaReconciliation(
	records: ReproductionRecord[],
	animals: Animal[]
): MontaReconciliation {
	const births = birthDatesByCow(records, animals);
	const archived = new Map<string, string>();
	const corrections: MontaCorrection[] = [];

	for (const record of records) {
		// A record that carries its own birth is self-consistent; only pending
		// observations can be contradicted.
		if (record.deleted !== 0 || !record.fecha_monta || record.fecha_parto_real) continue;

		const montaDate = parseStoredDate(record.fecha_monta);
		if (!montaDate) continue;

		const cowBirths = births.get(record.vaca_id?.trim() ?? '');
		if (!cowBirths) continue;

		// Births are ISO `yyyy-MM-dd`, so lexicographic order is chronological order.
		const cutoff = toIsoDate(addDays(montaDate, GESTATION_DAYS - MONTA_TOLERANCE_DAYS));
		const birthDate = cowBirths.find(
			(birth) => birth >= record.fecha_monta && birth < cutoff
		);
		if (!birthDate) continue;

		if (record.prenez_confirmada === 'Sí') {
			const corrected = parseStoredDate(birthDate);
			if (!corrected) continue;
			corrections.push({
				reproduccion_id: record.reproduccion_id,
				vaca_id: record.vaca_id,
				previousMontaDate: record.fecha_monta,
				correctedMontaDate: toIsoDate(subDays(corrected, GESTATION_DAYS)),
				birthDate,
				notas: record.notas ?? ''
			});
		} else {
			archived.set(record.reproduccion_id, birthDate);
		}
	}

	return { archived, corrections };
}

function traceLine(correction: MontaCorrection): string {
	const short = (date: string) => formatStoredDate(date, 'dd/MM/yyyy');
	return (
		`Monta corregida automáticamente: ${short(correction.previousMontaDate)} → ` +
		`${short(correction.correctedMontaDate)} (parto ${short(correction.birthDate)})`
	);
}

/**
 * Writes the corrections. `fecha_posible_parto` lands exactly on the birth,
 * since the corrected mating date is the birth minus a full gestation.
 */
export async function applyMontaCorrections(corrections: MontaCorrection[]): Promise<void> {
	for (const correction of corrections) {
		const trace = traceLine(correction);
		await updateReproductionRecord(correction.reproduccion_id, {
			fecha_monta: correction.correctedMontaDate,
			fecha_posible_parto: correction.birthDate,
			notas: correction.notas ? `${correction.notas}\n${trace}` : trace
		});
	}
}
