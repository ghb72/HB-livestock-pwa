import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus, Beef, AlertTriangle } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { db } from "../../db";
import { SearchBar, Card, StatusBadge, EmptyState } from "../../components/ui";
import { useMissingAnimals } from "../../hooks/useMissingAnimals";
import type { Animal, AnimalTipo } from "../../types";

const TIPO_FILTERS: AnimalTipo[] = [
  "Vaca",
  "Semental",
  "Becerro(a)",
  "Vaquilla",
  "Torete",
];

/**
 * Animal list — searchable, filterable list of all animals.
 */
export default function AnimalListPage() {
  const [search, setSearch] = useState("");
  const [filterTipo, setFilterTipo] = useState<string>("");
  const navigate = useNavigate();
  const { missingIds } = useMissingAnimals();

  // Load all photo thumbnails for the list
  const photoMap = useLiveQuery(async () => {
    const allPhotos = await db.photos.toArray();
    const map = new Map<string, string>();
    for (const p of allPhotos) {
      map.set(p.animal_id, p.data_url || p.drive_url);
    }
    return map;
  }) ?? new Map<string, string>();

  const animals = useLiveQuery(async () => {
    let query = db.animals.orderBy("nombre");

    const all = await query.toArray();
    const normalizedSearch = search.toLowerCase();

    return all.filter((a) => {
      const nombre = String(a.nombre ?? "").toLowerCase();
      const areteId = String(a.arete_id ?? "").toLowerCase();
      const matchSearch =
        !normalizedSearch ||
        nombre.includes(normalizedSearch) ||
        areteId.includes(normalizedSearch);
      const matchTipo = !filterTipo || a.tipo === filterTipo;
      return matchSearch && matchTipo;
    });
  }, [search, filterTipo]);

  return (
    <div className="mx-auto max-w-lg space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-800">Ganado</h2>
        <Link
          to="/ganado/nuevo"
          className="flex items-center gap-1.5 rounded-xl bg-green-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors active:bg-green-700"
        >
          <Plus size={18} />
          Agregar
        </Link>
      </div>

      {/* Search */}
      <SearchBar value={search} onChange={setSearch} />

      {/* Type filters */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => setFilterTipo("")}
          className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
            filterTipo === ""
              ? "bg-green-600 text-white"
              : "bg-gray-200 text-gray-700"
          }`}
        >
          Todos
        </button>
        {TIPO_FILTERS.map((tipo) => (
          <button
            key={tipo}
            onClick={() => setFilterTipo(tipo === filterTipo ? "" : tipo)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              filterTipo === tipo
                ? "bg-green-600 text-white"
                : "bg-gray-200 text-gray-700"
            }`}
          >
            {tipo}
          </button>
        ))}
      </div>

      {/* Animal list */}
      {animals && animals.length > 0 ? (
        <div className="space-y-2">
          {animals.map((animal) => (
            <AnimalCard
              key={animal.animal_id}
              animal={animal}
              isMissing={missingIds.has(animal.animal_id)}
              photoSrc={photoMap.get(animal.animal_id)}
              onClick={() => navigate(`/ganado/${animal.animal_id}`)}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Beef size={56} />}
          title="Sin animales registrados"
          description="Agrega tu primer animal para comenzar."
          action={
            <Link
              to="/ganado/nuevo"
              className="rounded-xl bg-green-600 px-6 py-3 font-semibold text-white shadow-sm"
            >
              Registrar animal
            </Link>
          }
        />
      )}
    </div>
  );
}

function AnimalCard({
  animal,
  isMissing,
  photoSrc,
  onClick,
}: {
  animal: Animal;
  isMissing: boolean;
  photoSrc?: string;
  onClick: () => void;
}) {
  return (
    <Card onClick={onClick} className="flex items-center gap-3">
      {/* Avatar: photo or initials */}
      {photoSrc ? (
        <img
          src={photoSrc}
          alt={animal.nombre}
          className={`h-12 w-12 shrink-0 rounded-full object-cover ring-2 ${
            isMissing ? "ring-amber-400" : "ring-green-200"
          }`}
        />
      ) : (
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-bold ${
          isMissing
            ? "bg-amber-100 text-amber-700"
            : "bg-green-100 text-green-700"
        }`}>
          {animal.nombre?.charAt(0)?.toUpperCase() ?? "?"}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-semibold text-gray-800">
            {animal.nombre || "Sin nombre"}
          </span>
          <StatusBadge estado={animal.estado} />
          {isMissing && (
            <AlertTriangle
              size={16}
              className="shrink-0 text-amber-500"
              aria-label="Animal no visto recientemente"
            />
          )}
        </div>
        <div className="flex gap-3 text-xs text-gray-500">
          <span>#{animal.arete_id || "—"}</span>
          <span>{animal.tipo}</span>
          <span>{animal.sexo}</span>
          {animal.raza && <span>{animal.raza}</span>}
        </div>
      </div>
    </Card>
  );
}
