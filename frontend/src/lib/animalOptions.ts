/**
 * Animal `<select>` options.
 *
 * Every animal selector shows "{nombre} {arete}" and carries the animal_id as the
 * option value, so forms never have to parse an id back out of a visible label.
 */

import { formatTagId } from './helpers';
import type { Animal } from './types';

export type SelectOption = {
	value: string;
	label: string;
};

/** Visible label of an animal in any selector: "{nombre} {arete}". */
export function animalOptionLabel(animal: Animal): string {
	return `${animal.nombre || 'Sin nombre'} ${formatTagId(animal.arete_id)}`.trim();
}

/** Build alphabetically sorted options; the value is always the animal_id. */
export function toAnimalOptions(animals: Animal[]): SelectOption[] {
	return animals
		.map((animal) => ({ value: animal.animal_id, label: animalOptionLabel(animal) }))
		.sort((a, b) => a.label.localeCompare(b.label, 'es'));
}

/**
 * Keep an already-saved animal selectable even when the current filter excludes it
 * (sold, dead, or a bull that is no longer a Semental). Without this, editing an old
 * record would show an empty selector and saving it would drop the link.
 */
export function withSelected(
	options: SelectOption[],
	allAnimals: Animal[],
	selectedId: string
): SelectOption[] {
	if (!selectedId || options.some((option) => option.value === selectedId)) return options;

	const animal = allAnimals.find((candidate) => candidate.animal_id === selectedId);
	const missing = animal
		? { value: animal.animal_id, label: animalOptionLabel(animal) }
		: { value: selectedId, label: selectedId };

	return [missing, ...options];
}
