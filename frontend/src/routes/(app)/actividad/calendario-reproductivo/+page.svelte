<script lang="ts">
	import {
		AlertTriangle,
		CheckCircle,
		Clock,
		Heart,
		HelpCircle,
		ChevronDown,
		ChevronUp,
		Baby,
		Pencil
	} from 'lucide-svelte';
	import BackButton from '$lib/components/BackButton.svelte';
	import {
		differenceInDays,
		addMonths,
		subMonths,
		format,
		parseISO,
		isValid
	} from 'date-fns';
	import { es } from 'date-fns/locale';
	import { db } from '$lib/db';
	import { getAllPhotos } from '$lib/store';
	import { formatStoredDate, todayLocalDate } from '$lib/date';
	import { formatTagId } from '$lib/helpers';
	import {
		applyMontaReconciliation,
		birthsByCow,
		calvingIntervals,
		planMontaReconciliation,
		BREEDING_AGE_YEARS,
		GESTATION_DAYS,
		RECENT_INTERVALS,
		type BirthEvent,
		type MontaCorrection,
		type PrenezRevocation
	} from '$lib/reproduction';
	import type { Animal, ReproductionRecord } from '$lib/types';

	// ── Constants ──
	const RECENT_BIRTH_DAYS = 60;
	/**
	 * A cow sold this soon after her last calving was still productive when she
	 * left, so her intervals describe the herd's current performance. Sold longer
	 * ago than this, she was already out of the reproductive cycle.
	 */
	const SOLD_COW_HISTORY_DAYS = 365;
	const OPEN_ALERT_DAYS = 170;
	const WEANING_WINDOW_START_DAYS = 115;
	const WEANING_WINDOW_END_DAYS = 160;
	const HEAT_WINDOW_START_DAYS = 130;
	const HEAT_WINDOW_END_DAYS = 170;
	const CULL_EFFICIENCY = 0.6;

	// ── Types ──
	type Semaforo = 'verde' | 'azul' | 'amarillo' | 'rojo' | 'gris';

	interface CowStatus {
		cow: Animal;
		semaforo: Semaforo;
		semaforoLabel: string;
		lastMontaDate: string | null;
		lastPartoDate: string | null;
		lastCalfBirthDate: string | null;
		lastBirthReferenceDate: string | null;
		daysSinceLastBirth: number | null;
		nextExpectedParto: string | null;
		daysOpen: number | null;
		records: ReproductionRecord[];
		births: BirthEvent[];
	}

	type CowStatusBase = Omit<
		CowStatus,
		| 'cow'
		| 'records'
		| 'births'
		| 'lastCalfBirthDate'
		| 'lastBirthReferenceDate'
		| 'daysSinceLastBirth'
	>;

	/**
	 * Anything that can contribute calving intervals to the herd IEP. Cows on the
	 * page are one source; cows sold while still productive are the other, and
	 * they have no status of their own.
	 */
	interface IEPSubject {
		births: BirthEvent[];
		nextExpectedParto: string | null;
		ageYears: number | null;
	}

	interface IEPResult {
		/** Days, from her most recent intervals — or projected when she has none. */
		days: number | null;
		/** True when `days` comes from an expected birth rather than two real calvings. */
		projected: boolean;
		/** Mean over every interval of her life; null below two calvings. */
		lifetime: number | null;
		/** Why there is no value at all, phrased for the card. */
		reason: string;
	}

	interface HerdKPIs {
		totalCows: number;
		gestatingConfirmed: number;
		gestatingProbable: number;
		vacant: number;
		nearWeaning: number;
		recentBirth: number;
		noHistory: number;
		avgIEP: number | null;
		avgIEPProjected: boolean;
		avgIEPLifetime: number | null;
		/** Cows the average is actually built from, and how many could contribute. */
		iepCows: number;
		iepEligible: number;
		birthRate12m: number | null;
		breedingCows: number;
	}

	// ── Helpers ──
	function safeDate(dateStr: string | null | undefined): Date | null {
		if (!dateStr) return null;
		try {
			const d = parseISO(dateStr);
			return isValid(d) ? d : null;
		} catch {
			return null;
		}
	}

	function ageInYears(fechaNacimiento: string): number | null {
		const d = safeDate(fechaNacimiento);
		if (!d) return null;
		return differenceInDays(new Date(), d) / 365.25;
	}

	function daysSince(dateStr: string | null | undefined, today: Date): number | null {
		const d = safeDate(dateStr);
		if (!d) return null;
		return differenceInDays(today, d);
	}

	function isWithinDaysRange(days: number | null, minDays: number, maxDays: number): boolean {
		return days !== null && days >= minDays && days <= maxDays;
	}

	function hasCurrentGestation(status: CowStatus): boolean {
		return status.semaforo === 'azul' || status.semaforo === 'amarillo';
	}

	function inferSemaforo(
		allRecords: ReproductionRecord[],
		today: Date,
		archived: ReadonlyMap<string, string>,
		births: BirthEvent[]
	): CowStatusBase {
		// A monta contradicted by a birth never happened as recorded, so it must not
		// become the cow's last monta nor drive her expected birth. Neither may a
		// mating whose pregnancy was explicitly ruled out.
		const records = allRecords.filter(
			(r) => !archived.has(r.reproduccion_id) && r.prenez_confirmada !== 'No'
		);

		if (records.length === 0 && births.length === 0) {
			return {
				semaforo: 'gris',
				semaforoLabel: 'Sin historial',
				lastMontaDate: null,
				lastPartoDate: null,
				nextExpectedParto: null,
				daysOpen: null
			};
		}

		const sorted = [...records].sort((a, b) =>
			(b.fecha_monta || '').localeCompare(a.fecha_monta || '')
		);

		// Calvings come from both tables — see birthsByCow. Reading only the
		// reproduction records here is what let a birth registered as a calf leave a
		// stale mating in charge of the cow's status.
		const partosDesc = [...births].sort((a, b) => b.date.localeCompare(a.date));

		const lastPartoDate = partosDesc[0]?.date ?? null;
		const lastPartoDateObj = safeDate(lastPartoDate);

		const lastMontaRecord = sorted.find((r) => {
			const montaDate = safeDate(r.fecha_monta);
			if (!montaDate) return false;
			return !partosDesc.some((p) => {
				const pd = safeDate(p.date);
				return pd && pd > montaDate;
			});
		});

		const lastMontaDate = lastMontaRecord?.fecha_monta ?? null;
		const lastMontaDateObj = safeDate(lastMontaDate);
		const nextExpectedParto =
			lastMontaRecord?.fecha_posible_parto ??
			(lastMontaDateObj
				? format(
						new Date(lastMontaDateObj.getTime() + GESTATION_DAYS * 86_400_000),
						'yyyy-MM-dd'
					)
				: null);

		let daysOpen: number | null = null;
		if (lastPartoDateObj) {
			const reference = lastMontaDateObj ?? today;
			daysOpen = differenceInDays(reference, lastPartoDateObj);
		}

		if (lastPartoDateObj) {
			const daysSinceParto = differenceInDays(today, lastPartoDateObj);
			if (daysSinceParto <= RECENT_BIRTH_DAYS) {
				return {
					semaforo: 'verde',
					semaforoLabel: `Recién parida hace ${daysSinceParto}d`,
					lastMontaDate,
					lastPartoDate,
					nextExpectedParto,
					daysOpen
				};
			}
		}

		if (lastMontaDateObj) {
			const daysSinceMonta = differenceInDays(today, lastMontaDateObj);
			if (daysSinceMonta <= GESTATION_DAYS) {
				if (lastMontaRecord?.prenez_confirmada === 'Sí') {
					return {
						semaforo: 'azul',
						semaforoLabel: `Gestando confirmada (${daysSinceMonta}d)`,
						lastMontaDate,
						lastPartoDate,
						nextExpectedParto,
						daysOpen
					};
				}
				return {
					semaforo: 'amarillo',
					semaforoLabel: `Gestación probable (${daysSinceMonta}d)`,
					lastMontaDate,
					lastPartoDate,
					nextExpectedParto,
					daysOpen
				};
			}
			return {
				semaforo: 'rojo',
				semaforoLabel: `Parto atrasado — revisar (${daysSinceMonta}d)`,
				lastMontaDate,
				lastPartoDate,
				nextExpectedParto,
				daysOpen
			};
		}

		if (lastPartoDateObj) {
			const daysSinceParto = differenceInDays(today, lastPartoDateObj);
			if (daysSinceParto > OPEN_ALERT_DAYS) {
				return {
					semaforo: 'rojo',
					semaforoLabel: `Vacía ${daysSinceParto}d sin monta`,
					lastMontaDate,
					lastPartoDate,
					nextExpectedParto,
					daysOpen
				};
			}
		}

		return {
			semaforo: 'gris',
			semaforoLabel: 'Sin datos suficientes',
			lastMontaDate,
			lastPartoDate,
			nextExpectedParto,
			daysOpen
		};
	}

	function mean(values: number[]): number | null {
		if (values.length === 0) return null;
		return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
	}

	/**
	 * A cow's calving interval, reported as two different numbers because they
	 * answer two different questions: the headline value averages her last
	 * `RECENT_INTERVALS` intervals and describes how she is cycling now, while
	 * `lifetime` averages all of them and shows whether management has drifted
	 * over the years.
	 *
	 * Both are means of a single cow's intervals — never of the herd's pooled
	 * intervals. The number of intervals a cow produces is roughly inversely
	 * proportional to their length, so pooling would over-weight the fastest
	 * breeders and bias the herd figure downwards.
	 *
	 * With a single calving there is no interval yet, but if she is carrying
	 * again the interval she is on track for is already known, and reporting it
	 * as a projection is what lets a young herd see the KPI at all.
	 */
	function calcIEP(births: BirthEvent[], nextExpectedParto: string | null): IEPResult {
		const intervals = calvingIntervals(births);

		if (intervals.length > 0) {
			return {
				days: mean(intervals.slice(-RECENT_INTERVALS)),
				projected: false,
				lifetime: mean(intervals),
				reason: ''
			};
		}

		const lastBirth = safeDate(births.at(-1)?.date);
		const expected = safeDate(nextExpectedParto);
		if (lastBirth && expected) {
			const days = differenceInDays(expected, lastBirth);
			if (days > 0) return { days, projected: true, lifetime: null, reason: '' };
		}

		return {
			days: null,
			projected: false,
			lifetime: null,
			reason: births.length === 0 ? 'sin partos' : 'falta 2º parto'
		};
	}

	function calcEfficiency(cow: Animal, births: BirthEvent[]): number | null {
		const edad = ageInYears(cow.fecha_nacimiento);
		if (edad === null || edad <= BREEDING_AGE_YEARS) return null;
		return births.length / (edad - BREEDING_AGE_YEARS);
	}

	const SEMAFORO_CONFIG: Record<Semaforo, { dot: string; badge: string }> = {
		verde: { dot: 'bg-green-500', badge: 'bg-green-100 text-green-800' },
		azul: { dot: 'bg-blue-500', badge: 'bg-blue-100 text-blue-800' },
		amarillo: { dot: 'bg-yellow-400', badge: 'bg-yellow-100 text-yellow-800' },
		rojo: { dot: 'bg-red-500', badge: 'bg-red-100 text-red-800' },
		gris: { dot: 'bg-gray-300', badge: 'bg-gray-100 text-gray-600' }
	};

	// ── State ──
	let horizonMonths = $state(3);
	let selectedCowId = $state<string | null>(null);
	let herdSummaryInfoOpen = $state(false);
	let alertsOpen = $state(true);
	let vacantCowsOpen = $state(true);
	let heatWindowOpen = $state(true);
	let cowStatuses = $state<CowStatus[]>([]);
	/** Cows sold while still productive — history only, never shown as herd. */
	let soldCowHistory = $state<IEPSubject[]>([]);
	let animalLookup = $state(new Map<string, Animal>());
	let photoLookup = $state(new Map<string, string>());
	let archivedMontas = $state(new Map<string, string>());
	let montaCorrections = $state<MontaCorrection[]>([]);
	let prenezRevocations = $state<PrenezRevocation[]>([]);
	let correctionsNoticeOpen = $state(true);

	const today = new Date();

	let windowStart = $derived(subMonths(today, horizonMonths));
	let windowEnd = $derived(addMonths(today, horizonMonths));
	let nearWeaningCows = $derived(
		cowStatuses.filter((status) =>
			isWithinDaysRange(status.daysSinceLastBirth, WEANING_WINDOW_START_DAYS, WEANING_WINDOW_END_DAYS)
		)
	);
	let vacantCows = $derived(
		cowStatuses
			.filter(
				(status) => !hasCurrentGestation(status) && (status.daysSinceLastBirth ?? -1) > OPEN_ALERT_DAYS
			)
			.sort(
				(a, b) =>
					(b.daysSinceLastBirth ?? -1) - (a.daysSinceLastBirth ?? -1)
			)
	);
	let heatWindowCows = $derived(
		cowStatuses
			.filter(
				(status) =>
					!hasCurrentGestation(status) &&
					isWithinDaysRange(status.daysSinceLastBirth, HEAT_WINDOW_START_DAYS, HEAT_WINDOW_END_DAYS)
			)
			.sort(
				(a, b) =>
					(a.lastBirthReferenceDate ?? '').localeCompare(b.lastBirthReferenceDate ?? '')
			)
	);

	let herdKPIs = $derived.by((): HerdKPIs => {
		const total = cowStatuses.length;
		const confirmed = cowStatuses.filter((c) => c.semaforo === 'azul').length;
		const probable = cowStatuses.filter((c) => c.semaforo === 'amarillo').length;
		const vacant = vacantCows.length;
		const nearWeaning = nearWeaningCows.length;
		const recent = cowStatuses.filter((c) => c.semaforo === 'verde').length;
		// A heifer that has never calved is not a gap in the records, so she does not
		// belong in either the "sin historial" count or the birth-rate denominator.
		const isBreedingAge = (age: number | null) => age !== null && age >= BREEDING_AGE_YEARS;
		const breedingCows = cowStatuses.filter((c) =>
			isBreedingAge(ageInYears(c.cow.fecha_nacimiento))
		);
		const noHist = breedingCows.filter(
			(c) => c.records.length === 0 && c.births.length === 0
		).length;

		const subjects: IEPSubject[] = [
			...cowStatuses.map((c) => ({
				births: c.births,
				nextExpectedParto: c.nextExpectedParto,
				ageYears: ageInYears(c.cow.fecha_nacimiento)
			})),
			...soldCowHistory
		].filter((subject) => isBreedingAge(subject.ageYears));

		const results = subjects.map((s) => calcIEP(s.births, s.nextExpectedParto));
		const measured = results.filter((r) => !r.projected && r.days !== null).map((r) => r.days!);
		const projected = results.filter((r) => r.projected && r.days !== null).map((r) => r.days!);

		// Measured and projected are never mixed into one number: the herd falls back
		// to projections only while no real interval exists anywhere, and says so.
		const avgIEP = measured.length > 0 ? mean(measured) : mean(projected);
		const avgIEPProjected = measured.length === 0 && projected.length > 0;

		const cutoff = format(subMonths(today, 12), 'yyyy-MM-dd');
		const births12m = cowStatuses
			.flatMap((c) => c.births)
			.filter((b) => b.date >= cutoff).length;
		const birthRate12m =
			breedingCows.length > 0 ? Math.round((births12m / breedingCows.length) * 100) : null;

		return {
			totalCows: total,
			gestatingConfirmed: confirmed,
			gestatingProbable: probable,
			vacant,
			nearWeaning,
			recentBirth: recent,
			noHistory: noHist,
			avgIEP,
			avgIEPProjected,
			avgIEPLifetime: mean(results.map((r) => r.lifetime).filter((v): v is number => v !== null)),
			iepCows: measured.length,
			iepEligible: subjects.length,
			birthRate12m,
			breedingCows: breedingCows.length
		};
	});

	let birthRadar = $derived(
		cowStatuses
			.filter((c) => {
				if (!c.nextExpectedParto) return false;
				const d = safeDate(c.nextExpectedParto);
				return d && d >= windowStart && d <= windowEnd;
			})
			.sort((a, b) =>
				(a.nextExpectedParto ?? '').localeCompare(b.nextExpectedParto ?? '')
			)
	);

	let alerts = $derived(
		cowStatuses.filter((c) => c.semaforo === 'rojo' || c.semaforo === 'gris')
	);

	let selectedStatus = $derived(
		cowStatuses.find((c) => c.cow.animal_id === selectedCowId) ?? null
	);
	let selectedIEP = $derived(
		selectedStatus
			? calcIEP(selectedStatus.births, selectedStatus.nextExpectedParto)
			: null
	);
	let selectedEff = $derived(
		selectedStatus ? calcEfficiency(selectedStatus.cow, selectedStatus.births) : null
	);
	let selectedAge = $derived(
		selectedStatus ? ageInYears(selectedStatus.cow.fecha_nacimiento) : null
	);
	let selectedPartos = $derived(selectedStatus ? selectedStatus.births.length : 0);

	let shouldCull = $derived(selectedEff !== null && selectedEff < CULL_EFFICIENCY);

	let miniKpis = $derived([
		{
			label: 'Días abiertos',
			value:
				selectedStatus?.daysOpen !== null
					? `${selectedStatus?.daysOpen}d`
					: '—',
			sub: '',
			note: '',
			warn:
				selectedStatus?.daysOpen !== null &&
				(selectedStatus?.daysOpen ?? 0) > OPEN_ALERT_DAYS
		},
		{
			label: 'IEP',
			value:
				selectedIEP?.days != null ? `${selectedIEP.projected ? '~' : ''}${selectedIEP.days}d` : '—',
			sub:
				selectedIEP?.days == null
					? (selectedIEP?.reason ?? '')
					: selectedIEP.projected
						? 'proyectado'
						: `${(selectedIEP.days / 30.4).toFixed(1)} m`,
			// The lifetime mean only earns space when it disagrees with the recent one.
			note:
				selectedIEP?.lifetime != null && selectedIEP.lifetime !== selectedIEP.days
					? `vitalicio ${selectedIEP.lifetime}d`
					: '',
			warn: selectedIEP?.days != null && !selectedIEP.projected && selectedIEP.days > 450
		},
		{
			label: 'Total crías',
			value: `${selectedPartos}`,
			sub: '',
			note: '',
			warn: false
		},
		{
			label: 'Efic. vitalicia',
			value:
				selectedEff !== null
					? selectedEff.toFixed(2)
					: selectedAge !== null && selectedAge <= BREEDING_AGE_YEARS
						? 'joven'
						: '—',
			sub: selectedAge !== null ? `${selectedAge.toFixed(1)} años` : '',
			note: '',
			warn: shouldCull
		}
	]);

	$effect(() => {
		loadData();
	});

	async function loadData() {
		const [animals, storedRepro, photos, sales] = await Promise.all([
			db.animals.toArray(),
			db.reproduction.where('deleted').equals(0).toArray(),
			getAllPhotos(),
			db.sales.where('deleted').equals(0).toArray()
		]);

		const activeAnimals = animals.filter((animal) => animal.deleted === 0);

		// Reconcile before anything is computed: a mating observation contradicted by
		// a real birth would otherwise drive the whole page's inference.
		const plan = planMontaReconciliation(storedRepro, activeAnimals);
		let reproRecords = storedRepro;
		if (plan.corrections.length > 0 || plan.revocations.length > 0) {
			await applyMontaReconciliation(plan);
			reproRecords = await db.reproduction.where('deleted').equals(0).toArray();
		}
		montaCorrections = plan.corrections;
		prenezRevocations = plan.revocations;
		correctionsNoticeOpen = plan.corrections.length > 0 || plan.revocations.length > 0;
		archivedMontas = plan.archived;

		animalLookup = new Map(activeAnimals.map((animal) => [animal.animal_id, animal]));
		const nextPhotoLookup = new Map<string, string>();
		for (const animal of activeAnimals) {
			if (animal.foto_url) {
				nextPhotoLookup.set(animal.animal_id, animal.foto_url);
			}
		}
		for (const photo of photos) {
			if (photo.deleted === 0) {
				nextPhotoLookup.set(photo.animal_id, photo.data_url || photo.photo_url);
			}
		}
		photoLookup = nextPhotoLookup;

		// One deduplicated view of every calving, merging birth events and calves
		// registered under a mother. Replaces the partial calf-only index this page
		// used to build by hand, and now also feeds the semáforo and the KPIs.
		const allBirths = birthsByCow(reproRecords, activeAnimals);

		const cows = activeAnimals.filter(
			(a) => a.sexo === 'Hembra' && a.estado !== 'Vendido(a)' && a.estado !== 'Muerto(a)'
		);

		cowStatuses = cows.map((cow) => {
			const records = reproRecords.filter((r) => r.vaca_id === cow.animal_id);
			const births = allBirths.get(cow.animal_id) ?? [];
			const inferredStatus = inferSemaforo(records, today, plan.archived, births);
			const lastCalfBirthDate = births.filter((b) => !b.fromRecord).at(-1)?.date ?? null;
			const lastBirthReferenceDate = births.at(-1)?.date ?? null;
			return {
				cow,
				records,
				births,
				...inferredStatus,
				lastCalfBirthDate,
				lastBirthReferenceDate,
				daysSinceLastBirth: daysSince(lastBirthReferenceDate, today)
			};
		});

		// A cow sold soon after calving was still in the cycle when she left, so
		// dropping her intervals would throw away the herd's recent history — which,
		// in a herd whose older cows have been sold, may be all of it. She feeds the
		// IEP only; she is never part of the herd shown on screen.
		const lastSaleDate = new Map<string, string>();
		for (const sale of sales) {
			const previous = lastSaleDate.get(sale.animal_id);
			if (!previous || sale.fecha_venta > previous) {
				lastSaleDate.set(sale.animal_id, sale.fecha_venta);
			}
		}

		soldCowHistory = activeAnimals
			.filter((animal) => animal.sexo === 'Hembra' && animal.estado === 'Vendido(a)')
			.flatMap((animal): IEPSubject[] => {
				const births = allBirths.get(animal.animal_id) ?? [];
				const lastBirth = safeDate(births.at(-1)?.date);
				const sold = safeDate(lastSaleDate.get(animal.animal_id));
				if (!lastBirth || !sold) return [];
				const gap = differenceInDays(sold, lastBirth);
				if (gap < 0 || gap >= SOLD_COW_HISTORY_DAYS) return [];
				return [
					{ births, nextExpectedParto: null, ageYears: ageInYears(animal.fecha_nacimiento) }
				];
			});
	}

	function formatD(dateStr: string | null | undefined): string {
		if (!dateStr) return '—';
		const d = safeDate(dateStr);
		if (!d) return dateStr;
		return format(d, 'd MMM yyyy', { locale: es });
	}

	function daysUntil(dateStr: string | null | undefined): string {
		if (!dateStr) return '';
		const d = safeDate(dateStr);
		if (!d) return '';
		const diff = differenceInDays(d, today);
		if (diff === 0) return 'hoy';
		if (diff > 0) return `en ${diff}d`;
		return `hace ${Math.abs(diff)}d`;
	}

	function toggleCow(cowId: string) {
		selectedCowId = selectedCowId === cowId ? null : cowId;
	}

	function animalLabel(animalId: string): string {
		const animal = animalLookup.get(animalId);
		if (!animal) return animalId;
		return `${animal.nombre || 'Sin nombre'} ${formatTagId(animal.arete_id)}`.trim();
	}

	function calfPhotoSrc(calfId: string): string {
		return photoLookup.get(calfId) || animalLookup.get(calfId)?.foto_url || '';
	}

	let kpiCards = $derived([
		{
			label: 'Gestando confirmada',
			value: `${herdKPIs.gestatingConfirmed}`,
			sub: `${herdKPIs.totalCows > 0 ? Math.round((herdKPIs.gestatingConfirmed / herdKPIs.totalCows) * 100) : 0}%`,
			note: '',
			color: 'border-blue-200 bg-blue-50 text-blue-700'
		},
		{
			label: 'Gestación probable',
			value: `${herdKPIs.gestatingProbable}`,
			sub: 'inferida',
			note: '',
			color: 'border-yellow-200 bg-yellow-50 text-yellow-700'
		},
		{
			label: 'Vacías / alerta',
			value: `${herdKPIs.vacant}`,
			sub: `${herdKPIs.totalCows > 0 ? Math.round((herdKPIs.vacant / herdKPIs.totalCows) * 100) : 0}%`,
			note: '',
			color: 'border-red-200 bg-red-50 text-red-700'
		},
		{
			label: 'Próximas a destetar',
			value: `${herdKPIs.nearWeaning}`,
			sub: `${WEANING_WINDOW_START_DAYS}-${WEANING_WINDOW_END_DAYS}d posparto`,
			note: '',
			color: 'border-amber-200 bg-amber-50 text-amber-700'
		},
		{
			label: 'Recién paridas',
			value: `${herdKPIs.recentBirth}`,
			sub: `≤${RECENT_BIRTH_DAYS}d`,
			note: '',
			color: 'border-green-200 bg-green-50 text-green-700'
		},
		{
			label: 'Sin historial',
			value: `${herdKPIs.noHistory}`,
			sub: `de ${herdKPIs.breedingCows} adultas`,
			color: 'border-slate-200 bg-slate-50 text-slate-700'
		},
		{
			label: `IEP promedio (últimos ${RECENT_INTERVALS})`,
			value:
				herdKPIs.avgIEP !== null
					? `${herdKPIs.avgIEPProjected ? '~' : ''}${herdKPIs.avgIEP}d`
					: '—',
			// A dash has to say whether it is missing data or a broken calculation.
			sub:
				herdKPIs.avgIEP === null
					? `0 de ${herdKPIs.iepEligible} con 2+ partos`
					: herdKPIs.avgIEPProjected
						? `proyectado · 0 de ${herdKPIs.iepEligible} con 2+ partos`
						: `${(herdKPIs.avgIEP / 30.4).toFixed(1)} meses · ${herdKPIs.iepCows} de ${herdKPIs.iepEligible}`,
			note:
				herdKPIs.avgIEPLifetime !== null && herdKPIs.avgIEPLifetime !== herdKPIs.avgIEP
					? `vitalicio ${herdKPIs.avgIEPLifetime}d`
					: '',
			color: 'border-gray-200 bg-gray-50 text-gray-700'
		},
		{
			label: 'Tasa de parto 12m',
			value: herdKPIs.birthRate12m !== null ? `${herdKPIs.birthRate12m}%` : '—',
			sub: `partos / ${herdKPIs.breedingCows} adultas`,
			note: '',
			color: 'border-gray-200 bg-gray-50 text-gray-700'
		}
	]);
