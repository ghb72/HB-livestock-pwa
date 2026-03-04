import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, Save, Info } from "lucide-react";
import { addDays, subDays, format } from "date-fns";
import { db } from "../../db";
import { generateId, now, currentUserId } from "../../db/helpers";
import { FormField, SelectField } from "../../components/ui";
import type { ReproductionRecord, PrenezEstado, Animal } from "../../types";

const PRENEZ_OPTIONS: PrenezEstado[] = ["Pendiente", "Sí", "No"];
const SEXOS = ["Macho", "Hembra"] as const;

/** Cattle gestation period: ~283 days */
const GESTATION_DAYS = 283;

type EventMode = "monta" | "parto";

const today = () => new Date().toISOString().split("T")[0];
const gestationAgo = () =>
  format(subDays(new Date(), GESTATION_DAYS), "yyyy-MM-dd");

/**
 * Reproduction form — register breeding events (monta) or births (parto).
 * In "parto" mode a new calf animal record is created alongside the
 * reproduction record in a single Dexie transaction.
 */
export default function ReproductionFormPage() {
  const [searchParams] = useSearchParams();
  const preselectedAnimal = searchParams.get("animal") ?? "";
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);

  // ── Mode selector ──────────────────────────────────────────────────
  const [mode, setMode] = useState<EventMode>("monta");

  // Track whether the user manually edited dates so we don't overwrite
  const [userEditedMonta, setUserEditedMonta] = useState(false);
  const [userEditedParto, setUserEditedParto] = useState(false);

  const animals = useLiveQuery(() => db.animals.toArray()) ?? [];
  const cows = animals
    .filter((a) => a.sexo === "Hembra")
    .map((a) => `${a.animal_id} - ${a.nombre}`);

  const bullOptions = [
    ...animals
      .filter((a) => a.sexo === "Macho")
      .map((a) => `${a.animal_id} - ${a.nombre}`),
    "Toro externo (ver notas)",
  ];

  // ── Reproduction form state ────────────────────────────────────────
  const [form, setForm] = useState({
    vaca_id: preselectedAnimal
      ? cows.find((c) => c.startsWith(preselectedAnimal)) ?? preselectedAnimal
      : "",
    semental_id: "",
    fecha_monta: today(),
    prenez_confirmada: "Pendiente" as string,
    fecha_parto_real: "",
    cria_id: "",
    peso_destete_cria: "",
    notas: "",
  });

  // ── Calf mini-form state (parto mode only) ─────────────────────────
  const [calf, setCalf] = useState({
    nombre: "",
    arete_id: "",
    sexo: "Hembra" as "Macho" | "Hembra",
    raza: "",
    peso_nacimiento: "",
  });

  // Auto-calculate expected birth date (shown in monta mode)
  const fechaPosibleParto = form.fecha_monta
    ? format(addDays(new Date(form.fecha_monta), GESTATION_DAYS), "yyyy-MM-dd")
    : "";

  const update = (field: string) => (value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const updateCalf = (field: string) => (value: string) => {
    setCalf((prev) => ({ ...prev, [field]: value }));
  };

  // ── Mode switching ─────────────────────────────────────────────────
  const switchMode = (newMode: EventMode) => {
    setMode(newMode);
    setForm((prev) => {
      const next = { ...prev };
      if (newMode === "monta") {
        if (!userEditedMonta) next.fecha_monta = today();
        next.fecha_parto_real = "";
      } else {
        // parto
        if (!userEditedMonta) next.fecha_monta = gestationAgo();
        if (!userEditedParto) next.fecha_parto_real = today();
        next.prenez_confirmada = "Sí";
      }
      return next;
    });
  };

  const isExternalBull = form.semental_id === "Toro externo (ver notas)";

  // ── Submit ─────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);

    try {
      const timestamp = now();
      const userId = currentUserId();
      const reproId = generateId("REP");

      // Resolve the vaca_id raw value (strip display label)
      const vacaIdRaw = form.vaca_id.includes(" - ")
        ? form.vaca_id.split(" - ")[0]
        : form.vaca_id;

      // Resolve semental_id
      const sementalIdRaw = isExternalBull
        ? "EXTERNO"
        : form.semental_id.includes(" - ")
          ? form.semental_id.split(" - ")[0]
          : form.semental_id;

      if (mode === "parto") {
        // ── Parto: create calf + reproduction record in one transaction ──
        const calfAnimalId = `${calf.nombre}-${calf.arete_id || reproId}`;

        // Derive mother's raza for calf if not overridden
        const motherAnimal = animals.find((a) => a.animal_id === vacaIdRaw);
        const calfRaza = calf.raza || motherAnimal?.raza || "";

        const newCalf: Animal = {
          animal_id: calfAnimalId,
          arete_id: calf.arete_id,
          nombre: calf.nombre,
          tipo: "Becerro(a)",
          sexo: calf.sexo,
          fecha_nacimiento: form.fecha_parto_real || today(),
          raza: calfRaza,
          madre_id: vacaIdRaw,
          padre_id: sementalIdRaw,
          temperamento: "Normal",
          estado: "Vivo(a)",
          peso_actual: calf.peso_nacimiento ? Number(calf.peso_nacimiento) : null,
          notas: "",
          foto_url: "",
          created_by: userId,
          updated_at: timestamp,
          created_at: timestamp,
          _sync_status: "pending",
        };

        const record: ReproductionRecord = {
          reproduccion_id: reproId,
          vaca_id: vacaIdRaw,
          semental_id: sementalIdRaw,
          fecha_monta: form.fecha_monta,
          fecha_posible_parto: fechaPosibleParto,
          prenez_confirmada: "Sí",
          fecha_parto_real: form.fecha_parto_real,
          cria_id: calfAnimalId,
          peso_destete_cria: form.peso_destete_cria
            ? Number(form.peso_destete_cria)
            : null,
          notas: form.notas,
          created_by: userId,
          updated_at: timestamp,
          created_at: timestamp,
          _sync_status: "pending",
        };

        await db.transaction("rw", db.animals, db.reproduction, async () => {
          await db.animals.add(newCalf);
          await db.reproduction.add(record);
        });
      } else {
        // ── Monta: single reproduction record ───────────────────────────
        const record: ReproductionRecord = {
          reproduccion_id: reproId,
          vaca_id: vacaIdRaw,
          semental_id: sementalIdRaw,
          fecha_monta: form.fecha_monta,
          fecha_posible_parto: fechaPosibleParto,
          prenez_confirmada: form.prenez_confirmada as PrenezEstado,
          fecha_parto_real: form.fecha_parto_real,
          cria_id: form.cria_id.split(" - ")[0],
          peso_destete_cria: form.peso_destete_cria
            ? Number(form.peso_destete_cria)
            : null,
          notas: form.notas,
          created_by: userId,
          updated_at: timestamp,
          created_at: timestamp,
          _sync_status: "pending",
        };

        await db.reproduction.add(record);
      }

      navigate(-1);
    } finally {
      setSaving(false);
    }
  };

  // ── Derived: can we submit? ────────────────────────────────────────
  const canSubmit =
    !!form.vaca_id &&
    !!form.semental_id &&
    (mode === "monta" || (!!calf.nombre && !!calf.sexo));

  return (
    <div className="mx-auto max-w-lg">
      {/* Header */}
      <div className="mb-4 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="rounded-full p-2 text-gray-600 hover:bg-gray-200"
          aria-label="Volver"
        >
          <ArrowLeft size={24} />
        </button>
        <h2 className="text-xl font-bold text-gray-800">Parto/Monta</h2>
      </div>

      {/* ── Mode selector ── */}
      <div className="mb-5 grid grid-cols-2 gap-2 rounded-xl bg-gray-100 p-1">
        <button
          type="button"
          onClick={() => switchMode("monta")}
          className={`rounded-lg py-3 text-sm font-semibold transition-all ${
            mode === "monta"
              ? "bg-white text-pink-700 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          🐂 Monta
        </button>
        <button
          type="button"
          onClick={() => switchMode("parto")}
          className={`rounded-lg py-3 text-sm font-semibold transition-all ${
            mode === "parto"
              ? "bg-white text-pink-700 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          🐄 Parto
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* ── Calf mini-form (parto only) ── */}
        {mode === "parto" && (
          <div className="rounded-xl border border-pink-200 bg-pink-50 p-4 space-y-3">
            <p className="text-sm font-semibold text-pink-700">
              🐮 Datos de la cría (nuevo animal)
            </p>

            <FormField
              label="Nombre de la cría"
              name="calf_nombre"
              value={calf.nombre}
              onChange={updateCalf("nombre")}
              placeholder="Ej: Lucero"
              required
            />

            <div className="grid grid-cols-2 gap-3">
              <FormField
                label="No. Arete (opcional)"
                name="calf_arete"
                value={calf.arete_id}
                onChange={updateCalf("arete_id")}
                placeholder="Ej: A099"
              />
              <SelectField
                label="Sexo"
                name="calf_sexo"
                value={calf.sexo}
                onChange={(v) =>
                  setCalf((p) => ({ ...p, sexo: v as "Macho" | "Hembra" }))
                }
                options={[...SEXOS]}
                required
              />
            </div>

            <FormField
              label="Raza"
              name="calf_raza"
              value={calf.raza}
              onChange={updateCalf("raza")}
              placeholder="Ej: Brahman (hereda de la madre)"
            />

            <FormField
              label="Peso al nacer (kg, opcional)"
              name="calf_peso"
              type="number"
              value={calf.peso_nacimiento}
              onChange={updateCalf("peso_nacimiento")}
              placeholder="Ej: 35"
            />
          </div>
        )}

        {/* ── Vaca ── */}
        <SelectField
          label="Vaca"
          name="vaca_id"
          value={form.vaca_id}
          onChange={update("vaca_id")}
          options={cows}
          required
        />

        {/* ── Semental ── */}
        <SelectField
          label="Semental"
          name="semental_id"
          value={form.semental_id}
          onChange={update("semental_id")}
          options={bullOptions}
          required
        />

        {/* External bull notice */}
        {isExternalBull && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
            <Info size={16} className="mt-0.5 shrink-0 text-amber-600" />
            <span className="text-sm text-amber-800">
              Anota el nombre del semental en el campo{" "}
              <strong>Notas</strong> al final del formulario.
            </span>
          </div>
        )}

        {/* ── Fecha de monta ── */}
        <FormField
          label="Fecha de monta observada"
          name="fecha_monta"
          type="date"
          value={form.fecha_monta}
          onChange={(v) => {
            setUserEditedMonta(true);
            update("fecha_monta")(v);
          }}
        />

        {/* Monta mode: show expected birth banner */}
        {mode === "monta" && fechaPosibleParto && (
          <div className="rounded-lg bg-pink-50 px-4 py-3">
            <span className="text-sm text-pink-700">
              Posible parto:{" "}
              <strong>{fechaPosibleParto}</strong> (~{GESTATION_DAYS} días)
            </span>
          </div>
        )}

        {/* ── Fecha de parto real ── */}
        <FormField
          label="Fecha de parto real"
          name="fecha_parto_real"
          type="date"
          value={form.fecha_parto_real}
          onChange={(v) => {
            setUserEditedParto(true);
            update("fecha_parto_real")(v);
          }}
        />

        {/* Parto mode: show estimated mating date info */}
        {mode === "parto" && form.fecha_parto_real && (
          <div className="rounded-lg bg-blue-50 px-4 py-3">
            <span className="text-sm text-blue-700">
              Fecha de monta estimada calculada basada en el ciclo gestacional
              de {GESTATION_DAYS} días.
            </span>
          </div>
        )}

        {/* ── Preñez confirmada (monta only) ── */}
        {mode === "monta" && (
          <SelectField
            label="Preñez confirmada"
            name="prenez_confirmada"
            value={form.prenez_confirmada}
            onChange={update("prenez_confirmada")}
            options={PRENEZ_OPTIONS}
          />
        )}

        {/* ── Cría (existing animal link, monta only) ── */}
        {mode === "monta" && (
          <>
            <SelectField
              label="Cría (si ya nació)"
              name="cria_id"
              value={form.cria_id}
              onChange={update("cria_id")}
              options={animals.map((a) => `${a.animal_id} - ${a.nombre}`)}
              placeholder="Seleccionar cría..."
            />

            <FormField
              label="Peso al destete de la cría (kg)"
              name="peso_destete_cria"
              type="number"
              value={form.peso_destete_cria}
              onChange={update("peso_destete_cria")}
              placeholder="Ej: 180"
            />
          </>
        )}

        {/* ── Notas ── */}
        <FormField
          label="Notas"
          name="notas"
          type="textarea"
          value={form.notas}
          onChange={update("notas")}
          placeholder={
            isExternalBull
              ? "Nombre del semental externo y observaciones..."
              : "Observaciones..."
          }
        />

        <button
          type="submit"
          disabled={saving || !canSubmit}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-pink-600 py-4 text-base font-bold text-white shadow-sm transition-colors active:bg-pink-700 disabled:opacity-50"
        >
          <Save size={20} />
          {saving ? "Guardando..." : "Guardar registro"}
        </button>
      </form>
    </div>
  );
}
