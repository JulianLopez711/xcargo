// src/routes/adminRoutes/adminRoutes.tsx
export const adminRoutes = [
  { 
    name: "Dashboard", 
    path: "/admin/dashboard", 
    permission: "admin_dashboard",
    icon: "📊"
  },
  { 
    name: "Usuarios", 
    path: "/admin/usuarios", 
    permission: "admin_usuarios",
    icon: "👥"
  },
  { 
    name: "Entregas", 
    path: "/admin/entregas", 
    permission: "admin_dashboard",
    icon: "📦"
  },
  { 
    name: "Roles y Permisos", 
    path: "/admin/roles", 
    permission: "admin_roles",
    icon: "🔐"
  },
  { 
    name: "Configuración", 
    path: "/admin/configuracion", 
    permission: "admin_dashboard",

  },
];

export const getAvailableAdminRoutes = (userPermissions: Array<{id: string}>) => {
  return adminRoutes.filter(route => 
    userPermissions.some(permission => permission.id === route.permission)
  );
};