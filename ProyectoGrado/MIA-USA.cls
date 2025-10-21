%        1         2         3         4         5         6         7         8         9         0         1         2
%23456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890
% Si los comandos pueden ser usados en cualquier clase de documento, entonces se debe hacer un paquete, de lo contrario 
% se hace una clase.

%% Identificación
%% - -- --- ----- -------

% Indicar que se necesita la version de LaTex2e
\NeedsTeXFormat{LaTeX2e}[1994/06/01]
% Indicar cual es el paquete que se esta creando
%\ProvidesClass{MIA-USA}[2022/06/30 v1.0 Clase para la escritura de los Documentos de trabajo de la Maestria en Inteligencia Artificial de la Universidad Sergio Arboleda]

%% Declaraciones preliminares
%% - -- --- ----- ------- ----------- -------------

  % Obtiene los parámetros con que se invoca la clase y los pasa a la clase 
  \DeclareOption*{\PassOptionsToClass{\CurrentOption}{book}}

  % procesa los parametros
  \ProcessOptions 

  % La clase se basa en la definición de la clase Book
  \LoadClass[letterpaper]{book}

%% Estableciendo el esquema de la página
%% - -- --- ----- ------- ----------- -------------
  \setlength{\hoffset}{-18.4mm}	         % Margen de impresion izquierdo a 25.4 - 18.4 = 7.0 mm
  \setlength{\voffset}{-18.4mm}          % Margen de impresion superior a 25.4 - 18.4 = 7.0 mm
  \setlength{\oddsidemargin}{23.0mm}     % Espacio entre el margen izquierdo y el inicio del texto, 
                                         % El texto comienza a 30 mm
  \setlength{\evensidemargin}{23.0mm}    % Espacio entre el margen izquierdo y el inicio del texto en memoir or book. 
                                         % El texto comienza a 20 mm
  \setlength{\topmargin}{0.0mm}          % Espacio entre el margen superior y el encabezado
  \setlength{\headheight}{20.0mm}        % Alto del espacio para el encabezado
  \setlength{\headsep}{3.0mm}	         % Espacio entre le encabezado y el inicio del texto
  \setlength{\textheight}{219.0mm}       % Establece el alto del espacio que se usa para el texto, 279 - 60 = 219.0 mm
  \setlength{\textwidth}{156.0mm}        % Establece el ancho del espacio que se usa para el texto, 216 - 60 = 156.0 mm
  \setlength{\marginparsep}{2.0mm}       % Espacio entre el fin del texto y las notas al margen
  \setlength{\marginparwidth}{20.0mm}    % Ancho del espacio para las notas al margen
  \setlength{\footskip}{12.mm}           % Espacio del fin del texto hasta el fin del pie de pagina
  \setlength{\marginparpush}{3pt}        % minimo gap vertical entre notas al margen

%% Defieniedo los colores de la Universidad Sergio Arboleda según el manual de estilo
%% - -- --- ----- ------- ----------- ------------- ----------- ------- ----- --- -- -
  \RequirePackage{graphicx}
  \RequirePackage[table]{xcolor}
  \RequirePackage[spanish]{babel}
  \RequirePackage[utf8]{inputenc}
  \usepackage{longtable}
  \usepackage{multirow}
  \usepackage{multicol}
  \usepackage{tcolorbox}
  \usepackage{hhline}
  \usepackage{pdfpages}
  \usepackage[nottoc,numbib]{tocbibind}
  \usepackage{array,colortbl,tabularx}
  \usepackage{makeidx}
  \usepackage{threeparttable}
  \usepackage{amsmath}
  \usepackage{amscd}
  \usepackage{pgfplotstable}
  

  \addto\captionsspanish{
    \renewcommand{\contentsname}{Contenido}
    \renewcommand{\listfigurename}{Lista de figuras}
    \renewcommand{\listtablename}{Lista de tablas}
  }


