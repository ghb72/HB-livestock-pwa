import { createBrowserRouter } from "react-router-dom";
import RootLayout from "../layouts/RootLayout";

import DashboardPage from "../pages/dashboard/DashboardPage";
import AnimalListPage from "../pages/ganado/AnimalListPage";
import AnimalFormPage from "../pages/ganado/AnimalFormPage";
import AnimalDetailPage from "../pages/ganado/AnimalDetailPage";
import ActivityPage from "../pages/actividad/ActivityPage";
import HealthFormPage from "../pages/actividad/HealthFormPage";
import BatchHealthPage from "../pages/actividad/BatchHealthPage";
import ReproductionFormPage from "../pages/actividad/ReproductionFormPage";
import ReproductiveCalendarPage from "../pages/actividad/ReproductiveCalendarPage";
import ObservationFormPage from "../pages/actividad/ObservationFormPage";
import RecorridoPage from "../pages/actividad/RecorridoPage";
import RecorridoListPage from "../pages/actividad/RecorridoListPage";
import RecorridoDetailPage from "../pages/actividad/RecorridoDetailPage";
import SalesListPage from "../pages/ventas/SalesListPage";
import SaleFormPage from "../pages/ventas/SaleFormPage";
import SettingsPage from "../pages/ajustes/SettingsPage";

/**
 * Application router — all routes nested under the root layout
 * which provides the persistent header and bottom tab navigation.
 */
export const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />,
    children: [
      // Dashboard
      { index: true, element: <DashboardPage /> },

      // Ganado
      { path: "ganado", element: <AnimalListPage /> },
      { path: "ganado/nuevo", element: <AnimalFormPage /> },
      { path: "ganado/:id", element: <AnimalDetailPage /> },
      { path: "ganado/:id/editar", element: <AnimalFormPage /> },

      // Actividad
      { path: "actividad", element: <ActivityPage /> },
      { path: "actividad/salud/nuevo", element: <BatchHealthPage /> },
      { path: "actividad/salud/individual", element: <HealthFormPage /> },
      { path: "actividad/reproduccion/nuevo", element: <ReproductionFormPage /> },
      { path: "actividad/observacion/nuevo", element: <ObservationFormPage /> },
      { path: "actividad/recorridos", element: <RecorridoListPage /> },
      { path: "actividad/recorrido/nuevo", element: <RecorridoPage /> },
      { path: "actividad/recorrido/:id", element: <RecorridoDetailPage /> },
      { path: "actividad/calendario-reproductivo", element: <ReproductiveCalendarPage /> },

      // Ventas
      { path: "ventas", element: <SalesListPage /> },
      { path: "ventas/nuevo", element: <SaleFormPage /> },

      // Ajustes
      { path: "ajustes", element: <SettingsPage /> },
    ],
  },
]);
