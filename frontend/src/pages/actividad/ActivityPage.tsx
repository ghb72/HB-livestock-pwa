import { useLiveQuery } from "dexie-react-hooks";
import { HeartPulse, Baby, Eye, Plus, MapPin, ClipboardList } from "lucide-react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { db } from "../../db";
import { Card, EmptyState } from "../../components/ui";

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

  // Merge all activity into a single timeline
  type ActivityItem = {
    id: string;
    date: string;
    type: "salud" | "reproduccion" | "observacion";
    title: string;
    subtitle: string;
    animalName: string;
  };

  const activities: ActivityItem[] = [
    ...healthRecords.map((h) => ({
      id: h.salud_id,
      date: h.fecha,
      type: "salud" as const,
      title: h.tipo_evento,
      subtitle: h.producto || h.notas || "",
      animalName: animalMap.get(h.animal_id) ?? h.animal_id,
    })),
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
    salud: { icon: HeartPulse, color: "text-blue-600 bg-blue-100" },
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
      ) : (
        <EmptyState
          icon={<HeartPulse size={56} />}
          title="Sin actividad registrada"
          description="Los eventos de salud, reproducción y observaciones aparecerán aquí."
        />
      )}
    </div>
  );
}
