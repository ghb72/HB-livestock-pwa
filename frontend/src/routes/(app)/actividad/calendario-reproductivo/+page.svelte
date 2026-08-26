<script lang="ts">
	import {
		AlertTriangle,
		CheckCircle,
		Clock,
		Heart,
		HelpCircle,
		ChevronDown,
		ChevronUp,
		Baby
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
		applyMontaCorrections,
		planMontaReconciliation,
		type MontaCorrection
	} from '$lib/montaConsistency';
	import type { Animal, ReproductionRecord } from '$lib/types';

	// ── Constants ──
	const GESTATION_DAYS = 283;
	const RECENT_BIRTH_DAYS = 60;
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
	}

	type CowStatusBase = Omit<
		CowStatus,
		'cow' | 'records' | 'lastCalfBirthDate' | 'lastBirthReferenceDate' | 'daysSinceLastBirth'
	>;

	interface HerdKPIs {
		totalCows: number;
		gestatingConfirmed: number;
		gestatingProbable: number;
		vacant: number;
		nearWeaning: number;
		recentBirth: number;
		noHistory: number;
		avgIEP: number | null;
		birthRate12m: number | null;
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

	function latestDateString(...dateStrings: Array<string | null | undefined>): string | null {
		const validDates = dateStrings.filter((dateStr): dateStr is string => !!safeDate(dateStr));
		if (validDates.length === 0) return null;
		return validDates.sort((a, b) => b.localeCompare(a))[0] ?? null;
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
		archived: ReadonlyMap<string, string>
	): CowStatusBase {
		// A monta contradicted by a birth never happened as recorded, so it must not
		// become the cow's last monta nor drive her expected birth.
		const records = allRecords.filter((r) => !archived.has(r.reproduccion_id));

		if (records.length === 0) {
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

		const partosDesc = [...records]
			.filter((r) => !!r.fecha_parto_real)
			.sort((a, b) => b.fecha_parto_real.localeCompare(a.fecha_parto_real));

		const lastParto = partosDesc[0] ?? null;
		const lastPartoDate = lastParto?.fecha_parto_real ?? null;
		const lastPartoDateObj = safeDate(lastPartoDate);

		const lastMontaRecord = sorted.find((r) => {
			const montaDate = safeDate(r.fecha_monta);
			if (!montaDate) return false;
			return !partosDesc.some((p) => {
				const pd = safeDate(p.fecha_parto_real);
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

	function calcIEP(records: ReproductionRecord[]): number | null {
		const partos = records
			.filter((r) => !!r.fecha_parto_real)
			.map((r) => r.fecha_parto_real)
			.sort();
		if (partos.length < 2) return null;
		const intervals: number[] = [];
		for (let i = 1; i < partos.length; i++) {
			const d1 = safeDate(partos[i - 1]);
			const d2 = safeDate(partos[i]);
			if (d1 && d2) intervals.push(differenceInDays(d2, d1));
		}
		if (intervals.length === 0) return null;
		return Math.round(intervals.reduce((a, b) => a + b, 0) / intervals.length);
	}

	function calcEfficiency(cow: Animal, records: ReproductionRecord[]): number | null {
		const edad = ageInYears(cow.fecha_nacimiento);
		if (edad === null || edad <= 2) return null;
		const totalPartos = records.filter((r) => !!r.fecha_parto_real).length;
		return totalPartos / (edad - 2);
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
	let animalLookup = $state(new Map<string, Animal>());
	let photoLookup = $state(new Map<string, string>());
	let archivedMontas = $state(new Map<string, string>());
	let montaCorrections = $state<MontaCorrection[]>([]);
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
		const noHist = cowStatuses.filter((c) => c.records.length === 0).length;

		const iepValues = cowStatuses
			.map((c) => calcIEP(c.records))
			.filter((v): v is number => v !== null);
		const avgIEP =
			iepValues.length > 0
				? Math.round(iepValues.reduce((a, b) => a + b, 0) / iepValues.length)
				: null;

		const cutoff = format(subMonths(today, 12), 'yyyy-MM-dd');
		const allRecords = cowStatuses.flatMap((c) => c.records);
		const births12m = allRecords.filter(
			(r) => r.fecha_parto_real && r.fecha_parto_real >= cutoff
		).length;
		const birthRate12m = total > 0 ? Math.round((births12m / total) * 100) : null;

		return {
			totalCows: total,
			gestatingConfirmed: confirmed,
			gestatingProbable: probable,
			vacant,
			nearWeaning,
			recentBirth: recent,
			noHistory: noHist,
			avgIEP,
			birthRate12m
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
	let selectedIEP = $derived(selectedStatus ? calcIEP(selectedStatus.records) : null);
	let selectedEff = $derived(
		selectedStatus ? calcEfficiency(selectedStatus.cow, selectedStatus.records) : null
	);
	let selectedAge = $derived(
		selectedStatus ? ageInYears(selectedStatus.cow.fecha_nacimiento) : null
	);
	let selectedPartos = $derived(
		selectedStatus
			? selectedStatus.records.filter((r) => !!r.fecha_parto_real).length
			: 0
	);

	let shouldCull = $derived(selectedEff !== null && selectedEff < CULL_EFFICIENCY);

	let miniKpis = $derived([
		{
			label: 'Días abiertos',
			value:
				selectedStatus?.daysOpen !== null
					? `${selectedStatus?.daysOpen}d`
					: '—',
			sub: '',
			warn:
				selectedStatus?.daysOpen !== null &&
				(selectedStatus?.daysOpen ?? 0) > OPEN_ALERT_DAYS
		},
		{
			label: 'IEP',
			value: selectedIEP !== null ? `${selectedIEP}d` : '—',
			sub: selectedIEP !== null ? `${(selectedIEP / 30.4).toFixed(1)} m` : '',
			warn: selectedIEP !== null && selectedIEP > 450
		},
		{
			label: 'Total crías',
			value: `${selectedPartos}`,
			sub: '',
			warn: false
		},
		{
			label: 'Efic. vitalicia',
			value:
				selectedEff !== null
					? selectedEff.toFixed(2)
					: selectedAge !== null && selectedAge <= 2
						? 'joven'
						: '—',
			sub: selectedAge !== null ? `${selectedAge.toFixed(1)} años` : '',
			warn: shouldCull
		}
	]);

	$effect(() => {
		loadData();
	});

	async function loadData() {
		const [animals, storedRepro, photos] = await Promise.all([
			db.animals.toArray(),
			db.reproduction.where('deleted').equals(0).toArray(),
			getAllPhotos()
		]);

		const activeAnimals = animals.filter((animal) => animal.deleted === 0);

		// Reconcile before anything is computed: a mating observation contradicted by
		// a real birth would otherwise drive the whole page's inference.
		const plan = planMontaReconciliation(storedRepro, activeAnimals);
		let reproRecords = storedRepro;
		if (plan.corrections.length > 0) {
			await applyMontaCorrections(plan.corrections);
			reproRecords = await db.reproduction.where('deleted').equals(0).toArray();
		}
		montaCorrections = plan.corrections;
		correctionsNoticeOpen = plan.corrections.length > 0;
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
		const latestCalfBirthByMother = new Map<string, string>();
		for (const animal of activeAnimals) {
			const motherId = animal.madre_id?.trim();
			if (!motherId || !animal.fecha_nacimiento) continue;
			const currentLatest = latestCalfBirthByMother.get(motherId) ?? null;
			const latestBirth = latestDateString(currentLatest, animal.fecha_nacimiento);
			if (latestBirth) latestCalfBirthByMother.set(motherId, latestBirth);
		}

		const cows = activeAnimals.filter(
			(a) => a.sexo === 'Hembra' && a.estado !== 'Vendido(a)' && a.estado !== 'Muerto(a)'
		);

		cowStatuses = cows.map((cow) => {
			const records = reproRecords.filter((r) => r.vaca_id === cow.animal_id);
			const inferredStatus = inferSemaforo(records, today, plan.archived);
			const lastCalfBirthDate = latestCalfBirthByMother.get(cow.animal_id) ?? null;
			const lastBirthReferenceDate = latestDateString(
				inferredStatus.lastPartoDate,
				lastCalfBirthDate
			);
			return {
				cow,
				records,
				...inferredStatus,
				lastCalfBirthDate,
				lastBirthReferenceDate,
				daysSinceLastBirth: daysSince(lastBirthReferenceDate, today)
			};
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
			color: 'border-blue-200 bg-blue-50 text-blue-700'
		},
		{
			label: 'Gestación probable',
			value: `${herdKPIs.gestatingProbable}`,
			sub: 'inferida',
			color: 'border-yellow-200 bg-yellow-50 text-yellow-700'
		},
		{
			label: 'Vacías / alerta',
			value: `${herdKPIs.vacant}`,
			sub: `${herdKPIs.totalCows > 0 ? Math.round((herdKPIs.vacant / herdKPIs.totalCows) * 100) : 0}%`,
			color: 'border-red-200 bg-red-50 text-red-700'
		},
		{
			label: 'Próximas a destetar',
			value: `${herdKPIs.nearWeaning}`,
			sub: `${WEANING_WINDOW_START_DAYS}-${WEANING_WINDOW_END_DAYS}d posparto`,
			color: 'border-amber-200 bg-amber-50 text-amber-700'
		},
		{
			label: 'Recién paridas',
			value: `${herdKPIs.recentBirth}`,
			sub: `≤${RECENT_BIRTH_DAYS}d`,
			color: 'border-green-200 bg-green-50 text-green-700'
		},
		{
			label: 'Sin historial',
			value: `${herdKPIs.noHistory}`,
			sub: 'sin registros reproductivos',
			color: 'border-slate-200 bg-slate-50 text-slate-700'
		},
		{
			label: 'IEP promedio',
			value: herdKPIs.avgIEP !== null ? `${herdKPIs.avgIEP}d` : '—',
			sub:
				herdKPIs.avgIEP !== null
					? `${(herdKPIs.avgIEP / 30.4).toFixed(1)} meses`
					: 'sin datos',
			color: 'border-gray-200 bg-gray-50 text-gray-700'
		},
		{
			label: 'Tasa de parto 12m',
			value: herdKPIs.birthRate12m !== null ? `${herdKPIs.birthRate12m}%` : '—',
			sub: 'partos / vacas',
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

	<!-- Automatic monta date corrections -->
	{#if correctionsNoticeOpen && montaCorrections.length > 0}
		<section class="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3">
			<div class="flex items-start justify-between gap-3">
				<p class="text-sm font-bold text-sky-800">
					{montaCorrections.length}
					{montaCorrections.length === 1
						? 'fecha de monta corregida automáticamente'
						: 'fechas de monta corregidas automáticamente'}
				</p>
				<button
					type="button"
					onclick={() => (correctionsNoticeOpen = false)}
					class="shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold text-sky-700 hover:bg-sky-100"
				>
					Cerrar
				</button>
			</div>
			<p class="mt-1 text-xs text-sky-700/80">
				La vaca ya había parido antes del parto inferido, así que la monta se recorrió a {GESTATION_DAYS}
				días antes del parto real.
			</p>
			<ul class="mt-2 space-y-1">
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
																{formatD(r.fecha_monta)}
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
