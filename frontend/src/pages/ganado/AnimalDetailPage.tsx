import { useParams, useNavigate, Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ArrowLeft,
  Edit,
  Trash2,
  HeartPulse,
  Baby,
  Eye,
  DollarSign,
  AlertTriangle,
} from "lucide-react";
import { db } from "../../db";
import { Card, StatusBadge } from "../../components/ui";
import { useMissingAnimals } from "../../hooks/useMissingAnimals";
import { format } from "date-fns";
import { es } from "date-fns/locale";

/**
 * Animal detail view — shows all data for a single animal
 * with links to related health, reproduction, observations, and sales records.
 */
export default function AnimalDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const animal = useLiveQuery(
    () => (id ? db.animals.get(id) : undefined),
    [id],
  );

  const healthRecords = useLiveQuery(
    () =>
      id
        ? db.health.where("animal_id").equals(id).reverse().sortBy("fecha")
        : [],
    [id],
  );

  const reproRecords = useLiveQuery(
    () =>
      id
        ? db.reproduction
            .where("vaca_id")
            .equals(id)
            .or("semental_id")
            .equals(id)
            .reverse()
            .sortBy("fecha_monta")
        : [],
    [id],
  );

  const offspringSummary = useLiveQuery(async () => {
    if (!id) {
      return { count: 0, list: [] as { animal_id: string; nombre: string; arete_id: string }[] };
    }

    const [calvesByMother, birthRecords] = await Promise.all([
      db.animals.where("madre_id").equals(id).toArray(),
      db.reproduction.where("vaca_id").equals(id).toArray(),
    ]);

    const byId = new Map<string, { animal_id: string; nombre: string; arete_id: string }>();

    for (const calf of calvesByMother) {
      byId.set(calf.animal_id, {
        animal_id: calf.animal_id,
        nombre: calf.nombre || "Sin nombre",
        arete_id: String(calf.arete_id ?? ""),
      });
    }

    for (const birth of birthRecords) {
      const calfId = String(birth.cria_id ?? "").trim();
      if (!calfId || byId.has(calfId)) continue;

      const calf = await db.animals.get(calfId);
      if (calf) {
        byId.set(calf.animal_id, {
          animal_id: calf.animal_id,
          nombre: calf.nombre || "Sin nombre",
          arete_id: String(calf.arete_id ?? ""),
        });
      } else {
        byId.set(calfId, {
          animal_id: calfId,
          nombre: calfId,
          arete_id: "",
        });
      }
    }

    return {
      count: byId.size,
      list: Array.from(byId.values()),
    };
  }, [id]);

  const observations = useLiveQuery(
    () =>
      id
        ? db.observations
            .where("animal_id")
            .equals(id)
            .reverse()
            .sortBy("fecha")
        : [],
    [id],
  );

  const sales = useLiveQuery(
    () =>
      id ? db.sales.where("animal_id").equals(id).toArray() : [],
    [id],
  );

  // Load parent names
  const mother = useLiveQuery(
    () =>
      animal?.madre_id ? db.animals.get(animal.madre_id) : undefined,
    [animal?.madre_id],
  );
  const father = useLiveQuery(
    () =>
      animal?.padre_id ? db.animals.get(animal.padre_id) : undefined,
    [animal?.padre_id],
  );

  // Load photo
  const photo = useLiveQuery(
    () => (id ? db.photos.where("animal_id").equals(id).first() : undefined),
    [id],
  );
  const photoSrc = photo?.data_url || photo?.drive_url || "";

  const { missingIds, lastSeenMap } = useMissingAnimals();
  const isMissing = animal ? missingIds.has(animal.animal_id) : false;
  const lastSeen = animal ? lastSeenMap.get(animal.animal_id) : undefined;

  if (!animal) {
    return (
      <div className="flex h-64 items-center justify-center text-gray-500">
        Cargando...
      </div>
    );
  }

  const handleDelete = async () => {
    if (!confirm("¿Estás seguro de eliminar este animal?")) return;
    await db.animals.delete(animal.animal_id);
    navigate("/ganado", { replace: true });
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "—";
    try {
      return format(new Date(dateStr), "d MMM yyyy", { locale: es });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="mx-auto max-w-lg space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/ganado")}
            className="rounded-full p-2 text-gray-600 hover:bg-gray-200"
            aria-label="Volver"
          >
            <ArrowLeft size={24} />
          </button>
          <div>
            <h2 className="text-xl font-bold text-gray-800">
              {animal.nombre || "Sin nombre"}
            </h2>
            <p className="text-sm text-gray-500">
              #{animal.arete_id || "—"} · {animal.tipo}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link
            to={`/ganado/${animal.animal_id}/editar`}
            className="rounded-full bg-green-100 p-2.5 text-green-700 hover:bg-green-200"
            aria-label="Editar"
          >
            <Edit size={18} />
          </Link>
          <button
            onClick={handleDelete}
            className="rounded-full bg-red-100 p-2.5 text-red-700 hover:bg-red-200"
            aria-label="Eliminar"
          >
            <Trash2 size={18} />
          </button>
        </div>
      </div>

      {/* Missing animal warning */}
      {isMissing && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3">
          <AlertTriangle size={20} className="mt-0.5 shrink-0 text-amber-600" />
          <div>
            <p className="text-sm font-semibold text-amber-800">
              Animal no visto recientemente
            </p>
            <p className="text-xs text-amber-600">
              {lastSeen
                ? `Último avistamiento: ${formatDate(lastSeen)}`
                : "Nunca ha sido registrado en un recorrido"}
            </p>
          </div>
        </div>
      )}

      {/* Photo + Avatar + Status */}
      {photoSrc ? (
        <div className="overflow-hidden rounded-xl">
          <img
            src={photoSrc}
            alt={animal.nombre}
            className="h-52 w-full object-cover"
          />
        </div>
      ) : null}

      <Card className="flex items-center gap-4">
        {!photoSrc && (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-green-100 text-2xl font-bold text-green-700">
            {animal.nombre?.charAt(0)?.toUpperCase() ?? "?"}
          </div>
        )}
        <div className="space-y-1">
          <StatusBadge estado={animal.estado} />
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
            <span>Sexo: <strong>{animal.sexo}</strong></span>
            <span>Raza: <strong>{animal.raza || "—"}</strong></span>
            <span>Temp: <strong>{animal.temperamento}</strong></span>
            {animal.peso_actual && (
              <span>Peso: <strong>{animal.peso_actual} kg</strong></span>
            )}
          </div>
        </div>
      </Card>

      {/* Details Grid */}
      <Card>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">
          Información
        </h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <Detail label="Nacimiento" value={formatDate(animal.fecha_nacimiento)} />
          <Detail
            label="Madre"
            value={mother ? `${mother.nombre} (${mother.arete_id})` : animal.madre_id || "—"}
          />
          <Detail
            label="Padre"
            value={father ? `${father.nombre} (${father.arete_id})` : animal.padre_id || "—"}
          />
          <Detail label="Registrado" value={formatDate(animal.created_at)} />
        </div>

        {animal.tipo === "Vaca" && (
          <div className="mt-4 rounded-lg bg-gray-50 p-3">
            <p className="text-xs text-gray-400">Crías registradas</p>
            <p className="text-sm font-semibold text-gray-700">
              {offspringSummary?.count ?? 0}
            </p>
            {offspringSummary && offspringSummary.count > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-gray-600">
                {offspringSummary.list.slice(0, 4).map((calf) => (
                  <li key={calf.animal_id} className="truncate">
                    {calf.nombre}
                    {calf.arete_id ? ` (#${calf.arete_id})` : ""}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {animal.notas && (
          <p className="mt-3 rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
            {animal.notas}
          </p>
        )}
      </Card>

      {/* Quick links to related records */}
      <div className="grid grid-cols-2 gap-3">
        <QuickLink
          to={`/actividad/salud/nuevo?animal=${id}`}
          icon={<HeartPulse size={18} />}
          label="Evento de salud"
          count={healthRecords?.length ?? 0}
          color="bg-blue-50 text-blue-700"
        />
        <QuickLink
          to={`/actividad/reproduccion/nuevo?animal=${id}`}
          icon={<Baby size={18} />}
          label="Reproducción"
          count={reproRecords?.length ?? 0}
          color="bg-pink-50 text-pink-700"
        />
        <QuickLink
          to={`/actividad/observacion/nuevo?animal=${id}`}
          icon={<Eye size={18} />}
          label="Observación"
          count={observations?.length ?? 0}
          color="bg-purple-50 text-purple-700"
        />
        <QuickLink
          to={`/ventas/nuevo?animal=${id}`}
          icon={<DollarSign size={18} />}
          label="Venta"
          count={sales?.length ?? 0}
          color="bg-amber-50 text-amber-700"
        />
      </div>

      {/* Recent health events */}
      {healthRecords && healthRecords.length > 0 && (
        <Card>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">
            Últimos eventos de salud
          </h3>
          <div className="space-y-2">
            {healthRecords.slice(0, 5).map((h) => (
              <div
                key={h.salud_id}
                className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm"
              >
                <div>
                  <span className="font-medium">{h.tipo_evento}</span>
                  {h.producto && (
                    <span className="ml-2 text-gray-500">{h.producto}</span>
                  )}
                </div>
                <span className="text-xs text-gray-400">
                  {formatDate(h.fecha)}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-xs text-gray-400">{label}</span>
      <p className="font-medium text-gray-700">{value}</p>
    </div>
  );
}

function QuickLink({
  to,
  icon,
  label,
  count,
  color,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  count: number;
  color: string;
}) {
  return (
    <Link
      to={to}
      className={`flex items-center gap-2 rounded-xl px-3 py-3 text-sm font-medium transition-colors active:opacity-80 ${color}`}
    >
      {icon}
      <span className="flex-1">{label}</span>
      {count > 0 && (
        <span className="rounded-full bg-white/60 px-2 py-0.5 text-xs font-bold">
          {count}
        </span>
      )}
    </Link>
  );
}
