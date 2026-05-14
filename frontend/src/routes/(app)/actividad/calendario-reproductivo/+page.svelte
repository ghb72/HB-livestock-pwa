<script lang="ts">
	import {
		ArrowLeft,
		AlertTriangle,
		CheckCircle,
		Clock,
		Heart,
		HelpCircle,
		ChevronDown,
		ChevronUp,
		Baby
	} from 'lucide-svelte';
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
	import { formatStoredDate, todayLocalDate } from '$lib/date';
	import { formatTagId } from '$lib/helpers';
	import type { Animal, ReproductionRecord } from '$lib/types';

	// ── Constants ──
	const GESTATION_DAYS = 283;
	const RECENT_BIRTH_DAYS = 60;
	const OPEN_ALERT_DAYS = 90;
	const CULL_EFFICIENCY = 0.6;

	// ── Types ──
	type Semaforo = 'verde' | 'azul' | 'amarillo' | 'rojo' | 'gris';

	interface CowStatus {
		cow: Animal;
		semaforo: Semaforo;
		semaforoLabel: string;
		lastMontaDate: string | null;
		lastPartoDate: string | null;
		nextExpectedParto: string | null;
		daysOpen: number | null;
		records: ReproductionRecord[];
	}

	interface HerdKPIs {
		totalCows: number;
		gestatingConfirmed: number;
		gestatingProbable: number;
		vacant: number;
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

	function inferSemaforo(
		records: ReproductionRecord[],
		today: Date
	): Omit<CowStatus, 'cow' | 'records'> {
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
	let alertsOpen = $state(true);
	let cowStatuses = $state<CowStatus[]>([]);

	const today = new Date();

	let windowStart = $derived(subMonths(today, horizonMonths));
	let windowEnd = $derived(addMonths(today, horizonMonths));

	let herdKPIs = $derived.by((): HerdKPIs => {
		const total = cowStatuses.length;
		const confirmed = cowStatuses.filter((c) => c.semaforo === 'azul').length;
		const probable = cowStatuses.filter((c) => c.semaforo === 'amarillo').length;
		const vacant = cowStatuses.filter((c) => c.semaforo === 'rojo').length;
		const recent = cowStatuses.filter((c) => c.semaforo === 'verde').length;
		const noHist = cowStatuses.filter((c) => c.semaforo === 'gris').length;

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
		const [animals, reproRecords] = await Promise.all([
			db.animals.toArray(),
			db.reproduction.where('deleted').equals(0).toArray()
		]);

		const cows = animals.filter(
			(a) => a.sexo === 'Hembra' && a.estado !== 'Vendido(a)' && a.estado !== 'Muerto(a)'
		);

		cowStatuses = cows.map((cow) => {
			const records = reproRecords.filter((r) => r.vaca_id === cow.animal_id);
			return { cow, records, ...inferSemaforo(records, today) };
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
			label: 'Recién paridas',
			value: `${herdKPIs.recentBirth}`,
			sub: `≤${RECENT_BIRTH_DAYS}d`,
			color: 'border-green-200 bg-green-50 text-green-700'
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
		<button
			onclick={() => history.back()}
			class="rounded-full p-2 text-gray-600 hover:bg-gray-200"
			aria-label="Volver"
		>
			<ArrowLeft size={24} />
		</button>
		<div>
			<h2 class="text-xl font-bold text-gray-800">Inteligencia Reproductiva</h2>
			<p class="text-xs text-gray-400">Solo lectura — datos calculados</p>
		</div>
	</div>

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
									<p
										class="mb-2 text-xs font-bold uppercase tracking-wider text-gray-500"
									>
										Historial reproductivo ({selectedStatus.cow.nombre ||
											formatTagId(selectedStatus.cow.arete_id) || selectedStatus.cow.animal_id})
									</p>
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
														<tr class="border-b border-gray-50 last:border-b-0">
															<td class="px-3 py-2 text-gray-700">
																{formatD(r.fecha_monta)}
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
																{r.cria_id || '—'}
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
