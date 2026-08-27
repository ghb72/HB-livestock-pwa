/**
 * Reproduction rules: what the herd data implies, and what it contradicts.
 *
 * Everything here is derived from the two tables the app already keeps. The
 * load-bearing idea is that a cow's calvings are recorded in *two* places and
 * neither one alone is complete:
 *
 * - `reproduction.fecha_parto_real`, written when a birth is registered as an
 *   event, and
 * - `animals.fecha_nacimiento` of any calf carrying her as `madre_id`, which is
 *   all that exists for animals imported or created before the birth event flow.
 *
 * Reading only the first is what made a cow with five calves report one, and a
 * healthy cow get flagged for culling. `birthsByCow` merges them, deduplicated
 * by calf identity so a calf recorded in both places is not counted twice.
 *
 * On top of that sit three consistency rules, each one detecting a state that
 * cannot physically be true and each one idempotent — once applied, the record
 * no longer meets its own condition:
 *
 * 1. A mating observation contradicted by a birth too soon after it. She was
 *    already pregnant when she was seen being mounted. Archived if the pregnancy
 *    was never confirmed, otherwise its date is corrected to the real birth
 *    minus a full gestation.
 * 2. A confirmed pregnancy followed by another mating inside the gestation it
 *    claimed. If they bred her again, the confirmation was wrong; it reverts to
 *    'No'.
 * 3. Warnings for an event being entered right now: a mating on a cow already
 *    carrying a confirmed pregnancy or too soon after calving, and a calving too
 *    soon after the previous one. These only advise — field reality outranks the
 *    rule, and the user can always save.
 */

import { addDays, differenceInDays, format, subDays } from 'date-fns';
import { formatStoredDate, parseStoredDate } from './date';
import { updateReproductionRecord } from './store';
import type { Animal, ReproductionRecord } from './types';

export const GESTATION_DAYS = 283;

/** How far before the inferred birth a real birth has to fall to contradict the mating. */
export const MONTA_TOLERANCE_DAYS = 30;

/**
 * Voluntary waiting period. Uterine involution finishes around day 40-45, so a
 * mating logged before this cannot have produced a pregnancy.
 */
export const POSTPARTUM_WAIT_DAYS = 45;

/**
 * Shortest interval between two calvings that is biologically possible: she has
 * to get through the waiting period before conceiving, and then carry to term.
 */
export const MIN_CALVING_INTERVAL_DAYS = GESTATION_DAYS + POSTPARTUM_WAIT_DAYS;

export interface BirthEvent {
	/** ISO date of the calving. */
	date: string;
	/** The calf, when known. Empty for a birth event recorded without one. */
	calfId: string;
	/** True when it came from a reproduction record rather than the calf's own row. */
	fromRecord: boolean;
}

function toIsoDate(date: Date): string {
	return format(date, 'yyyy-MM-dd');
}

/**
 * Every calving per cow, ascending, deduplicated.
 *
 * A calf registered through the birth flow exists on both sides — as the
 * record's `cria_id` + `fecha_parto_real` and as its own `fecha_nacimiento`
 * under `madre_id`. Deduplication is by calf identity, not by date: two calves
 * can share a birth date (twins, or two cows calving the same day), while the
 * same calf can be dated slightly differently in the two places.
 */
export function birthsByCow(
	records: ReproductionRecord[],
	animals: Animal[]
): Map<string, BirthEvent[]> {
	const byCow = new Map<string, BirthEvent[]>();
	const claimedCalves = new Set<string>();

	const push = (cowId: string, event: BirthEvent) => {
		const id = cowId?.trim();
		if (!id || !event.date) return;
		const events = byCow.get(id);
		if (events) events.push(event);
		else byCow.set(id, [event]);
	};

	for (const record of records) {
		if (record.deleted !== 0 || !record.fecha_parto_real) continue;
		const calfId = record.cria_id?.trim() ?? '';
		if (calfId) claimedCalves.add(calfId);
		push(record.vaca_id, { date: record.fecha_parto_real, calfId, fromRecord: true });
	}

	for (const animal of animals) {
		if (animal.deleted !== 0 || claimedCalves.has(animal.animal_id)) continue;
		push(animal.madre_id, {
			date: animal.fecha_nacimiento,
			calfId: animal.animal_id,
			fromRecord: false
		});
	}

	for (const events of byCow.values()) events.sort((a, b) => a.date.localeCompare(b.date));
	return byCow;
}

// ── Reconciliation ───────────────────────────────────────

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

export interface PrenezRevocation {
	reproduccion_id: string;
	vaca_id: string;
	/** ISO date of the mating whose confirmation is being withdrawn. */
	montaDate: string;
	/** ISO date of the later mating that contradicts it. */
	laterMontaDate: string;
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
	/** Confirmations withdrawn because the cow was bred again mid-gestation. */
	revocations: PrenezRevocation[];
}

