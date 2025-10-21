README - Integración de la plantilla

Esta carpeta `Prepared` contiene borradores en formato LaTeX pensados para integrarse en la plantilla `MIA-USA` que se encuentra en la raíz del proyecto.

Instrucciones rápidas:
1. Copia los archivos de `Prepared` a las carpetas correspondientes en `FrontMatter/`, `MainMatter/Cap0/` y `BackMatter/` según corresponda.
   - `B01-Abstract.tex` -> `FrontMatter/F04-Abstract.tex` (o reemplazar contenido existente)
   - `F02-Dedication.tex` -> `FrontMatter/F02-Dedication.tex`
   - `F03-Acknowledgements.tex` -> `FrontMatter/F03-Acknowledgements.tex`
   - `M01-Introduction.tex` -> `MainMatter/Cap0/M01-Introduction.tex`
   - `Objectives.tex` -> `MainMatter/Cap0/M05-Objectives.tex`
2. Reemplaza los marcadores de nombre y cargos (por ejemplo, `[Nombre del Director]`) por los datos reales.
3. Imágenes: coloca tus imágenes en `Images/` o crea una subcarpeta `Images/Project` y actualiza las rutas en los archivos `.tex` usando `\includegraphics[width=...]{Images/Project/mi_imagen.jpg}`.
4. Para compilar: desde `ProyectoGrado` ejecutar tu flujo LaTeX preferido, por ejemplo `pdflatex main.tex` (ejecutar 2-3 veces y luego `bibtex` si usas bibliografía).

Recomendaciones de estilo y anti-plagio:
- Usa lenguaje propio: evita copiar párrafos largos de otras fuentes. Si citás textualmente, usa comillas y cita en `referencias.bib`.
- Escribe en un tono académico pero natural. Evita frases demasiado genéricas.
- Revisa con herramientas anti-plagio sólo como control; la mejor práctica es parafrasear y referenciar.

Si quieres, puedo:
- Incluir figuras de ejemplo en el lugar reservado (con tamaños y captions).
- Generar una versión ya integrada de `main.tex` con los textos reemplazados y una estructura lista para compilar.
