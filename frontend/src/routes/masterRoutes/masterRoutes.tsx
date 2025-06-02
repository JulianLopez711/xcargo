

export const masterRoutes = [
  {
    name: "Dashboard",
    path: "/master/dashboard",
    permission: "master_dashboard",
  },
  {
    name: "Carriers",
    path: "/master/carriers",
    permission: "master_carriers",
  },
  {
    name: "Supervisores",
    path: "/master/supervisores",
    permission: "master_supervisores",
  },
  {
    name: "Reportes",
    path: "/master/reportes",
    permission: "master_reportes",
  },
  {
    name: "Análisis",
    path: "/master/analisis",
    permission: "master_analisis",
  },
  {
    name: "Configuración",
    path: "/master/configuracion",
    permission: "master_config",
  },
];

export const getAvailableMasterRoutes = (permissions: string[]) =>
  masterRoutes.filter((route) => permissions.includes(route.permission));
