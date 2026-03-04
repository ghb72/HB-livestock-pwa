import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ArrowLeft,
  AlertTriangle,
  CheckCircle,
  Clock,
  Heart,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Baby,
} from "lucide-react";
import {
  differenceInDays,
  addMonths,
  subMonths,
  format,
  parseISO,
  isValid,
} from "date-fns";
import { es } from "date-fns/locale";
import { db } from "../../db";
import type { Animal, ReproductionRecord } from "../../types";

// ─────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────
const GESTATION_DAYS = 283;
const RECENT_BIRTH_DAYS = 60;   // ≤ 60d → recién parida (verde)
const OPEN_ALERT_DAYS = 90;     // > 90d sin monta tras parto → alerta roja
const CULL_EFFICIENCY = 0.6;    // eficiencia vitalicia mínima aceptable

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────
type Semaforo = "verde" | "azul" | "amarillo" | "rojo" | "gris";

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

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────
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

/**
 * Given all reproduction records for a cow, determine her current
 * reproductive status using inference rules.
 */
function inferSemaforo(
  records: ReproductionRecord[],
  today: Date,
): {
  semaforo: Semaforo;
  semaforoLabel: string;
  lastMontaDate: string | null;
  lastPartoDate: string | null;
  nextExpectedParto: string | null;
  daysOpen: number | null;
} {
  if (records.length === 0) {
    return {
      semaforo: "gris",
      semaforoLabel: "Sin historial",
      lastMontaDate: null,
      lastPartoDate: null,
      nextExpectedParto: null,
      daysOpen: null,
    };
  }

  // Sort records by fecha_monta desc
  const sorted = [...records].sort((a, b) =>
    (b.fecha_monta || "").localeCompare(a.fecha_monta || ""),
  );

  // Most recent confirmed parto
  const partosDesc = [...records]
    .filter((r) => !!r.fecha_parto_real)
    .sort((a, b) => b.fecha_parto_real.localeCompare(a.fecha_parto_real));

  const lastParto = partosDesc[0] ?? null;
  const lastPartoDate = lastParto?.fecha_parto_real ?? null;
  const lastPartoDateObj = safeDate(lastPartoDate);

  // Most recent monta that does NOT have a parto after it
  const lastMontaRecord = sorted.find((r) => {
    const montaDate = safeDate(r.fecha_monta);
    if (!montaDate) return false;
    // No parto recorded AFTER this monta
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
          "yyyy-MM-dd",
        )
      : null);

  // Days open: from last parto to last monta (or today if no monta since)
  let daysOpen: number | null = null;
  if (lastPartoDateObj) {
    const reference = lastMontaDateObj ?? today;
    daysOpen = differenceInDays(reference, lastPartoDateObj);
  }

  // ── Classification ──────────────────────────────────────────────

  // 1. Recién parida (verde)
  if (lastPartoDateObj) {
    const daysSinceParto = differenceInDays(today, lastPartoDateObj);
    if (daysSinceParto <= RECENT_BIRTH_DAYS) {
      return {
        semaforo: "verde",
        semaforoLabel: `Recién parida hace ${daysSinceParto}d`,
        lastMontaDate,
        lastPartoDate,
        nextExpectedParto,
        daysOpen,
      };
    }
  }

  // 2. Active monta within gestation window
  if (lastMontaDateObj) {
    const daysSinceMonta = differenceInDays(today, lastMontaDateObj);

    if (daysSinceMonta <= GESTATION_DAYS) {
      // Confirmed or probable
      if (lastMontaRecord?.prenez_confirmada === "Sí") {
        return {
          semaforo: "azul",
          semaforoLabel: `Gestando confirmada (${daysSinceMonta}d)`,
          lastMontaDate,
          lastPartoDate,
          nextExpectedParto,
          daysOpen,
        };
      }
      return {
        semaforo: "amarillo",
        semaforoLabel: `Gestación probable (${daysSinceMonta}d)`,
        lastMontaDate,
        lastPartoDate,
        nextExpectedParto,
        daysOpen,
      };
    }

    // Monta > 283 days ago and no parto recorded → overdue / review
    return {
      semaforo: "rojo",
      semaforoLabel: `Parto atrasado — revisar (${daysSinceMonta}d)`,
      lastMontaDate,
      lastPartoDate,
      nextExpectedParto,
      daysOpen,
    };
  }

  // 3. Has parto history but no monta since > 90d
  if (lastPartoDateObj) {
    const daysSinceParto = differenceInDays(today, lastPartoDateObj);
    if (daysSinceParto > OPEN_ALERT_DAYS) {
      return {
        semaforo: "rojo",
        semaforoLabel: `Vacía ${daysSinceParto}d sin monta`,
        lastMontaDate,
        lastPartoDate,
        nextExpectedParto,
        daysOpen,
      };
    }
  }

  return {
    semaforo: "gris",
    semaforoLabel: "Sin datos suficientes",
    lastMontaDate,
    lastPartoDate,
    nextExpectedParto,
    daysOpen,
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

// ─────────────────────────────────────────────────────────────────
// Semáforo UI
// ─────────────────────────────────────────────────────────────────
const SEMAFORO_CONFIG: Record<
  Semaforo,
  { icon: React.ComponentType<{ size?: number; className?: string }>; dot: string; badge: string }
> = {
  verde: { icon: CheckCircle, dot: "bg-green-500", badge: "bg-green-100 text-green-800" },
  azul: { icon: Heart, dot: "bg-blue-500", badge: "bg-blue-100 text-blue-800" },
  amarillo: { icon: Clock, dot: "bg-yellow-400", badge: "bg-yellow-100 text-yellow-800" },
  rojo: { icon: AlertTriangle, dot: "bg-red-500", badge: "bg-red-100 text-red-800" },
  gris: { icon: HelpCircle, dot: "bg-gray-300", badge: "bg-gray-100 text-gray-600" },
};

function SemaforoDot({ s }: { s: Semaforo }) {
  return <span className={`inline-block h-3 w-3 rounded-full ${SEMAFORO_CONFIG[s].dot}`} />;
}

// ─────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────
export default function ReproductiveCalendarPage() {
  const navigate = useNavigate();
  const [horizonMonths, setHorizonMonths] = useState(3);
  const [selectedCowId, setSelectedCowId] = useState<string | null>(null);
  const [alertsOpen, setAlertsOpen] = useState(true);

  const animals = useLiveQuery(() => db.animals.toArray()) ?? [];
  const reproRecords = useLiveQuery(() => db.reproduction.toArray()) ?? [];

  const today = useMemo(() => new Date(), []);
  const windowStart = subMonths(today, horizonMonths);
  const windowEnd = addMonths(today, horizonMonths);

  // ── Cows (active hembras) ────────────────────────────────────────
  const cows = useMemo(
    () => animals.filter((a) => a.sexo === "Hembra" && a.estado !== "Vendido(a)" && a.estado !== "Muerto(a)"),
    [animals],
  );

  // ── Per-cow status ───────────────────────────────────────────────
  const cowStatuses: CowStatus[] = useMemo(() => {
    return cows.map((cow) => {
      const records = reproRecords.filter((r) => r.vaca_id === cow.animal_id);
      const inferred = inferSemaforo(records, today);
      return { cow, records, ...inferred };
    });
  }, [cows, reproRecords, today]);

  // ── Herd KPIs ────────────────────────────────────────────────────
  const herdKPIs: HerdKPIs = useMemo(() => {
    const total = cowStatuses.length;
    const confirmed = cowStatuses.filter((c) => c.semaforo === "azul").length;
    const probable = cowStatuses.filter((c) => c.semaforo === "amarillo").length;
    const vacant = cowStatuses.filter((c) => c.semaforo === "rojo").length;
    const recent = cowStatuses.filter((c) => c.semaforo === "verde").length;
    const noHist = cowStatuses.filter((c) => c.semaforo === "gris").length;

    // Average IEP across all cows that have ≥ 2 partos
    const iepValues = cowStatuses
      .map((c) => calcIEP(c.records))
      .filter((v): v is number => v !== null);
    const avgIEP =
      iepValues.length > 0
        ? Math.round(iepValues.reduce((a, b) => a + b, 0) / iepValues.length)
        : null;

    // Birth rate last 12 months
    const cutoff = subMonths(today, 12).toISOString().split("T")[0];
    const births12m = reproRecords.filter(
      (r) => r.fecha_parto_real && r.fecha_parto_real >= cutoff,
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
      birthRate12m,
    };
  }, [cowStatuses, reproRecords, today]);

  // ── Birth Radar (expected partos within window) ───────────────────
  const birthRadar = useMemo(() => {
    return cowStatuses
      .filter((c) => {
        if (!c.nextExpectedParto) return false;
        const d = safeDate(c.nextExpectedParto);
        return d && d >= windowStart && d <= windowEnd;
      })
      .sort((a, b) =>
        (a.nextExpectedParto ?? "").localeCompare(b.nextExpectedParto ?? ""),
      );
  }, [cowStatuses, windowStart, windowEnd]);

  // ── Priority alerts ──────────────────────────────────────────────
  const alerts = useMemo(
    () => cowStatuses.filter((c) => c.semaforo === "rojo" || c.semaforo === "gris"),
    [cowStatuses],
  );

  // ── Selected cow detail ──────────────────────────────────────────
  const selectedStatus = cowStatuses.find((c) => c.cow.animal_id === selectedCowId) ?? null;
  const selectedIEP = selectedStatus ? calcIEP(selectedStatus.records) : null;
  const selectedEff = selectedStatus
    ? calcEfficiency(selectedStatus.cow, selectedStatus.records)
    : null;
  const selectedAge = selectedStatus ? ageInYears(selectedStatus.cow.fecha_nacimiento) : null;
  const selectedPartos = selectedStatus
    ? selectedStatus.records.filter((r) => !!r.fecha_parto_real).length
    : 0;

  const formatD = (dateStr: string | null | undefined) => {
    if (!dateStr) return "—";
    const d = safeDate(dateStr);
    if (!d) return dateStr;
    return format(d, "d MMM yyyy", { locale: es });
  };

  const daysUntil = (dateStr: string | null | undefined): string => {
    if (!dateStr) return "";
    const d = safeDate(dateStr);
    if (!d) return "";
    const diff = differenceInDays(d, today);
    if (diff === 0) return "hoy";
    if (diff > 0) return `en ${diff}d`;
    return `hace ${Math.abs(diff)}d`;
  };

  // ─────────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-lg space-y-5 pb-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="rounded-full p-2 text-gray-600 hover:bg-gray-200"
          aria-label="Volver"
        >
          <ArrowLeft size={24} />
        </button>
        <div>
          <h2 className="text-xl font-bold text-gray-800">Inteligencia Reproductiva</h2>
          <p className="text-xs text-gray-400">Solo lectura — datos calculados</p>
        </div>
      </div>

      {/* ── Horizon selector ── */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-gray-600">Horizonte:</span>
        {[1, 3, 6, 12].map((m) => (
          <button
            key={m}
            onClick={() => setHorizonMonths(m)}
            className={`rounded-full px-3 py-1 text-sm font-semibold transition-colors ${
              horizonMonths === m
                ? "bg-pink-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {m}m
          </button>
        ))}
        <span className="ml-auto text-xs text-gray-400">
          ±{horizonMonths} mes{horizonMonths !== 1 ? "es" : ""}
        </span>
      </div>

      {/* ── Herd KPIs grid ── */}
      <section>
        <h3 className="mb-2 text-sm font-bold uppercase tracking-wider text-gray-500">
          Resumen del hato ({herdKPIs.totalCows} vacas)
        </h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <KpiCard
            label="Gestando confirmada"
            value={`${herdKPIs.gestatingConfirmed}`}
            sub={`${herdKPIs.totalCows > 0 ? Math.round((herdKPIs.gestatingConfirmed / herdKPIs.totalCows) * 100) : 0}%`}
            color="blue"
          />
          <KpiCard
            label="Gestación probable"
            value={`${herdKPIs.gestatingProbable}`}
            sub="inferida"
            color="yellow"
          />
          <KpiCard
            label="Vacías / alerta"
            value={`${herdKPIs.vacant}`}
            sub={`${herdKPIs.totalCows > 0 ? Math.round((herdKPIs.vacant / herdKPIs.totalCows) * 100) : 0}%`}
            color="red"
          />
          <KpiCard
            label="Recién paridas"
            value={`${herdKPIs.recentBirth}`}
            sub={`≤${RECENT_BIRTH_DAYS}d`}
            color="green"
          />
          <KpiCard
            label="IEP promedio"
            value={herdKPIs.avgIEP !== null ? `${herdKPIs.avgIEP}d` : "—"}
            sub={
              herdKPIs.avgIEP !== null
                ? `${(herdKPIs.avgIEP / 30.4).toFixed(1)} meses`
                : "sin datos"
            }
            color="gray"
          />
          <KpiCard
            label="Tasa de parto 12m"
            value={herdKPIs.birthRate12m !== null ? `${herdKPIs.birthRate12m}%` : "—"}
            sub="partos / vacas"
            color="gray"
          />
        </div>
      </section>

      {/* ── Priority alerts ── */}
      {alerts.length > 0 && (
        <section className="rounded-xl border border-red-200 bg-red-50">
          <button
            onClick={() => setAlertsOpen((o) => !o)}
            className="flex w-full items-center justify-between px-4 py-3"
          >
            <span className="flex items-center gap-2 text-sm font-bold text-red-700">
              <AlertTriangle size={16} />
              Alertas prioritarias ({alerts.length})
            </span>
            {alertsOpen ? <ChevronUp size={16} className="text-red-500" /> : <ChevronDown size={16} className="text-red-500" />}
          </button>
          {alertsOpen && (
            <ul className="divide-y divide-red-100 px-4 pb-3">
              {alerts.map(({ cow, semaforo, semaforoLabel }) => (
                <li
                  key={cow.animal_id}
                  className="flex items-center justify-between py-2 cursor-pointer"
                  onClick={() =>
                    setSelectedCowId((id) =>
                      id === cow.animal_id ? null : cow.animal_id,
                    )
                  }
                >
                  <div className="flex items-center gap-2">
                    <SemaforoDot s={semaforo} />
                    <span className="font-medium text-gray-800">{cow.nombre || cow.arete_id}</span>
                  </div>
                  <span className="text-xs text-red-700">{semaforoLabel}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* ── Birth Radar ── */}
      <section>
        <h3 className="mb-2 text-sm font-bold uppercase tracking-wider text-gray-500">
          🎯 Radar de partos esperados
        </h3>
        {birthRadar.length === 0 ? (
          <p className="rounded-xl bg-gray-50 px-4 py-6 text-center text-sm text-gray-400">
            Sin partos estimados en el horizonte de ±{horizonMonths} meses.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
            {birthRadar.map(
              ({ cow, semaforo, semaforoLabel, nextExpectedParto }) => (
                <li
                  key={cow.animal_id}
                  className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-gray-50"
                  onClick={() =>
                    setSelectedCowId((id) =>
                      id === cow.animal_id ? null : cow.animal_id,
                    )
                  }
                >
                  <Baby size={16} className="shrink-0 text-pink-400" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-800">{cow.nombre || cow.arete_id}</p>
                    <p className="text-xs text-gray-500">{semaforoLabel}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-gray-800">
                      {formatD(nextExpectedParto)}
                    </p>
                    <p className="text-xs text-pink-600 font-medium">
                      {daysUntil(nextExpectedParto)}
                    </p>
                  </div>
                  <SemaforoDot s={semaforo} />
                </li>
              ),
            )}
          </ul>
        )}
      </section>

      {/* ── All cows list ── */}
      <section>
        <h3 className="mb-2 text-sm font-bold uppercase tracking-wider text-gray-500">
          Todas las vacas
        </h3>
        {cowStatuses.length === 0 ? (
          <p className="rounded-xl bg-gray-50 px-4 py-6 text-center text-sm text-gray-400">
            No hay hembras activas registradas.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
            {cowStatuses.map(
              ({ cow, semaforo, semaforoLabel, lastPartoDate, daysOpen }) => {
                const isOpen = selectedCowId === cow.animal_id;
                const { badge } = SEMAFORO_CONFIG[semaforo];
                return (
                  <li key={cow.animal_id}>
                    <button
                      className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50"
                      onClick={() =>
                        setSelectedCowId((id) =>
                          id === cow.animal_id ? null : cow.animal_id,
                        )
                      }
                    >
                      <SemaforoDot s={semaforo} />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-800 truncate">
                          {cow.nombre || cow.arete_id}
                        </p>
                        <p className="text-xs text-gray-400 truncate">
                          {cow.arete_id}
                          {lastPartoDate ? ` · Último parto: ${formatD(lastPartoDate)}` : ""}
                          {daysOpen !== null ? ` · ${daysOpen}d abiertos` : ""}
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${badge}`}>
                        {semaforoLabel}
                      </span>
                      {isOpen ? <ChevronUp size={14} className="text-gray-400 shrink-0" /> : <ChevronDown size={14} className="text-gray-400 shrink-0" />}
                    </button>

                    {/* ── Individual detail panel ── */}
                    {isOpen && selectedStatus && (
                      <CowDetailPanel
                        status={selectedStatus}
                        iep={selectedIEP}
                        efficiency={selectedEff}
                        age={selectedAge}
                        totalPartos={selectedPartos}
                        formatD={formatD}
                        daysUntil={daysUntil}
                      />
                    )}
                  </li>
                );
              },
            )}
          </ul>
        )}
      </section>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub: string;
  color: "green" | "blue" | "yellow" | "red" | "gray";
}) {
  const colorMap = {
    green: "border-green-200 bg-green-50 text-green-700",
    blue: "border-blue-200 bg-blue-50 text-blue-700",
    yellow: "border-yellow-200 bg-yellow-50 text-yellow-700",
    red: "border-red-200 bg-red-50 text-red-700",
    gray: "border-gray-200 bg-gray-50 text-gray-700",
  };
  return (
    <div className={`rounded-xl border p-3 ${colorMap[color]}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs font-medium opacity-80">{sub}</p>
      <p className="mt-1 text-xs opacity-60 leading-tight">{label}</p>
    </div>
  );
}

function CowDetailPanel({
  status,
  iep,
  efficiency,
  age,
  totalPartos,
  formatD,
  daysUntil,
}: {
  status: CowStatus;
  iep: number | null;
  efficiency: number | null;
  age: number | null;
  totalPartos: number;
  formatD: (d: string | null | undefined) => string;
  daysUntil: (d: string | null | undefined) => string;
}) {
  const shouldCull = efficiency !== null && efficiency < CULL_EFFICIENCY;
  const { cow, records, daysOpen, nextExpectedParto } = status;

  const sortedHistory = [...records].sort((a, b) =>
    (b.fecha_monta || b.fecha_parto_real || "").localeCompare(
      a.fecha_monta || a.fecha_parto_real || "",
    ),
  );

  return (
    <div className="border-t border-gray-100 bg-gray-50 px-4 py-4 space-y-4">
      {/* Cull warning */}
      {shouldCull && (
        <div className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-600" />
          <p className="text-sm text-red-800">
            <strong>Considerar descarte:</strong> eficiencia vitalicia{" "}
            {efficiency!.toFixed(2)} ({"<"} {CULL_EFFICIENCY}). Esta vaca produce
            menos de 0.6 crías por año productivo, lo que puede no ser económicamente viable.
          </p>
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MiniKpi
          label="Días abiertos"
          value={daysOpen !== null ? `${daysOpen}d` : "—"}
          warn={daysOpen !== null && daysOpen > OPEN_ALERT_DAYS}
        />
        <MiniKpi
          label="IEP"
          value={iep !== null ? `${iep}d` : "—"}
          sub={iep !== null ? `${(iep / 30.4).toFixed(1)} m` : ""}
          warn={iep !== null && iep > 450}
        />
        <MiniKpi label="Total crías" value={`${totalPartos}`} />
        <MiniKpi
          label="Efic. vitalicia"
          value={efficiency !== null ? efficiency.toFixed(2) : age !== null && age <= 2 ? "joven" : "—"}
          sub={age !== null ? `${age.toFixed(1)} años` : ""}
          warn={shouldCull}
        />
      </div>

      {/* Next expected parto */}
      {nextExpectedParto && (
        <div className="rounded-lg bg-pink-50 px-3 py-2 text-sm text-pink-700">
          Parto estimado: <strong>{formatD(nextExpectedParto)}</strong>{" "}
          <span className="font-medium">({daysUntil(nextExpectedParto)})</span>
        </div>
      )}

      {/* Reproductive history */}
      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-500">
          Historial reproductivo ({cow.nombre || cow.arete_id})
        </p>
        {sortedHistory.length === 0 ? (
          <p className="text-sm text-gray-400">Sin registros.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 text-gray-500 uppercase tracking-wide">
                  <th className="px-3 py-2 text-left">Monta</th>
                  <th className="px-3 py-2 text-left">Parto real</th>
                  <th className="px-3 py-2 text-left">Preñez</th>
                  <th className="px-3 py-2 text-left">Cría</th>
                </tr>
              </thead>
              <tbody>
                {sortedHistory.map((r) => (
                  <tr
                    key={r.reproduccion_id}
                    className="border-b border-gray-50 last:border-b-0"
                  >
                    <td className="px-3 py-2 text-gray-700">
                      {formatD(r.fecha_monta)}
                    </td>
                    <td className="px-3 py-2 font-medium text-gray-800">
                      {r.fecha_parto_real ? formatD(r.fecha_parto_real) : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          r.prenez_confirmada === "Sí"
                            ? "bg-green-100 text-green-700"
                            : r.prenez_confirmada === "No"
                              ? "bg-red-100 text-red-600"
                              : "bg-yellow-100 text-yellow-700"
                        }`}
                      >
                        {r.prenez_confirmada}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-500">
                      {r.cria_id || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function MiniKpi({
  label,
  value,
  sub,
  warn,
}: {
  label: string;
  value: string;
  sub?: string;
  warn?: boolean;
}) {
  return (
    <div
      className={`rounded-lg p-2 ${warn ? "bg-red-50 border border-red-200" : "bg-white border border-gray-200"}`}
    >
      <p className={`text-lg font-bold ${warn ? "text-red-700" : "text-gray-800"}`}>
        {value}
      </p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
      <p className="text-xs text-gray-500 leading-tight">{label}</p>
    </div>
  );
}