/**
 * Classifies every mating observation against the cow's births and later
 * matings. Pure — reads nothing, writes nothing.
 */
export function planMontaReconciliation(
	records: ReproductionRecord[],
	animals: Animal[]
): MontaReconciliation {
	const births = birthsByCow(records, animals);
	const archived = new Map<string, string>();
	const corrections: MontaCorrection[] = [];
	const revocations: PrenezRevocation[] = [];

	const active = records.filter((r) => r.deleted === 0);

	for (const record of active) {
		// A record that carries its own birth is self-consistent; only pending
		// observations can be contradicted.
		if (!record.fecha_monta || record.fecha_parto_real) continue;

		const montaDate = parseStoredDate(record.fecha_monta);
		if (!montaDate) continue;

		const cowBirths = births.get(record.vaca_id?.trim() ?? '');

		// Births are ISO `yyyy-MM-dd`, so lexicographic order is chronological order.
		const cutoff = toIsoDate(addDays(montaDate, GESTATION_DAYS - MONTA_TOLERANCE_DAYS));
		const birthDate = cowBirths?.find(
			(birth) => birth.date >= record.fecha_monta && birth.date < cutoff
		)?.date;

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

	// Second pass, because it consults `archived`: an archived mating is not
	// evidence that the cow was bred again, so it cannot revoke a confirmation.
	// Records already handled above are settled and left alone.
	const handled = new Set([...archived.keys(), ...corrections.map((c) => c.reproduccion_id)]);

	for (const record of active) {
		if (handled.has(record.reproduccion_id)) continue;
		if (record.prenez_confirmada !== 'Sí' || record.fecha_parto_real || !record.fecha_monta) continue;

		const montaDate = parseStoredDate(record.fecha_monta);
		if (!montaDate) continue;

		// Breeding her again inside the gestation this record claimed means the
		// confirmation was wrong. A mating past day 283 is simply the next cycle.
		const gestationEnd = toIsoDate(addDays(montaDate, GESTATION_DAYS));
		const laterMonta = active
			.filter(
				(other) =>
					other.reproduccion_id !== record.reproduccion_id &&
					other.vaca_id === record.vaca_id &&
					!archived.has(other.reproduccion_id) &&
					!!other.fecha_monta &&
					other.fecha_monta > record.fecha_monta &&
					other.fecha_monta < gestationEnd
			)
			.sort((a, b) => a.fecha_monta.localeCompare(b.fecha_monta))[0];

		if (laterMonta) {
			revocations.push({
				reproduccion_id: record.reproduccion_id,
				vaca_id: record.vaca_id,
				montaDate: record.fecha_monta,
				laterMontaDate: laterMonta.fecha_monta,
				notas: record.notas ?? ''
			});
		}
	}

	return { archived, corrections, revocations };
}

const shortDate = (date: string) => formatStoredDate(date, 'dd/MM/yyyy');

function correctionTrace(correction: MontaCorrection): string {
	return (
		`Monta corregida automáticamente: ${shortDate(correction.previousMontaDate)} → ` +
		`${shortDate(correction.correctedMontaDate)} (parto ${shortDate(correction.birthDate)})`
	);
}

/**
 * The note left on a withdrawn confirmation. Offered to the user pre-filled and
 * editable when the withdrawal happens through the form, so they can record why
 * — a loss or an abortion is the usual reason a bred cow comes back into heat.
 */
export function revocationNote(montaDate: string, laterMontaDate: string): string {
	return (
		`Preñez anulada automáticamente: la monta del ${shortDate(montaDate)} se confirmó, ` +
		`pero se registró una nueva monta el ${shortDate(laterMontaDate)}, dentro de la ` +
		`gestación esperada. Aclarar si hubo aborto o pérdida.`
	);
}

function appendNote(notas: string, line: string): string {
	return notas ? `${notas}\n${line}` : line;
}

/**
 * Writes the corrections and revocations. For a correction,
 * `fecha_posible_parto` lands exactly on the birth, since the corrected mating
 * date is the birth minus a full gestation.
 */
export async function applyMontaReconciliation(
	plan: Pick<MontaReconciliation, 'corrections' | 'revocations'>
): Promise<void> {
	for (const correction of plan.corrections) {
		await updateReproductionRecord(correction.reproduccion_id, {
			fecha_monta: correction.correctedMontaDate,
			fecha_posible_parto: correction.birthDate,
			notas: appendNote(correction.notas, correctionTrace(correction))
		});
	}

	for (const revocation of plan.revocations) {
		await updateReproductionRecord(revocation.reproduccion_id, {
			prenez_confirmada: 'No',
			notas: appendNote(
				revocation.notas,
				revocationNote(revocation.montaDate, revocation.laterMontaDate)
			)
		});
	}
}

// ── Form-time warnings ───────────────────────────────────

export type MontaWarning =
	| {
			kind: 'prenez-vigente';
			record: ReproductionRecord;
			/** ISO date the standing pregnancy is due. */
			expectedBirth: string;
			/** Pre-filled, editable note for the confirmation about to be withdrawn. */
			suggestedNote: string;
	  }
	| {
			kind: 'recien-parida';
			/** ISO date of the calving. */
			birthDate: string;
			daysPostpartum: number;
	  };

/**
 * Physically impossible situations for a mating being entered right now. These
 * never block: a cow that aborted, a birth nobody recorded, or a mistyped date
 * all produce a real mating the user still has to be able to save.
 */
export function checkMontaWarnings(
	cowId: string,
	montaDate: string,
	records: ReproductionRecord[],
	animals: Animal[],
	excludeRecordId = ''
): MontaWarning[] {
	const cow = cowId?.trim();
	const parsedMonta = parseStoredDate(montaDate);
	if (!cow || !parsedMonta) return [];

	const warnings: MontaWarning[] = [];

	// Already carrying a confirmed pregnancy that would still be running.
	const standing = records
		.filter(
			(r) =>
				r.deleted === 0 &&
				r.reproduccion_id !== excludeRecordId &&
				r.vaca_id?.trim() === cow &&
				r.prenez_confirmada === 'Sí' &&
				!r.fecha_parto_real &&
				!!r.fecha_monta &&
				r.fecha_monta < montaDate &&
				montaDate < toIsoDate(addDays(parseStoredDate(r.fecha_monta) ?? parsedMonta, GESTATION_DAYS))
		)
		.sort((a, b) => b.fecha_monta.localeCompare(a.fecha_monta))[0];

	if (standing) {
		const standingDate = parseStoredDate(standing.fecha_monta);
		warnings.push({
			kind: 'prenez-vigente',
			record: standing,
			expectedBirth:
				standing.fecha_posible_parto ||
				(standingDate ? toIsoDate(addDays(standingDate, GESTATION_DAYS)) : ''),
			suggestedNote: revocationNote(standing.fecha_monta, montaDate)
		});
	}

	// Bred too soon after calving to have conceived.
	const lastBirth = birthsByCow(records, animals)
		.get(cow)
		?.filter((birth) => birth.date <= montaDate)
		.at(-1);

	if (lastBirth) {
		const birthDateObj = parseStoredDate(lastBirth.date);
		const daysPostpartum = birthDateObj ? differenceInDays(parsedMonta, birthDateObj) : null;
		if (daysPostpartum !== null && daysPostpartum < POSTPARTUM_WAIT_DAYS) {
			warnings.push({ kind: 'recien-parida', birthDate: lastBirth.date, daysPostpartum });
		}
	}

	return warnings;
}

export interface PartoWarning {
	kind: 'intervalo-corto';
	/** ISO date of the calving immediately before the one being entered. */
	previousBirth: string;
	daysSincePrevious: number;
}

/**
 * The calving counterpart of `checkMontaWarnings`: a birth landing less than a
 * waiting period plus a gestation after the previous one cannot be the same
 * cow's next calf. Same-day births are twins, not a short interval. Advisory
 * only, like the mating warnings.
 */
export function checkPartoWarnings(
	cowId: string,
	partoDate: string,
	records: ReproductionRecord[],
	animals: Animal[],
	excludeRecordId = ''
): PartoWarning[] {
	const cow = cowId?.trim();
	const parsedParto = parseStoredDate(partoDate);
	if (!cow || !parsedParto) return [];

	// When editing an existing calving, the birth it already describes is not a
	// previous calving — and it is recorded twice, on the record and on the calf.
	const ownCalfId =
		records.find((r) => r.reproduccion_id === excludeRecordId)?.cria_id?.trim() ?? '';

	const previous = birthsByCow(
		excludeRecordId ? records.filter((r) => r.reproduccion_id !== excludeRecordId) : records,
		ownCalfId ? animals.filter((a) => a.animal_id !== ownCalfId) : animals
	)
		.get(cow)
		?.filter((birth) => birth.date < partoDate)
		.at(-1);

	if (!previous) return [];

	const previousDate = parseStoredDate(previous.date);
	if (!previousDate) return [];

	const daysSincePrevious = differenceInDays(parsedParto, previousDate);
	if (daysSincePrevious >= MIN_CALVING_INTERVAL_DAYS) return [];

	return [{ kind: 'intervalo-corto', previousBirth: previous.date, daysSincePrevious }];
}
