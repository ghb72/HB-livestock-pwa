import type { HealthRecord, TipoEventoSalud } from '$lib/types';

const HEALTH_EVENT_ORDER: TipoEventoSalud[] = [
	'Vacuna',
	'Desparasitación',
	'Vitamina',
	'Enfermedad',
	'Tratamiento',
	'Revisión'
];

export type HealthAnimalRow = {
	animalId: string;
	animalName: string;
	animalTag: string;
	eventTypes: Set<TipoEventoSalud>;
	notes: Set<string>;
};

export type HealthBatch = {
	date: string;
	eventTypes: TipoEventoSalud[];
	animals: HealthAnimalRow[];
};

export function buildHealthBatches(
	healthRecords: HealthRecord[],
	animalMap: Map<string, string> = new Map(),
	animalTagMap: Map<string, string> = new Map()
): HealthBatch[] {
	const byDate = new Map<string, Map<string, HealthAnimalRow>>();

	for (const record of healthRecords) {
		if (!byDate.has(record.fecha)) byDate.set(record.fecha, new Map());
		const dateMap = byDate.get(record.fecha)!;
		const name = animalMap.get(record.animal_id) ?? record.animal_id;

		if (!dateMap.has(record.animal_id)) {
			dateMap.set(record.animal_id, {
				animalId: record.animal_id,
				animalName: name,
				animalTag: animalTagMap.get(record.animal_id) ?? '—',
				eventTypes: new Set(),
				notes: new Set()
			});
		}

		const row = dateMap.get(record.animal_id)!;
		row.eventTypes.add(record.tipo_evento);
		if (record.notas?.trim()) row.notes.add(record.notas.trim());
	}

	return [...byDate.entries()]
		.sort(([a], [b]) => b.localeCompare(a))
		.map(([date, animalRows]) => {
			const animals = [...animalRows.values()].sort((a, b) =>
				a.animalName.localeCompare(b.animalName)
			);
			const eventTypes = HEALTH_EVENT_ORDER.filter((type) =>
				animals.some((row) => row.eventTypes.has(type))
			);

			return { date, eventTypes, animals };
		});
}