% Colores Universidad Sergio Arboleda
% - -- --- ----- ------- ----- --- -- -
  \xdefinecolor{Negro}     {RGB}{  0,   0,   0}  % #000000 / 000000
  \xdefinecolor{Blanco}    {RGB}{255, 255, 255}  % #FFFFFF / FFFFFF
  
  \xdefinecolor{AzulInstitucional} {RGB}{   0,  69, 124}  % #00457C
  \xdefinecolor{AzulClaro}         {RGB}{  97, 185, 255}  % #61B9FF
  \xdefinecolor{VerdeClaroDos}     {RGB}{ 121, 189, 129}  % #79BD81FF
  \xdefinecolor{VerdeClaroTres}    {RGB}{ 173, 212, 173}  % #ADD4ADFF
  \xdefinecolor{VerdeClaroCuatro}  {RGB}{ 218, 235, 215}  % #DAEBD7FF
  \xdefinecolor{AzulOscuro}        {RGB}{   0,  43,  76}  % #002B4C
  \xdefinecolor{VerdeOscuroDos}    {RGB}{   0, 107,  42}  % #006B2AFF
  \xdefinecolor{VerdeOscuroTres}   {RGB}{   0,  82,  32}  % #005220FF
  \xdefinecolor{VerdeOscuroCuatro} {RGB}{   0,  56,  20}  % #003814FF

% Otros colores
% - -- --- ----- ------- ----- --- -- -
  \xdefinecolor{AmarilloUno}       {RGB}{ 250, 186,   0}  % #FABA00FF
  \xdefinecolor{AmarilloDos}       {RGB}{ 212, 157,   0}  % #D49D00FF
  \xdefinecolor{NaranjaUno}        {RGB}{ 235, 106,  10}  % #EB6A0AFF
  \xdefinecolor{NaranjaDos}        {RGB}{ 222, 124,  10}  % #DE7C0AFF
  \xdefinecolor{Rojo}              {RGB}{ 226,   0,  26}  % #E2001AFF
  \xdefinecolor{Cafe}              {RGB}{ 167,  76,  33}  % #A74C21FF
  \xdefinecolor{AzulUno}           {RGB}{   0,  64, 141}  % #00408DFF
  \xdefinecolor{AzulDos}           {RGB}{   0, 106, 178}  % #006AB2FF
  \xdefinecolor{AzulTres}          {RGB}{   0, 121, 183}  % #0079B7FF
  \xdefinecolor{GrisUno}           {RGB}{  33,  33,  33}  % #212121FF
  \xdefinecolor{GrisDos}           {RGB}{  74,  74,  74}  % #4A4A4AFF
  \xdefinecolor{GrisTres}          {RGB}{ 112, 112, 112}  % #707070FF
  \xdefinecolor{GrisCuatro}        {RGB}{ 140, 140, 140}  % #8C8C8CFF
  \xdefinecolor{GrisCinco}         {RGB}{ 163, 163, 163}  % #A3A3A3FF
  \xdefinecolor{GrisSeis}          {RGB}{ 185, 185, 185}  % #B9B9B9FF
  \xdefinecolor{GrisSiete}         {RGB}{ 209, 209, 209}  % #D1D1D1FF
  \xdefinecolor{GrisOcho}          {RGB}{ 230, 230, 230}  % #E6E6E6FF
  \xdefinecolor{GrisNueve}         {RGB}{ 245, 245, 245}  % #E6E6E6FF

%% Defiendo nuevos comandos
% - -- --- ----- ------- ----- --- -- -
%Wasser
\newcommand{\wasser}{\mbox{$\mathrm{H_{2}O}$}}









%% Encabezados con el paquete fancyhdr
% - -- --- ----- ------- ----- --- -- -
\RequirePackage{fancyhdr}                   % Incluye el paquete fancy headings
\pagestyle{fancy}                           % Indica que la página sera de estilo fancy
\fancyhf{}                                  % blanqueé los campos de fancyhdr
\fancyhead[OR]{\nouppercase \leftmark }
\fancyhead[EL]{\nouppercase \rightmark }
  
\fancyfoot[OC,EC]{\thepage}               % Indica que la numeración de las páginas es en el pie de página
\renewcommand{\headrulewidth}{0.01pt}     % indica el grosor de la linea de separacion de el encabezado
\renewcommand{\footrulewidth}{0.0pt}      % indica el grosor de la linea de separacion del pie de pagina

