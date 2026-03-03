import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, Save } from "lucide-react";
import { db } from "../../db";
import { generateId, now, currentUserId } from "../../db/helpers";
import { FormField, SelectField } from "../../components/ui";
import type { Sale, MotivoVenta } from "../../types";

const MOTIVOS: MotivoVenta[] = [
  "Por peso (destete)",
  "Por edad",
  "Por productividad",
  "Otro",
];

/**
 * Sale form — register a livestock sale, auto-compute price per kg.
 */
export default function SaleFormPage() {
  const [searchParams] = useSearchParams();
  const preselectedAnimal = searchParams.get("animal") ?? "";
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);

  const animals = useLiveQuery(() => db.animals.toArray()) ?? [];
  const animalOptions = animals.map(
    (a) => `${a.animal_id} - ${a.nombre}`,
  );

  const [form, setForm] = useState({
    animal_id: preselectedAnimal
      ? animalOptions.find((o) => o.startsWith(preselectedAnimal)) ?? preselectedAnimal
      : "",
    fecha_venta: new Date().toISOString().split("T")[0],
    motivo_venta: "" as string,
    peso: "",
    precio_total: "",
    comprador: "",
    notas: "",
  });

  // Auto-compute price per kg
  const precioKg =
    form.peso && form.precio_total
      ? (Number(form.precio_total) / Number(form.peso)).toFixed(2)
      : "";

  const update = (field: string) => (value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);

    try {
      const timestamp = now();
      const ventaId = generateId("VTA");
      const animalId = form.animal_id.split(" - ")[0];

      const record: Sale = {
        venta_id: ventaId,
        animal_id: animalId,
        fecha_venta: form.fecha_venta,
        motivo_venta: form.motivo_venta as MotivoVenta,
        peso: form.peso ? Number(form.peso) : null,
        precio_total: form.precio_total ? Number(form.precio_total) : null,
        precio_kg: precioKg ? Number(precioKg) : null,
        comprador: form.comprador,
        notas: form.notas,
        created_by: currentUserId(),
        updated_at: timestamp,
        created_at: timestamp,
        _sync_status: "pending",
      };

      // Single transaction: add sale + mark animal as sold
      await db.transaction("rw", db.sales, db.animals, async () => {
        await db.sales.add(record);
        await db.animals.update(animalId, {
          estado: "Vendido(a)",
          updated_at: timestamp,
          _sync_status: "pending",
        });
      });

      navigate("/ventas", { replace: true });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-4 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="rounded-full p-2 text-gray-600 hover:bg-gray-200"
          aria-label="Volver"
        >
          <ArrowLeft size={24} />
        </button>
        <h2 className="text-xl font-bold text-gray-800">Registrar venta</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <SelectField
          label="Animal"
          name="animal_id"
          value={form.animal_id}
          onChange={update("animal_id")}
          options={animalOptions}
          required
        />

        <FormField
          label="Fecha de venta"
          name="fecha_venta"
          type="date"
          value={form.fecha_venta}
          onChange={update("fecha_venta")}
          required
        />

        <SelectField
          label="Motivo de venta"
          name="motivo_venta"
          value={form.motivo_venta}
          onChange={update("motivo_venta")}
          options={MOTIVOS}
          required
        />

        <div className="grid grid-cols-2 gap-3">
          <FormField
            label="Peso (kg)"
            name="peso"
            type="number"
            value={form.peso}
            onChange={update("peso")}
            placeholder="Ej: 450"
          />
          <FormField
            label="Precio total ($)"
            name="precio_total"
            type="number"
            value={form.precio_total}
            onChange={update("precio_total")}
            placeholder="Ej: 25000"
          />
        </div>

        {/* Auto-computed price per kg */}
        {precioKg && (
          <div className="rounded-lg bg-amber-50 px-4 py-3">
            <span className="text-sm text-amber-700">
              Precio por kg: <strong>${precioKg} / kg</strong>
            </span>
          </div>
        )}

        <FormField
          label="Comprador"
          name="comprador"
          value={form.comprador}
          onChange={update("comprador")}
          placeholder="Nombre del comprador"
        />

        <FormField
          label="Notas"
          name="notas"
          type="textarea"
          value={form.notas}
          onChange={update("notas")}
          placeholder="Detalles de la venta..."
        />

        <button
          type="submit"
          disabled={saving || !form.animal_id || !form.motivo_venta}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-600 py-4 text-base font-bold text-white shadow-sm transition-colors active:bg-amber-700 disabled:opacity-50"
        >
          <Save size={20} />
          {saving ? "Guardando..." : "Registrar venta"}
        </button>
      </form>
    </div>
  );
}
