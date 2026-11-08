/* ============================================================
   AppXpand · Plataforma de comerciales · CONFIGURACIÓN
   ------------------------------------------------------------
   Aquí das de alta (o de baja) a los comerciales.
   Cada usuario tiene un "hash" (huella SHA-256 de su código de alta),
   así el código nunca aparece escrito en el archivo.

   Para añadir un comercial:
   1. Entra con tu código de administrador → pestaña "Equipo".
   2. Usa el "Generador de códigos": te da el código para el comercial
      y la línea ya preparada para pegar en la lista de abajo.
   3. Sube de nuevo este archivo a Netlify.

   Para dar de baja a alguien: borra su línea y vuelve a subir el archivo.

   ⚠️ CÓDIGOS DE EJEMPLO (cámbialos antes de publicar):
      ADMIN-2026   → administrador
      LAURA-1234   → comercial
      PABLO-5678   → comercial
      MARTA-9012   → comercial
   ============================================================ */
window.CRM_CONFIG = {
  brand: 'AppXpand',
  siteUrl: 'https://appxpand.netlify.app',

  // No cambies la sal si ya has generado códigos: invalidaría todos los hashes.
  salt: 'appxpand|',

  // Horas que dura la sesión si marcan "Mantener sesión" (si no, hasta cerrar la pestaña)
  rememberHours: 24 * 14,

  users: [
    { id: 'admin', name: 'Administrador', role: 'admin',     hash: 'e2a6fdcb516a4539cec2665fef75670da4c8b156cbfe48f68ab2e5f4af1b293a' },
    { id: 'laura', name: 'Laura',         role: 'comercial', hash: '1e574f6ef16e2141d82f7585fc296e0a7a939fd4b80be2a885488a766ca2c414' },
    { id: 'pablo', name: 'Pablo',         role: 'comercial', hash: '918a20787f81bf8e5bd2212688989d98439a05bac1e55eee31d6a4b236ce1f72' },
    { id: 'marta', name: 'Marta',         role: 'comercial', hash: '84a97c41dee0e0dda2e7b9b889a407f4c5ea1ec9a3d4f7f6ecec5287066d94cb' }
  ]
};