\fancypagestyle{plain}{
	\fancyhead[LE,RO]{}
	\fancyfoot[EC,OC]{\thepage}
	\renewcommand{\headrulewidth}{0.0pt}
}

%% Defiendo la presentación de la primera página de cada capítulo
%% - -- --- ----- ------- ----------- ------------ ----------- ------- ----- --- -- -
\usepackage{fncychap} % defino mi propio estilo

% Definiendo mi propio estilo de fncychap %\secdef \renewcommand
% Se requiere le paquete TikZ para el manejo de graficos y su distribución
\RequirePackage{tikz}
\usetikzlibrary{arrows,automata,backgrounds,calendar,chains,decorations,fadings,matrix,mindmap,patterns,petri,plotmarks,positioning,shadows,shapes,shapes.arrows,shapes.geometric,shapes.misc,spy,trees}

\def\hexagonsize{0.4cm}
\pgfdeclarepatternformonly
  {hexagons}% name
  {\pgfpointorigin}% lower left
  {\pgfpoint{3*\hexagonsize}{0.866025*2*\hexagonsize}}%  upper right
  {\pgfpoint{3*\hexagonsize}{0.866025*2*\hexagonsize}}%  tile size
  {% shape description
   \pgfsetlinewidth{0.4pt}
   \pgftransformshift{\pgfpoint{0mm}{0.866025*\hexagonsize}}
   \pgfpathmoveto{\pgfpoint{0mm}{0mm}}
   \pgfpathlineto{\pgfpoint{0.5*\hexagonsize}{0mm}}
   \pgfpathlineto{\pgfpoint{\hexagonsize}{-0.866025*\hexagonsize}}
   \pgfpathlineto{\pgfpoint{2*\hexagonsize}{-0.866025*\hexagonsize}}
   \pgfpathlineto{\pgfpoint{2.5*\hexagonsize}{0mm}}
   \pgfpathlineto{\pgfpoint{3*\hexagonsize+0.2mm}{0mm}}
   \pgfpathmoveto{\pgfpoint{0.5*\hexagonsize}{0mm}}
   \pgfpathlineto{\pgfpoint{\hexagonsize}{0.866025*\hexagonsize}}
   \pgfpathlineto{\pgfpoint{2*\hexagonsize}{0.866025*\hexagonsize}}
   \pgfpathlineto{\pgfpoint{2.5*\hexagonsize}{0mm}}
   \pgfusepath{stroke}
  }

\tikzfading[name=fade right, left color=transparent!40, middle color=transparent!70,  right color=transparent!100]
\tikzfading[name=fade left, left color=transparent!100, right color=transparent!0]
\tikzfading[name=fade bottom, top color=transparent!0, bottom color=transparent!100]
\tikzfading[name=fade top, top color=transparent!90, middle color=transparent!0, bottom color=transparent!85]

