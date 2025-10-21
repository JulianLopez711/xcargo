Instrucciones para compilar localmente el proyecto LaTeX (Windows - PowerShell)

Requisitos previos:
- Instalar MiKTeX (https://miktex.org/download) o TeX Live para Windows.
- Instalar Inkscape (https://inkscape.org) para convertir SVG a PDF si es necesario.
- Añadir las rutas de MiKTeX y Inkscape al PATH del sistema si el instalador no lo hizo.

Pasos rápidos (PowerShell):

# 1) Convertir SVG a PDF (si no están ya presentes)
Get-ChildItem -Path .\ProyectoGrado\Images\Project -Filter *.svg | ForEach-Object {
    $svg = $_.FullName
    $pdf = $svg -replace '\.svg$','.pdf'
    & "C:\Program Files\Inkscape\bin\inkscape.exe" "$svg" --export-type=pdf --export-filename="$pdf"
}

# 2) Compilar con latexmk (MiKTeX debe incluir latexmk) o con pdflatex/biber manualmente
cd ProyectoGrado
latexmk -pdf main.tex

# Si latexmk no está disponible, ejecutar p. ej.:
pdflatex main.tex
bibtex main
pdflatex main.tex
pdflatex main.tex

# 3) Resultado
El PDF resultante será `ProyectoGrado\main.pdf`.

Notas:
- Si la compilación falla por paquetes faltantes, usar el administrador de paquetes de MiKTeX para instalar dependencias o configurar la instalación para instalar paquetes bajo demanda.
- Para editar y compilar desde VS Code, instale la extensión LaTeX Workshop y configure el "latex-workshop.latex.tools" si usa compiladores diferentes.
