Checklist del documento de tesis (Proyecto XCargo)

Estado actual:
- [x] Front matter: Título, Abstract, Dedicatoria, Agradecimientos
- [x] Cap0: Introducción, Marco teórico, Planteamiento, Justificación, Objetivos
- [x] Cap1: Metodología (borrador, figuras añadidas)
- [ ] Cap2: Implementación (describir módulos del backend, frontend, despliegue)
- [ ] Cap3: Resultados (pruebas, tablas, métricas)
- [ ] Cap4: Discusión
- [ ] Cap5: Conclusiones y recomendaciones
- [ ] Bibliografía (completa y formateada)
- [ ] Anexos (scripts, tablas grandes, datos de prueba)

Pasos siguientes sugeridos:
1. Completar Cap2 con extractos de `backend/app` y `frontend/src` (resumen de endpoints, modelos y flujos principales).
2. Ejecutar scripts de prueba para generar datos de ejemplo (scripts en `backend/scripts` y `scripts/` del repo).
3. Añadir tablas y gráficos de resultados en Cap3 (usar BigQuery o datos sintéticos).
4. Revisar y formatear la bibliografía; asegurarse de citar trabajos relacionados en Cap0.
5. Ejecutar la compilación en CI (workflow ya creado) o local para validar el PDF final.

Si quieres, puedo:
- Rellenar Cap2 automáticamente extrayendo descripciones de código (endpoints, modelos, responsabilidades).
- Preparar ejemplos de tablas/figuras para Cap3 basados en datos sintéticos.
- Generar la versión final de la bibliografía con campos completos y URLs.
