import { useLiveQuery } from "dexie-react-hooks";
import {
  HeartPulse,
  Baby,
  Eye,
  Plus,
  MapPin,
  ClipboardList,
  Check,
  CalendarDays,
} from "lucide-react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { db } from "../../db";
import { Card, EmptyState } from "../../components/ui";
import type { TipoEventoSalud } from "../../types";

const HEALTH_EVENT_ORDER: TipoEventoSalud[] = [
  "Vacuna",
  "Desparasitación",
  "Vitamina",
  "Enfermedad",
  "Tratamiento",
  "Revisión",
];

/**
 * Activity feed — unified view of health, reproduction, and observation records,
 * sorted by most recent first.
 */
export default function ActivityPage() {
  const healthRecords = useLiveQuery(() => db.health.toArray()) ?? [];
  const reproRecords = useLiveQuery(() => db.reproduction.toArray()) ?? [];
  const observations = useLiveQuery(() => db.observations.toArray()) ?? [];
  const animals = useLiveQuery(() => db.animals.toArray()) ?? [];

  // Build animal name lookup
  const animalMap = new Map(
    animals.map((a) => [a.animal_id, a.nombre || a.arete_id]),
  );

  type HealthAnimalRow = {
    animalId: string;
    animalName: string;
    eventTypes: Set<TipoEventoSalud>;
    notes: Set<string>;
  };

  type HealthBatch = {
    date: string;
    eventTypes: TipoEventoSalud[];
    animals: HealthAnimalRow[];
  };

  const healthBatches: HealthBatch[] = (() => {
    const byDate = new Map<string, Map<string, HealthAnimalRow>>();

    healthRecords.forEach((record) => {
      const dateMap = byDate.get(record.fecha) ?? new Map<string, HealthAnimalRow>();
      const animalName = animalMap.get(record.animal_id) ?? record.animal_id;
      const animalRow = dateMap.get(record.animal_id) ?? {
        animalId: record.animal_id,
        animalName,
        eventTypes: new Set<TipoEventoSalud>(),
        notes: new Set<string>(),
      };

      animalRow.eventTypes.add(record.tipo_evento);
      if (record.notas?.trim()) {
        animalRow.notes.add(record.notas.trim());
      }

      dateMap.set(record.animal_id, animalRow);
      byDate.set(record.fecha, dateMap);
    });

    return [...byDate.entries()]
      .sort(([dateA], [dateB]) => dateB.localeCompare(dateA))
      .map(([date, animalRows]) => {
        const animalsInBatch = [...animalRows.values()].sort((a, b) =>
          a.animalName.localeCompare(b.animalName),
        );
        const eventTypesInBatch = HEALTH_EVENT_ORDER.filter((type) =>
          animalsInBatch.some((row) => row.eventTypes.has(type)),
        );

        return {
          date,
          eventTypes: eventTypesInBatch,
          animals: animalsInBatch,
        };
      });
  })();

  type ActivityItem = {
    id: string;
    date: string;
    type: "reproduccion" | "observacion";
    title: string;
    subtitle: string;
    animalName: string;
  };

  const activities: ActivityItem[] = [
    ...reproRecords.map((r) => ({
      id: r.reproduccion_id,
      date: r.fecha_monta,
      type: "reproduccion" as const,
      title: r.prenez_confirmada === "Sí" ? "Preñez confirmada" : "Monta registrada",
      subtitle: r.fecha_posible_parto
        ? `Posible parto: ${r.fecha_posible_parto}`
        : "",
      animalName: animalMap.get(r.vaca_id) ?? r.vaca_id,
    })),
    ...observations.map((o) => ({
      id: o.observacion_id,
      date: o.fecha,
      type: "observacion" as const,
      title: "Observación",
      subtitle: o.notas.slice(0, 80),
      animalName: animalMap.get(o.animal_id) ?? o.animal_id,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  const iconMap = {
    reproduccion: { icon: Baby, color: "text-pink-600 bg-pink-100" },
    observacion: { icon: Eye, color: "text-purple-600 bg-purple-100" },
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "";
    try {
      return format(new Date(dateStr), "d MMM yyyy", { locale: es });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-800">Actividad</h2>
        <div className="flex gap-2">
          <Link
            to="/actividad/recorridos"
            className="flex items-center gap-1 rounded-lg bg-green-700 px-3 py-2 text-xs font-semibold text-white"
          >
            <MapPin size={14} /> Recorridos
          </Link>
          <Link
            to="/actividad/calendario-reproductivo"
            className="flex items-center gap-1 rounded-lg bg-pink-700 px-3 py-2 text-xs font-semibold text-white"
          >
            <CalendarDays size={14} /> Repro
          </Link>
          <Link
            to="/actividad/salud/nuevo"
            className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white"
            title="Evento masivo"
          >
            <ClipboardList size={14} /> Salud
          </Link>
          <Link
            to="/actividad/salud/individual"
            className="flex items-center gap-1 rounded-lg bg-blue-400 px-3 py-2 text-xs font-semibold text-white"
            title="Evento individual"
          >
            <Plus size={14} /> 1 Salud
          </Link>
          <Link
            to="/actividad/reproduccion/nuevo"
            className="flex items-center gap-1 rounded-lg bg-pink-600 px-3 py-2 text-xs font-semibold text-white"
          >
            <Plus size={14} /> Repro
          </Link>
          <Link
            to="/actividad/observacion/nuevo"
            className="flex items-center gap-1 rounded-lg bg-purple-600 px-3 py-2 text-xs font-semibold text-white"
          >
            <Plus size={14} /> Obs
          </Link>
        </div>
      </div>

      {healthBatches.length > 0 && (
        <section className="space-y-2">
          {healthBatches.map((batch) => (
            <Card key={`health-${batch.date}`} className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="rounded-lg bg-blue-100 p-2 text-blue-600">
                    <HeartPulse size={18} />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-800">Evento de salud</p>
                    <p className="text-xs text-gray-500">
                      {batch.animals.length} animal
                      {batch.animals.length !== 1 ? "es" : ""}
                    </p>
                  </div>
                </div>
                <span className="shrink-0 text-xs text-gray-400">
                  {formatDate(batch.date)}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-500">
                      <th className="px-2 py-2 text-left">Animal</th>
                      {batch.eventTypes.map((eventType) => (
                        <th key={eventType} className="px-2 py-2 text-center">
                          {eventType}
                        </th>
                      ))}
                      <th className="px-2 py-2 text-left">Notas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batch.animals.map((animalRow) => (
                      <tr
                        key={`${batch.date}-${animalRow.animalId}`}
                        className="border-b border-gray-50 last:border-b-0"
                      >
                        <td className="px-2 py-2 align-top">
                          <p className="font-medium text-gray-800">
                            {animalRow.animalName}
                          </p>
                          <p className="text-xs text-gray-400">{animalRow.animalId}</p>
                        </td>

                        {batch.eventTypes.map((eventType) => (
                          <td
                            key={`${batch.date}-${animalRow.animalId}-${eventType}`}
                            className="px-2 py-2 text-center align-top"
                          >
                            {animalRow.eventTypes.has(eventType) ? (
                              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-green-100 text-green-700">
                                <Check size={14} />
                              </span>
                            ) : (
                              <span className="inline-block h-6 w-6 rounded-full bg-gray-100" />
                            )}
                          </td>
                        ))}

                        <td className="px-2 py-2 align-top text-xs text-gray-600">
                          {[...animalRow.notes].join(" · ") || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}
        </section>
      )}

      {activities.length > 0 ? (
        <div className="space-y-2">
          {activities.map((item) => {
            const { icon: Icon, color } = iconMap[item.type];
            return (
              <Card key={item.id} className="flex items-start gap-3">
                <div className={`mt-0.5 rounded-lg p-2 ${color}`}>
                  <Icon size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-gray-800">
                      {item.title}
                    </span>
                    <span className="shrink-0 text-xs text-gray-400">
                      {formatDate(item.date)}
                    </span>
                  </div>
                  <p className="text-sm text-green-700">{item.animalName}</p>
                  {item.subtitle && (
                    <p className="truncate text-xs text-gray-500">
                      {item.subtitle}
                    </p>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      ) : healthBatches.length === 0 ? (
        <EmptyState
          icon={<HeartPulse size={56} />}
          title="Sin actividad registrada"
          description="Los eventos de salud, reproducción y observaciones aparecerán aquí."
        />
      ) : null}
    </div>
  );
}
