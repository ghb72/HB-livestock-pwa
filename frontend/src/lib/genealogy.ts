import type { Animal, AnimalPhoto, EstadoAnimal, ReproductionRecord } from '$lib/types';

export type GenealogyRelation = 'madre-hijo' | 'padre-hijo';

export interface GenealogyNode {
	id: string;
	nombre: string;
	areteId: string;
	estado: EstadoAnimal;
	tipo: Animal['tipo'];
	photoSrc: string;
	generation: number;
	isFocus: boolean;
}

export interface GenealogyEdge {
	id: string;
	from: string;
	to: string;
	relation: GenealogyRelation;
}

export interface GenealogyGraph {
	focusId: string;
	nodes: GenealogyNode[];
	edges: GenealogyEdge[];
	availableIds: Set<string>;
}

export interface GenealogySourceAnimal {
	animal_id: string;
	nombre: string;
	arete_id: string;
	estado: EstadoAnimal;
	tipo: Animal['tipo'];
	photoSrc: string;
}

export interface GenealogySource {
	animals: GenealogySourceAnimal[];
	animalsById: Map<string, GenealogySourceAnimal>;
	childrenByParent: Map<string, Array<{ childId: string; relation: GenealogyRelation }>>;
	parentsByChild: Map<string, Array<{ parentId: string; relation: GenealogyRelation }>>;
	edges: GenealogyEdge[];
}

export function createGenealogySource(
	animals: Animal[],
	photos: AnimalPhoto[],
	reproduction: ReproductionRecord[]
): GenealogySource {
	const availableAnimals = animals.filter((animal) => animal.deleted === 0);
	const photoMap = new Map<string, string>();

	for (const animal of availableAnimals) {
		if (animal.foto_url) {
			photoMap.set(animal.animal_id, animal.foto_url);
		}
	}

	for (const photo of photos) {
		if (photo.deleted === 0) {
			photoMap.set(photo.animal_id, photo.data_url || photo.drive_url);
		}
	}

	const animalsById = new Map<string, GenealogySourceAnimal>(
		availableAnimals.map((animal) => [
			animal.animal_id,
			{
				animal_id: animal.animal_id,
				nombre: animal.nombre || 'Sin nombre',
				arete_id: animal.arete_id || '',
				estado: animal.estado,
				tipo: animal.tipo,
				photoSrc: photoMap.get(animal.animal_id) || ''
			}
		])
	);

	const childrenByParent = new Map<string, Array<{ childId: string; relation: GenealogyRelation }>>();
	const parentsByChild = new Map<string, Array<{ parentId: string; relation: GenealogyRelation }>>();
	const edgeMap = new Map<string, GenealogyEdge>();

	function registerRelation(parentId: string, childId: string, relation: GenealogyRelation) {
		if (!parentId || !childId) return;
		if (!animalsById.has(parentId) || !animalsById.has(childId)) return;

		const edgeId = `${parentId}:${childId}:${relation}`;
		if (edgeMap.has(edgeId)) return;

		edgeMap.set(edgeId, {
			id: edgeId,
			from: parentId,
			to: childId,
			relation
		});

		const children = childrenByParent.get(parentId) ?? [];
		children.push({ childId, relation });
		childrenByParent.set(parentId, children);

		const parents = parentsByChild.get(childId) ?? [];
		parents.push({ parentId, relation });
		parentsByChild.set(childId, parents);
	}

	for (const animal of availableAnimals) {
		registerRelation(animal.madre_id, animal.animal_id, 'madre-hijo');
		registerRelation(animal.padre_id, animal.animal_id, 'padre-hijo');
	}

	for (const record of reproduction.filter((item) => item.deleted === 0)) {
		const calfId = String(record.cria_id ?? '').trim();
		if (!calfId) continue;

		registerRelation(record.vaca_id, calfId, 'madre-hijo');

		if (record.semental_id && record.semental_id !== 'EXTERNO') {
			registerRelation(record.semental_id, calfId, 'padre-hijo');
		}
	}

	return {
		animals: Array.from(animalsById.values()).sort((a, b) =>
			a.nombre.localeCompare(b.nombre, 'es') || a.arete_id.localeCompare(b.arete_id, 'es')
		),
		animalsById,
		childrenByParent,
		parentsByChild,
		edges: Array.from(edgeMap.values())
	};
}

export function buildGenealogyGraph(
	source: GenealogySource,
	focusId: string,
	maxDepth = 3
): GenealogyGraph | null {
	if (!focusId || !source.animalsById.has(focusId)) return null;

	const generations = new Map<string, number>([[focusId, 0]]);
	const availableIds = new Set<string>([focusId]);

	let ancestors = [focusId];
	for (let depth = 1; depth <= maxDepth; depth += 1) {
		const nextAncestors = new Set<string>();
		for (const id of ancestors) {
			for (const parent of source.parentsByChild.get(id) ?? []) {
				if (!availableIds.has(parent.parentId)) {
					availableIds.add(parent.parentId);
					generations.set(parent.parentId, -depth);
				}
				nextAncestors.add(parent.parentId);
			}
		}
		ancestors = Array.from(nextAncestors);
		if (ancestors.length === 0) break;
	}

	let descendants = [focusId];
	for (let depth = 1; depth <= maxDepth; depth += 1) {
		const nextDescendants = new Set<string>();
		for (const id of descendants) {
			for (const child of source.childrenByParent.get(id) ?? []) {
				if (!availableIds.has(child.childId)) {
					availableIds.add(child.childId);
					generations.set(child.childId, depth);
				}
				nextDescendants.add(child.childId);
			}
		}
		descendants = Array.from(nextDescendants);
		if (descendants.length === 0) break;
	}

	const nodes = Array.from(availableIds)
		.map((id) => {
			const animal = source.animalsById.get(id);
			if (!animal) return null;

			return {
				id,
				nombre: animal.nombre,
				areteId: animal.arete_id,
				estado: animal.estado,
				tipo: animal.tipo,
				photoSrc: animal.photoSrc,
				generation: generations.get(id) ?? 0,
				isFocus: id === focusId
			} satisfies GenealogyNode;
		})
		.filter((node): node is GenealogyNode => node !== null)
		.sort((a, b) =>
			a.generation - b.generation ||
			a.nombre.localeCompare(b.nombre, 'es') ||
			a.areteId.localeCompare(b.areteId, 'es')
		);

	const edges = source.edges.filter(
		(edge) => availableIds.has(edge.from) && availableIds.has(edge.to)
	);

	return {
		focusId,
		nodes,
		edges,
		availableIds
	};
}
