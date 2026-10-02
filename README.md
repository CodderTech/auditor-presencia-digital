# 🚀 B2B Digital Presence Auditor & Prospector CLI

Herramienta CLI modular y pipeline de automatización en Node.js (TypeScript) para prospección B2B masiva de comercios locales según ubicación geográfica y rubro comercial, evaluando su madurez digital y descartando sitios profesionales mediante visión multimodal con **Gemini Flash**.

---

## 🎯 Arquitectura del Pipeline (4 Etapas Secuenciales)

```
[ ETAPA 1: Ingesta & Extracción ]
       │ Google Places API (New) o Sandbox Provider
       ▼
[ ETAPA 2: Filtro Heurístico (Sin costo LLM) ]
       ├─ Caso A: Sin Web ──────────────────────────┐ (Omitir Etapa 3)
       ├─ Caso B: Solo Red Social (Instagram/FB) ────┤
       └─ Caso C: Dominio Propio ───────────────────┐
                                                    ▼
                             [ ETAPA 3: Auditoría Técnica & Visión ]
                                    ├─ Playwright Headless (iPhone 14 / 390x844 / 12s timeout)
                                    │   └─ Si falla SSL/timeout ➔ WEB_CAIDA
                                    ├─ Google PageSpeed Insights v5 (Móvil & LCP)
                                    └─ Gemini Visión Multimodal (`gemini-3.8-flash`)
                                        └─ Si `es_profesional === true` ➔ DESCARTAR
                                                    │
                                                    ▼
                             [ ETAPA 4: Copys de Venta & Persistencia ]
                                    ├─ Gemini Flash: Mensaje ultracorto (máx 60 palabras) para WhatsApp
                                    ├─ Persistencia en SQLite (`data/prospector.sqlite`)
                                    └─ Exportación a `leads_calificados.csv`
```

---

## 🛠️ Stack Tecnológico

1. **Runtime:** Node.js v20+ con TypeScript (`tsx` para ejecución directa sin transpilación previa).
2. **Extracción:** Google Places API (New) con FieldMask optimizado y adaptador de fallback modular.
3. **Automatización de Navegador:** Playwright (Chromium headless móvil: iPhone 14 simulación 390x844 px).
4. **Auditoría de Velocidad:** Google PageSpeed Insights API (v5 REST) para métricas de performance móvil y LCP (Largest Contentful Paint).
5. **Visión Multimodal & Copys:** SDK oficial `@google/genai` con modelo `gemini-3.8-flash` / `gemini-2.5-flash`.
6. **Persistencia de Datos:** SQLite local embebido (`sql.js`) sincronizado a disco y exportación estándar a `leads_calificados.csv`.
7. **CLI UX:** `commander` para flags, `ora` para spinners animados y `chalk` para logs coloridos y badges de estado.
8. **Dashboard Web:** Interfaz React con Tailwind CSS y servidor Express para ejecución interactiva y streaming SSE en vivo.

---

## 📦 Instalación y Configuración

### 1. Clonar e Instalar Dependencias
```bash
npm install
```

### 2. Instalar Navegador Chromium para Playwright
```bash
npx playwright install chromium
```

### 3. Variables de Entorno
Copia `.env.example` a `.env` y configura tus credenciales:
```bash
cp .env.example .env
```

Contenido de `.env`:
```env
# Gemini API Key (Inyectada automáticamente en AI Studio o desde Google AI Studio)
GEMINI_API_KEY="AIzaSy..."

# Google Places API (New) Key (Opcional: si no se provee, activa automáticamente el modo sandbox)
GOOGLE_PLACES_API_KEY="AIzaSy..."

# Google PageSpeed Insights API Key (Opcional)
PAGESPEED_API_KEY="AIzaSy..."

# Delay entre peticiones en milisegundos para respetar rate limits (Default: 1500)
PIPELINE_REQUEST_DELAY_MS=1500
```

---

## 💻 Uso por Línea de Comandos (CLI)

Ejecuta el script directamente con `npm run cli` o con `npx tsx`:

### Prospección Estándar
```bash
npx tsx src/cli.ts --query "clínicas odontológicas" --location "Rosario, Santa Fe" --limit 15
```

### Modo Simulado / Sandbox (Sin gastar créditos de Places API)
```bash
npx tsx src/cli.ts -q "veterinarias" -l "Córdoba, Argentina" -n 10 --mock
```

### Personalizar Archivo CSV y Tasa de Retardo
```bash
npx tsx src/cli.ts -q "estudios contables" -l "Buenos Aires" -o "./prospectos_calificados.csv" --delay 2000
```

### Opciones Disponibles
```text
Usage: b2b-prospector [options]

Opciones:
  -V, --version              Muestra la versión
  -q, --query <query>        Rubro comercial a buscar (ej: "clínicas odontológicas") [Requerido]
  -l, --location <location>  Ubicación geográfica (ej: "Rosario, Santa Fe") [Requerido]
  -n, --limit <number>       Cantidad máxima de comercios a auditar (default: 10)
  -o, --out <path>           Ruta del archivo CSV de salida (default: "leads_calificados.csv")
  --delay <ms>               Delay entre solicitudes en milisegundos para rate limit (default: 1500)
  --mock                     Forzar proveedor simulado sin consumir cuota de Places
  -h, --help                 Muestra la ayuda
```

---

## 🖥️ Interfaz Web / Dashboard en Tiempo Real

Para correr el servidor interactivo con streaming de logs por SSE, galería de capturas móviles y visor de base de datos SQLite:

```bash
npm run dev
```

Abre en tu navegador: `http://localhost:3000`

### Características de la UI:
- **Terminal en Vivo:** Visualización de spinners, logs con colores idénticos a la terminal y avance en tiempo real por cada comercio.
- **Galería de Leads:** Tarjetas interactivas con captura de pantalla móvil iPhone 14, score PageSpeed, diagnóstico de Gemini y botón directo para abrir chat de WhatsApp con el mensaje pre-cargado.
- **Auditor Individual:** Permite pegar cualquier URL para auditarla en 5 segundos sin ejecutar una búsqueda completa.
- **Visor SQLite & Exportador:** Tabla interactiva de leads almacenados con descarga instantánea del CSV.

---

## 📂 Estructura del Proyecto

```
.
├── .env.example             # Plantilla de variables de entorno
├── leads_calificados.csv    # Salida principal en CSV
├── data/
│   ├── prospector.sqlite    # Base de datos SQLite
│   └── screenshots/         # Capturas móviles (390x844) capturadas por Playwright
├── src/
│   ├── types/
│   │   └── index.ts         # Tipado estricto TypeScript
│   ├── services/
│   │   ├── places.ts        # Google Places API (New) & Adaptador Sandbox
│   │   ├── crawler.ts       # Crawler móvil Playwright (Chromium headless)
│   │   ├── pagespeed.ts     # Google PageSpeed Insights v5 REST API
│   │   ├── analyzer.ts      # Gemini 3.8/2.5 Flash (Visión & Copywriting)
│   │   ├── storage.ts       # Motor SQLite y exportador CSV
│   │   └── pipeline.ts      # Orquestador del pipeline en 4 etapas
│   ├── cli.ts               # Punto de entrada CLI con Commander, Chalk y Ora
│   ├── App.tsx              # Dashboard React
│   └── main.tsx             # Entrypoint frontend
├── server.ts                # Servidor Express Full-Stack con SSE
└── package.json
```

---

## 🛡️ Robustez y Manejo Defensivo de Errores

- **Bloqueos & Timeouts:** Los sitios web con SSL caducado, timeouts superiores a 12s o bloqueos de Cloudflare no interrumpen el pipeline; se clasifican defensivamente como `WEB_CAIDA` y avanzan a la redacción del pitch.
- **Rate Limiting:** Implementa un delay configurable (1 a 2 segundos) entre solicitudes para proteger las cuotas de red y las llamadas a la API de Gemini.
- **Parsing de JSON:** Validación estricta con schema en la llamada de Gemini para garantizar estructuras JSON parseables sin excepciones no controladas.