% \newcommand{\mycbox}[2]{\tikz{\path[draw=#1,fill=#2, rounded corners] (0,0) rectangle (0.6cm, 0.3cm);}}
\makeatletter
  \ChNameVar{\color{white}\raggedleft\Large\bfseries}
  \ChNumVar{\color{white}\raggedleft\fontsize{36}{40}\usefont{T1}{pzc}{m}{n}\selectfont}
  \ChTitleVar{\color{AzulInstitucional}\Huge\bf}
  \ChRuleWidth{1.6pt}

  % Configuración del formato de nombre y numero del \chapter
  \renewcommand{\DOCH}{
  	\vskip -2.5cm
    \hspace*{-3.5cm} 
    {
      \begin{tikzpicture}
         \node[inner xsep=0pt, text width=19.0cm, align=right, left color=AzulClaro, right color=AzulInstitucional] (title) {\color{lightgray}\CNV \FmN{\@chapapp}\space \CNoV \thechapter \hspace*{0.3cm}};
         \fill[pattern color=AzulInstitucional, pattern=hexagons, nearly transparent] (-9.8,-0.56) rectangle (6,0.56);
      \end{tikzpicture}
    }
  }
  % Configuración de la estructura de \chapter
  \renewcommand{\DOTI}[1]{
    \CTV\FmTi{#1}\par\nobreak \vskip -15\p@
    \rule{18.5cm}{\RW}\par\nobreak
     \vskip 30\p@
  }
  % Configuración de la estructura de \chapter*
  \renewcommand{\DOTIS}[1]{
   	\vskip -2.0cm \CTV\FmTi{#1}\par\nobreak \vskip -15\p@
    \rule{18.5cm}{\RW}\par\nobreak
    \vskip -10\p@
  }

\makeatother



%% Paquetes para barras de decoración incluyendo una imagen de fondo
%% - -- --- ----- ------- ----------- ------------- ----------- ------- ----- --- -- -
\AddToHook{shipout/background}{
    \put (0.7\paperwidth,-.99\paperheight){
        \ifthenelse{\value{page}>2} {
            \begin{tikzpicture}
                \node[opacity=0.2]{\includegraphics[height=3cm]{Images/ImagenesPlantilla/LogoSimboloUSA-V-G.pdf}};
            \end{tikzpicture}
            
        }{
            \relax
        }
    }
}



%% Definición de la pagina de titulo y otros eleemntos a desplegar en ella
%% - -- --- ----- ------- ----------- ------------- ----------- ------- ----- --- -- -
\makeatletter

\newcommand{\advisor}[1]{\gdef\@advisor{#1}}
\newcommand{\@advisor}{\@latex@warning@no@line{No \noexpand\advisor given}}

\newcommand{\coadvisor}[1]{\gdef\@coadvisor{#1}}
\newcommand{\@coadvisor}{\@latex@warning@no@line{No \noexpand\coadvisor given}}

\newcommand{\documenttype}[1]{\gdef\@documenttype{#1}}
\newcommand{\@documenttype}{\@latex@warning@no@line{No \noexpand\documenttype given}}

\newcommand{\researchline}[1]{\gdef\@researchline{#1}}
\newcommand{\@researchline}{\@latex@warning@no@line{No \noexpand\researchline given}}

%% . .. ... ..... ....... ........... ............. ........... ....... ..... ... .. .
\renewcommand*{\maketitle}{
    \begin{titlepage}
        % \NoBgThispage
        \centering
        % Include USA Logo
        \includegraphics[width=0.5\textwidth]{Images/ImagenesPlantilla/LogoSimboloUSA-V-C.pdf}
        \vfill
    	
        {\scshape\huge\bfseries\@title\unskip\strut\par}
        
        \vfill
        {\scshape\LARGE \@author \unskip\strut\par}
        
        
        \vfill
        
        
        {\scshape\large Universidad Sergio Arboleda \par}
        {\scshape\large Escuela de Ciencias Exactas e Ingenier\'ia \par}
        {\scshape\large Programa al cual perteneces \par}
        {\scshape\large Bogot\'a D.C. \par}
        {\scshape\large \the\year \par}
        
        %% La segunda página
        \newpage
        \pagestyle{empty}
        
        \centering
        {\scshape\huge\bfseries\@title\unskip\strut\par}
        
        \vfill
        {\scshape\LARGE \@author \unskip\strut\par}
        \vspace{2.5cm}
  		{\scshape\Large \@documenttype \unskip\strut\par}
 		\vspace{1.5cm}
 		Asesor \par
  		\@advisor \unskip\strut\par
  		
  		\if\coadvisor{}
  		    \relax
  		\else
  		    \vspace*{0.5cm}
  		    Co-asesor \par
  		    \@coadvisor \unskip\strut\par
  		\fi
 
        \vfill
        {\scshape\large Universidad Sergio Arboleda \par}
        {\scshape\large Escuela de Ciencias Exactas e Ingenier\'ia \par}
        {\scshape\large Programa al cual perteneces \par}
        {\scshape\large Bogot\'a D.C. \par}
        {\scshape\large \the\year \par}
	\end{titlepage}
%     
}
\makeatother

%%  Comandos definidos para las tablas y demás información del preámbulo
%% - -- --- ----- ------- ----------- ------------- ----------- ------- ----- --- -- -
\renewcommand*\thesection{\arabic{section}}