import { useLiveQuery } from "dexie-react-hooks";
import { Plus, DollarSign } from "lucide-react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { db } from "../../db";
import { Card, EmptyState } from "../../components/ui";

/**
 * Sales list — overview of all sales with financial summary.
 */
export default function SalesListPage() {
  const sales = useLiveQuery(async () => {
    const all = await db.sales.toArray();
    return all.sort((a, b) => b.fecha_venta.localeCompare(a.fecha_venta));
  }) ?? [];

  const animals = useLiveQuery(() => db.animals.toArray()) ?? [];
  const animalMap = new Map(
    animals.map((a) => [a.animal_id, a.nombre || a.arete_id]),
  );

  // Summary stats
  const totalRevenue = sales.reduce(
    (sum, s) => sum + (s.precio_total ?? 0),
    0,
  );
  const totalWeight = sales.reduce((sum, s) => sum + (s.peso ?? 0), 0);
  const avgPriceKg =
    totalWeight > 0 ? (totalRevenue / totalWeight).toFixed(2) : "0";

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
        <h2 className="text-xl font-bold text-gray-800">Ventas</h2>
        <Link
          to="/ventas/nuevo"
          className="flex items-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm"
        >
          <Plus size={18} />
          Nueva venta
        </Link>
      </div>

      {/* Financial summary */}
      {sales.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          <Card className="text-center">
            <p className="text-lg font-bold text-green-700">
              ${totalRevenue.toLocaleString()}
            </p>
            <p className="text-xs text-gray-500">Ingresos totales</p>
          </Card>
          <Card className="text-center">
            <p className="text-lg font-bold text-amber-700">
              {sales.length}
            </p>
            <p className="text-xs text-gray-500">Ventas</p>
          </Card>
          <Card className="text-center">
            <p className="text-lg font-bold text-blue-700">${avgPriceKg}</p>
            <p className="text-xs text-gray-500">Prom. $/kg</p>
          </Card>
        </div>
      )}

      {/* Sales list */}
      {sales.length > 0 ? (
        <div className="space-y-2">
          {sales.map((sale) => (
            <Card key={sale.venta_id} className="flex items-center gap-3">
              <div className="rounded-xl bg-amber-100 p-2.5 text-amber-700">
                <DollarSign size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-gray-800">
                    {animalMap.get(sale.animal_id) ?? sale.animal_id}
                  </span>
                  <span className="font-bold text-green-700">
                    ${sale.precio_total?.toLocaleString() ?? "—"}
                  </span>
                </div>
                <div className="flex gap-3 text-xs text-gray-500">
                  <span>{formatDate(sale.fecha_venta)}</span>
                  <span>{sale.motivo_venta}</span>
                  {sale.peso && <span>{sale.peso} kg</span>}
                  {sale.comprador && <span>{sale.comprador}</span>}
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<DollarSign size={56} />}
          title="Sin ventas registradas"
          description="Las ventas de ganado aparecerán aquí."
          action={
            <Link
              to="/ventas/nuevo"
              className="rounded-xl bg-amber-600 px-6 py-3 font-semibold text-white shadow-sm"
            >
              Registrar venta
            </Link>
          }
        />
      )}
    </div>
  );
}