</script>

<div class="mx-auto max-w-lg space-y-5 pb-8">
	<!-- Header -->
	<div class="flex items-center gap-3">
		<BackButton fallback="/actividad" />
		<div>
			<h2 class="text-xl font-bold text-gray-800">Inteligencia Reproductiva</h2>
			<p class="text-xs text-gray-400">Solo lectura — datos calculados</p>
		</div>
	</div>

	<!-- Automatic reconciliation of physically impossible records -->
	{#if correctionsNoticeOpen && (montaCorrections.length > 0 || prenezRevocations.length > 0)}
		<section class="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3">
			<div class="flex items-start justify-between gap-3">
				<p class="text-sm font-bold text-sky-800">
					{montaCorrections.length + prenezRevocations.length}
					{montaCorrections.length + prenezRevocations.length === 1
						? 'registro corregido automáticamente'
						: 'registros corregidos automáticamente'}
				</p>
				<button
					type="button"
					onclick={() => (correctionsNoticeOpen = false)}
					class="shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold text-sky-700 hover:bg-sky-100"
				>
					Cerrar
				</button>
			</div>

			{#if montaCorrections.length > 0}
				<p class="mt-2 text-xs text-sky-700/80">
					La vaca ya había parido antes del parto inferido, así que la monta se recorrió a {GESTATION_DAYS}
					días antes del parto real.
				</p>
				<ul class="mt-1 space-y-1">
					{#each montaCorrections as correction (correction.reproduccion_id)}
						<li class="text-sm text-sky-950">
							<a
								href="/actividad/reproduccion/{correction.reproduccion_id}"
								class="font-medium underline decoration-sky-300 underline-offset-2"
							>
								{animalLabel(correction.vaca_id)}
							</a>
							: {formatD(correction.previousMontaDate)} → {formatD(correction.correctedMontaDate)}
							<span class="text-xs text-sky-700/80">
								(parto {formatD(correction.birthDate)})
							</span>
						</li>
					{/each}
				</ul>
			{/if}

			{#if prenezRevocations.length > 0}
				<p class="mt-2 text-xs text-sky-700/80">
					Se volvió a montar la vaca dentro de la gestación que estos registros afirmaban, así que
					la preñez confirmada pasó a «No». Revisa si hubo aborto o pérdida.
				</p>
				<ul class="mt-1 space-y-1">
					{#each prenezRevocations as revocation (revocation.reproduccion_id)}
						<li class="text-sm text-sky-950">
							<a
								href="/actividad/reproduccion/{revocation.reproduccion_id}"
								class="font-medium underline decoration-sky-300 underline-offset-2"
							>
								{animalLabel(revocation.vaca_id)}
							</a>
							: monta {formatD(revocation.montaDate)} → preñez «No»
							<span class="text-xs text-sky-700/80">
								(montada de nuevo el {formatD(revocation.laterMontaDate)})
							</span>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/if}

	<!-- Horizon selector -->
	<div class="flex items-center gap-2">
		<span class="text-sm font-medium text-gray-600">Horizonte:</span>
		{#each [1, 3, 6, 12] as m}
			<button
				onclick={() => (horizonMonths = m)}
				class="rounded-full px-3 py-1 text-sm font-semibold transition-colors {horizonMonths ===
				m
					? 'bg-pink-600 text-white'
					: 'bg-gray-100 text-gray-600 hover:bg-gray-200'}"
			>
				{m}m
			</button>
		{/each}
		<span class="ml-auto text-xs text-gray-400">
			±{horizonMonths} mes{horizonMonths !== 1 ? 'es' : ''}
		</span>
	</div>

	<!-- Herd KPIs -->
	<section>
		<div class="mb-2">
			<button
				onclick={() => (herdSummaryInfoOpen = !herdSummaryInfoOpen)}
				class="inline-flex items-center gap-1 rounded-t-lg rounded-b-sm border border-sky-200 bg-sky-50 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-700 transition-colors hover:bg-sky-100"
			>
				<HelpCircle size={12} />
				Información
				{#if herdSummaryInfoOpen}
					<ChevronUp size={12} />
				{:else}
					<ChevronDown size={12} />
				{/if}
			</button>
			{#if herdSummaryInfoOpen}
				<div class="rounded-r-xl rounded-b-xl border border-sky-200 bg-sky-50/70 px-4 py-4 text-sm text-sky-950 shadow-sm">
					<h4 class="text-xs font-bold uppercase tracking-[0.18em] text-sky-800">
						Resumen destete idóneo tradicional (4-5 meses)
					</h4>
					<div class="mt-3 space-y-4">
						<div>
							<p class="text-xs font-bold uppercase tracking-[0.16em] text-sky-700">
								Condición fuerte
							</p>
							<ul class="mt-2 space-y-1.5 text-sm text-sky-950">
								<li>- Extensivo, pasto verde: celo 130-150 días, alta preñez</li>
								<li>- Extensivo, pasto seco: 150-170 días, media preñez</li>
								<li>- Extensivo+suplemento, verde: 120-140 días, muy alta</li>
								<li>- Extensivo+suplemento, seco: 130-150 días, alta</li>
							</ul>
						</div>
						<div>
							<p class="text-xs font-bold uppercase tracking-[0.16em] text-sky-700">
								Condición flaca
							</p>
							<ul class="mt-2 space-y-1.5 text-sm text-sky-950">
								<li>- Extensivo, verde: 160-180 días, baja</li>
								<li>- Extensivo, seco: 180-210 días, muy baja</li>
								<li>- Extensivo+suplemento, verde: 140-160 días, media</li>
								<li>- Extensivo+suplemento, seco: 150-170 días, media-baja</li>
							</ul>
						</div>
						<div>
							<p class="text-xs font-bold uppercase tracking-[0.16em] text-sky-700">
								Condición gorda
							</p>
							<ul class="mt-2 space-y-1.5 text-sm text-sky-950">
								<li>- Extensivo, verde: 130-150 días, alta (vigilar distocia)</li>
								<li>- Extensivo, seco: 150-170 días, media</li>
								<li>- Extensivo+suplemento, verde: 120-140 días, muy alta</li>
								<li>- Extensivo+suplemento, seco: 130-150 días, alta</li>
							</ul>
						</div>
						<div class="space-y-2 rounded-lg bg-white/60 px-3 py-3 ring-1 ring-sky-100">
							<p class="text-xs font-bold uppercase tracking-[0.16em] text-sky-700">Nota</p>
							<p class="text-sm text-sky-950">
								Suplementación y pasturas verdes acortan anestro y mejoran tasa de preñez.
							</p>
							<p class="text-xs font-bold uppercase tracking-[0.16em] text-sky-700">Meta</p>
							<p class="text-sm text-sky-950">
								Preñar entre 130-150 días posparto para intervalos aprox. de 12 meses.
							</p>
						</div>
					</div>
				</div>
			{/if}
		</div>
		<h3 class="mb-2 text-sm font-bold uppercase tracking-wider text-gray-500">
			Resumen del hato ({herdKPIs.totalCows} vacas)
		</h3>
		<div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
			{#each kpiCards as kpi}
				<div class="rounded-xl border p-3 {kpi.color}">
					<p class="text-2xl font-bold">{kpi.value}</p>
					<p class="text-xs font-medium opacity-80">{kpi.sub}</p>
					{#if kpi.note}
						<p class="text-[10px] leading-tight opacity-60">{kpi.note}</p>
					{/if}
					<p class="mt-1 text-xs leading-tight opacity-60">{kpi.label}</p>
				</div>
			{/each}
		</div>
	</section>

	<!-- Priority alerts -->
	{#if alerts.length > 0}
		<section class="rounded-xl border border-red-200 bg-red-50">
			<button
				onclick={() => (alertsOpen = !alertsOpen)}
				class="flex w-full items-center justify-between px-4 py-3"
			>
				<span class="flex items-center gap-2 text-sm font-bold text-red-700">
					<AlertTriangle size={16} />
					Alertas prioritarias ({alerts.length})
				</span>
				{#if alertsOpen}
					<ChevronUp size={16} class="text-red-500" />
				{:else}
					<ChevronDown size={16} class="text-red-500" />
				{/if}
			</button>
			{#if alertsOpen}
				<ul class="divide-y divide-red-100 px-4 pb-3">
					{#each alerts as { cow, semaforo, semaforoLabel } (cow.animal_id)}
						<li class="flex cursor-pointer items-center justify-between py-2">
							<button
								onclick={() => toggleCow(cow.animal_id)}
								class="flex items-center gap-2"
							>
								<span
									class="inline-block h-3 w-3 rounded-full {SEMAFORO_CONFIG[semaforo]
										.dot}"
								></span>
								<span class="font-medium text-gray-800">
									{cow.nombre || formatTagId(cow.arete_id) || cow.animal_id}
								</span>
							</button>
							<span class="text-xs text-red-700">{semaforoLabel}</span>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/if}

	<!-- Vacant cows -->
	<section class="rounded-xl border border-rose-200 bg-rose-50">
		<button
			onclick={() => (vacantCowsOpen = !vacantCowsOpen)}
			class="flex w-full items-center justify-between px-4 py-3"
		>
			<span class="flex items-center gap-2 text-sm font-bold text-rose-800">
				<Clock size={16} />
				Vacas vacías ({vacantCows.length})
			</span>
			{#if vacantCowsOpen}
				<ChevronUp size={16} class="text-rose-600" />
			{:else}
				<ChevronDown size={16} class="text-rose-600" />
			{/if}
		</button>
		{#if vacantCowsOpen}
			{#if vacantCows.length === 0}
				<p class="px-4 pb-4 text-sm text-rose-700/80">
					No hay vacas con más de {OPEN_ALERT_DAYS} días sin gestación probable o confirmada.
				</p>
			{:else}
				<ul class="divide-y divide-rose-100 px-4 pb-3">
					{#each vacantCows as { cow, daysSinceLastBirth, lastBirthReferenceDate } (cow.animal_id)}
						<li class="flex cursor-pointer items-center justify-between py-2">
							<button
								onclick={() => toggleCow(cow.animal_id)}
								class="flex items-center gap-2"
							>
								<span class="inline-block h-3 w-3 rounded-full bg-rose-400"></span>
								<span class="font-medium text-gray-800">
									{cow.nombre || formatTagId(cow.arete_id) || cow.animal_id}
								</span>
							</button>
							<span class="text-right text-xs text-rose-800">
								{daysSinceLastBirth}d desde {formatD(lastBirthReferenceDate)}
							</span>
						</li>
					{/each}
				</ul>
			{/if}
		{/if}
	</section>

	<!-- Ideal heat window -->
	<section class="rounded-xl border border-amber-200 bg-amber-50">
		<button
			onclick={() => (heatWindowOpen = !heatWindowOpen)}
			class="flex w-full items-center justify-between px-4 py-3"
		>
			<span class="flex items-center gap-2 text-sm font-bold text-amber-800">
				Vacas en ventana de celo ideal supuesta ({heatWindowCows.length})
			</span>
			{#if heatWindowOpen}
				<ChevronUp size={16} class="text-amber-600" />
			{:else}
				<ChevronDown size={16} class="text-amber-600" />
			{/if}
		</button>
		{#if heatWindowOpen}
			{#if heatWindowCows.length === 0}
				<p class="px-4 pb-4 text-sm text-amber-700/80">
					No hay vacas entre {HEAT_WINDOW_START_DAYS} y {HEAT_WINDOW_END_DAYS} días desde su última cría o parto.
				</p>
			{:else}
				<ul class="divide-y divide-amber-100 px-4 pb-3">
					{#each heatWindowCows as { cow, daysSinceLastBirth, lastBirthReferenceDate } (cow.animal_id)}
						<li class="flex cursor-pointer items-center justify-between py-2">
							<button
								onclick={() => toggleCow(cow.animal_id)}
								class="flex items-center gap-2"
							>
								<span class="inline-block h-3 w-3 rounded-full bg-amber-400"></span>
								<span class="font-medium text-gray-800">
									{cow.nombre || formatTagId(cow.arete_id) || cow.animal_id}
								</span>
							</button>
							<span class="text-right text-xs text-amber-800">
								{daysSinceLastBirth}d desde {formatD(lastBirthReferenceDate)}
							</span>
						</li>
					{/each}
				</ul>
			{/if}
		{/if}
	</section>

	<!-- Birth Radar -->
	<section>
		<h3 class="mb-2 text-sm font-bold uppercase tracking-wider text-gray-500">
			🎯 Radar de partos esperados
		</h3>
		{#if birthRadar.length === 0}
			<p class="rounded-xl bg-gray-50 px-4 py-6 text-center text-sm text-gray-400">
				Sin partos estimados en el horizonte de ±{horizonMonths} meses.
			</p>
		{:else}
			<ul class="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
				{#each birthRadar as { cow, semaforo, semaforoLabel, nextExpectedParto } (cow.animal_id)}
					<li class="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-gray-50">
						<button onclick={() => toggleCow(cow.animal_id)} class="flex flex-1 items-center gap-3 min-w-0">
							<Baby size={16} class="shrink-0 text-pink-400" />
							<div class="min-w-0 flex-1">
								<p class="font-medium text-gray-800">
									{cow.nombre || formatTagId(cow.arete_id) || cow.animal_id}
								</p>
								<p class="text-xs text-gray-500">{semaforoLabel}</p>
							</div>
							<div class="shrink-0 text-right">
								<p class="text-sm font-semibold text-gray-800">
									{formatD(nextExpectedParto)}
								</p>
								<p class="text-xs font-medium text-pink-600">
									{daysUntil(nextExpectedParto)}
								</p>
							</div>
							<span
								class="inline-block h-3 w-3 rounded-full {SEMAFORO_CONFIG[semaforo]
									.dot}"
							></span>
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<!-- All cows list -->
	<section>
		<h3 class="mb-2 text-sm font-bold uppercase tracking-wider text-gray-500">
			Todas las vacas
		</h3>
		{#if cowStatuses.length === 0}
			<p class="rounded-xl bg-gray-50 px-4 py-6 text-center text-sm text-gray-400">
				No hay hembras activas registradas.
			</p>
		{:else}
			<ul class="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
				{#each cowStatuses as cs (cs.cow.animal_id)}
					{@const isOpen = selectedCowId === cs.cow.animal_id}
					{@const badge = SEMAFORO_CONFIG[cs.semaforo].badge}
					<li>
						<button
							class="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50"
							onclick={() => toggleCow(cs.cow.animal_id)}
						>
							<span
								class="inline-block h-3 w-3 rounded-full {SEMAFORO_CONFIG[cs.semaforo]
									.dot}"
							></span>
							<div class="min-w-0 flex-1">
								<p class="truncate font-medium text-gray-800">
									{cs.cow.nombre || formatTagId(cs.cow.arete_id) || cs.cow.animal_id}
								</p>
								<p class="truncate text-xs text-gray-400">
									{formatTagId(cs.cow.arete_id) || '—'}
									{#if cs.lastPartoDate}
										{' '}· Último parto: {formatD(cs.lastPartoDate)}
									{/if}
									{#if cs.daysOpen !== null}
										{' '}· {cs.daysOpen}d abiertos
									{/if}
								</p>
							</div>
							<span class="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium {badge}">
								{cs.semaforoLabel}
							</span>
							{#if isOpen}
								<ChevronUp size={14} class="shrink-0 text-gray-400" />
							{:else}
								<ChevronDown size={14} class="shrink-0 text-gray-400" />
							{/if}
						</button>

						<!-- Individual detail panel -->
						{#if isOpen && selectedStatus}
							<div class="space-y-4 border-t border-gray-100 bg-gray-50 px-4 py-4">
								{#if shouldCull}
									<div
										class="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2"
									>
										<AlertTriangle
											size={16}
											class="mt-0.5 shrink-0 text-red-600"
										/>
										<p class="text-sm text-red-800">
											<strong>Considerar descarte:</strong> eficiencia vitalicia
											{selectedEff?.toFixed(2)} ({'<'} {CULL_EFFICIENCY}). Esta vaca
											produce menos de 0.6 crías por año productivo.
										</p>
									</div>
								{/if}

								<!-- KPI row -->
								<div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
									{#each miniKpis as mk}
										<div
											class="rounded-lg border p-2 {mk.warn
												? 'border-red-200 bg-red-50'
												: 'border-gray-200 bg-white'}"
										>
											<p
												class="text-lg font-bold {mk.warn
													? 'text-red-700'
													: 'text-gray-800'}"
											>
												{mk.value}
											</p>
											{#if mk.sub}
												<p class="text-xs text-gray-400">{mk.sub}</p>
											{/if}
											{#if mk.note}
												<p class="text-[10px] leading-tight text-gray-400">{mk.note}</p>
											{/if}
											<p class="text-xs leading-tight text-gray-500">{mk.label}</p>
										</div>
									{/each}
								</div>

								{#if selectedStatus.nextExpectedParto}
									<div class="rounded-lg bg-pink-50 px-3 py-2 text-sm text-pink-700">
										Parto estimado:
										<strong>{formatD(selectedStatus.nextExpectedParto)}</strong>
										<span class="font-medium">
											({daysUntil(selectedStatus.nextExpectedParto)})
										</span>
									</div>
								{/if}

								<!-- Reproductive history -->
								<div>
									<div class="mb-2 flex items-center justify-between gap-3">
										<p class="text-xs font-bold uppercase tracking-wider text-gray-500">
											Historial reproductivo ({selectedStatus.cow.nombre ||
												formatTagId(selectedStatus.cow.arete_id) || selectedStatus.cow.animal_id})
										</p>
										<a
											href="/actividad/reproduccion/nuevo?animal={selectedStatus.cow.animal_id}"
											class="shrink-0 rounded-full border border-pink-200 bg-pink-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-pink-700 transition-colors hover:bg-pink-100"
										>
											Nuevo evento
										</a>
									</div>
									{#if selectedStatus.records.length === 0}
										<p class="text-sm text-gray-400">Sin registros.</p>
									{:else}
										{@const sortedHistory = [...selectedStatus.records].sort(
											(a, b) =>
												(b.fecha_monta || b.fecha_parto_real || '').localeCompare(
													a.fecha_monta || a.fecha_parto_real || ''
												)
										)}
										<div
											class="overflow-x-auto rounded-lg border border-gray-200 bg-white"
										>
											<table class="min-w-full text-xs">
												<thead>
													<tr
														class="border-b border-gray-100 uppercase tracking-wide text-gray-500"
													>
														<th class="px-3 py-2 text-left">Monta</th>
														<th class="px-3 py-2 text-left">Parto real</th>
														<th class="px-3 py-2 text-left">Preñez</th>
														<th class="px-3 py-2 text-left">Cría</th>
													</tr>
												</thead>
												<tbody>
													{#each sortedHistory as r (r.reproduccion_id)}
														{@const archivedBirth = archivedMontas.get(r.reproduccion_id)}
														<tr class="border-b border-gray-50 last:border-b-0">
															<td class="px-3 py-2 text-gray-700">
																<span class="flex items-center gap-1.5">
																	{formatD(r.fecha_monta)}
																	<a
																		href="/actividad/reproduccion/{r.reproduccion_id}/editar"
																		class="shrink-0 rounded-full p-1 text-pink-600 transition-colors hover:bg-pink-100"
																		aria-label="Editar registro del {formatD(r.fecha_monta)}"
																		title="Editar — confirmar preñez, registrar parto"
																	>
																		<Pencil size={13} />
																	</a>
																</span>
																{#if archivedBirth}
																	<span
																		class="mt-1 block w-fit rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600"
																	>
																		Archivada
																	</span>
																	<span class="mt-0.5 block text-xs text-gray-400">
																		parto el {formatD(archivedBirth)}
																	</span>
																{/if}
															</td>
															<td class="px-3 py-2 font-medium text-gray-800">
																{r.fecha_parto_real
																	? formatD(r.fecha_parto_real)
																	: '—'}
															</td>
															<td class="px-3 py-2">
																<span
																	class="rounded-full px-2 py-0.5 text-xs font-medium {r.prenez_confirmada ===
																	'Sí'
																		? 'bg-green-100 text-green-700'
																		: r.prenez_confirmada === 'No'
																			? 'bg-red-100 text-red-600'
																			: 'bg-yellow-100 text-yellow-700'}"
																>
																	{r.prenez_confirmada}
																</span>
															</td>
														<td class="px-3 py-2 text-gray-500">
															{#if r.cria_id}
																<div class="flex flex-col gap-1.5">
																	{#if calfPhotoSrc(r.cria_id)}
																		<a href="/ganado/{r.cria_id}" class="block w-fit">
																			<img
																				src={calfPhotoSrc(r.cria_id)}
																				alt={animalLabel(r.cria_id)}
																				class="h-10 w-10 rounded-lg object-cover ring-1 ring-gray-200"
																			/>
																		</a>
																	{/if}
																	<a
																		href="/ganado/{r.cria_id}"
																		class="font-medium text-pink-700 underline decoration-pink-200 underline-offset-2 transition-colors hover:text-pink-800"
																	>
																		{animalLabel(r.cria_id)}
																	</a>
																</div>
															{:else}
																—
															{/if}
														</td>
														</tr>
													{/each}
												</tbody>
											</table>
										</div>
									{/if}
								</div>
							</div>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</div>
