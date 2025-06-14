// src/routes/supervisorRoutes/supervisorRoutes.ts
export const supervisorRoutes = [
  { 
    name: "Dashboard", 
    path: "/supervisor/dashboard", 
    permission: "supervisor_dashboard",
    icon: "📊"
  },
  { 
    name: "Conductores", 
    path: "/supervisor/conductores", 
    permission: "supervisor_conductores",
    icon: "👥"
  },
  { 
    name: "Pagos", 
    path: "/supervisor/pagos", 
    permission: "supervisor_pagos",
    icon: "💰"
  },
  { 
    name: "Guías Pendientes", 
    path: "/supervisor/guias-pendientes", 
    permission: "supervisor_guias",
    icon: "📦"
  },
  { 
    name: "Guías Entregadas", 
    path: "/supervisor/guias-entregadas", 
    permission: "supervisor_guias",
    icon: "✅"
  },
];

// Función para obtener rutas disponibles según permisos del usuario
export const getAvailableSupervisorRoutes = (userPermissions: Array<{id: string}>) => {
  return supervisorRoutes.filter(route => 
    userPermissions.some(permission => permission.id === route.permission)
  );
};

// Función adicional para verificar si el usuario puede acceder a una ruta específica
export const canAccessSupervisorRoute = (routePath: string, userPermissions: Array<{id: string}>) => {
  const route = supervisorRoutes.find(r => r.path === routePath);
  if (!route) return false;
  
  return userPermissions.some(permission => permission.id === route.permission);
};