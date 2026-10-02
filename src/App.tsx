import React, { useState, useEffect, useRef } from 'react';
import {
  Terminal,
  Play,
  Square,
  Download,
  Trash2,
  ExternalLink,
  MessageCircle,
  Copy,
  Check,
  Search,
  Filter,
  Smartphone,
  Gauge,
  Sparkles,
  AlertTriangle,
  Globe,
  Share2,
  RefreshCw,
  Code2,
  Database,
  Building2,
  Eye,
  X,
} from 'lucide-react';
import { QualifiedLead, PipelineStats, PipelineLogMessage, LeadCategory } from './types/index.ts';

export default function App() {
  // Tabs
  const [activeTab, setActiveTab] = useState<'pipeline' | 'leads' | 'single' | 'database' | 'docs'>('pipeline');

  // Pipeline form options
  const [query, setQuery] = useState('clínicas odontológicas');
  const [location, setLocation] = useState('Rosario, Santa Fe');
  const [limit, setLimit] = useState(6);
  const [delayMs, setDelayMs] = useState(1200);
  const [useMock, setUseMock] = useState(false);

  // Pipeline execution state
  const [isRunning, setIsRunning] = useState(false);
  const [currentStage, setCurrentStage] = useState<{ stage: number; name: string } | null>(null);
  const [logs, setLogs] = useState<PipelineLogMessage[]>([]);
  const [stats, setStats] = useState<PipelineStats>({
    totalProcessed: 0,
    sinWeb: 0,
    soloRedSocial: 0,
    webCaida: 0,
    obsoletoContactar: 0,
    profesionalDescartado: 0,
    calificadosFinales: 0,
    durationSeconds: 0,
  });

  // Leads list
  const [leads, setLeads] = useState<QualifiedLead[]>([]);
  const [leadFilter, setLeadFilter] = useState<string>('ALL');
  const [searchFilter, setSearchFilter] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [previewScreenshot, setPreviewScreenshot] = useState<string | null>(null);

  // Single URL audit state
  const [singleUrl, setSingleUrl] = useState('https://prodent-rosario-vieja.net.ar');
  const [singleName, setSingleName] = useState('Clínica Dental Pellegrini');
  const [isAuditingSingle, setIsAuditingSingle] = useState(false);
  const [singleResult, setSingleResult] = useState<any | null>(null);

  const terminalEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Load existing leads from SQLite on start
  useEffect(() => {
    fetchLeads();
  }, []);

  // Auto-scroll terminal
  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const fetchLeads = async () => {
    try {
      const res = await fetch('/api/leads');
      const data = await res.json();
      if (data.ok && Array.isArray(data.leads)) {
        setLeads(data.leads);
      }
    } catch (err) {
      console.error('Error fetching leads:', err);
    }
  };

  const startPipeline = () => {
    if (isRunning) return;

    setIsRunning(true);
    setLogs([]);
    setCurrentStage({ stage: 1, name: 'Ingesta y Extracción de Comercios' });

    const params = new URLSearchParams({
      query,
      location,
      limit: String(limit),
      delayMs: String(delayMs),
      mock: String(useMock),
    });

    const es = new EventSource(`/api/pipeline/stream?${params.toString()}`);
    eventSourceRef.current = es;

    es.addEventListener('log', (event: MessageEvent) => {
      try {
        const item: PipelineLogMessage = JSON.parse(event.data);
        setLogs((prev) => [...prev, item]);
      } catch (e) {}
    });

    es.addEventListener('stage', (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        setCurrentStage({ stage: data.stage, name: data.stageName });
      } catch (e) {}
    });

    es.addEventListener('lead', (event: MessageEvent) => {
      try {
        const { lead, isDiscarded } = JSON.parse(event.data);
        if (!isDiscarded) {
          setLeads((prev) => [lead, ...prev.filter((l) => l.id !== lead.id)]);
        }
      } catch (e) {}
    });

    es.addEventListener('done', (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (data.stats) {
          setStats(data.stats);
        }
      } catch (e) {}
      es.close();
      setIsRunning(false);
      fetchLeads();
    });

    es.addEventListener('error', (event) => {
      console.error('SSE Error:', event);
      es.close();
      setIsRunning(false);
      fetchLeads();
    });
  };

  const stopPipeline = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsRunning(false);
    fetchLeads();
  };

  const handleClearDb = async () => {
    if (!confirm('¿Deseas vaciar todos los leads guardados en SQLite y el archivo CSV?')) return;
    try {
      await fetch('/api/leads/clear', { method: 'POST' });
      setLeads([]);
      setLogs([]);
      setStats({
        totalProcessed: 0,
        sinWeb: 0,
        soloRedSocial: 0,
        webCaida: 0,
        obsoletoContactar: 0,
        profesionalDescartado: 0,
        calificadosFinales: 0,
        durationSeconds: 0,
      });
    } catch (err) {
      console.error('Error al limpiar base de datos:', err);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const runSingleAudit = async () => {
    if (!singleUrl) return;
    setIsAuditingSingle(true);
    setSingleResult(null);

    try {
      const res = await fetch('/api/audit/single', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: singleUrl, businessName: singleName }),
      });
      const data = await res.json();
      setSingleResult(data);
    } catch (err: any) {
      alert(`Error en la auditoría: ${err.message}`);
    } finally {
      setIsAuditingSingle(false);
    }
  };

  // Filtered leads
  const filteredLeads = leads.filter((lead) => {
    if (leadFilter !== 'ALL' && lead.category !== leadFilter) return false;
    if (searchFilter) {
      const q = searchFilter.toLowerCase();
      return (
        lead.name.toLowerCase().includes(q) ||
        lead.address.toLowerCase().includes(q) ||
        lead.phone.toLowerCase().includes(q) ||
        (lead.website_url && lead.website_url.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const getCategoryBadge = (cat: LeadCategory) => {
    switch (cat) {
      case 'SIN_WEB':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
            <Globe className="w-3.5 h-3.5" /> Sin Web
          </span>
        );
      case 'SOLO_RED_SOCIAL':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-fuchsia-500/15 text-fuchsia-400 border border-fuchsia-500/30">
            <Share2 className="w-3.5 h-3.5" /> Solo Red Social
          </span>
        );
      case 'WEB_CAIDA':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30">
            <AlertTriangle className="w-3.5 h-3.5" /> Web Caída / SSL
          </span>
        );
      case 'OBSOLETO_CONTACTAR':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-sky-500/15 text-sky-400 border border-sky-500/30">
            <Smartphone className="w-3.5 h-3.5" /> Obsoleto Móvil
          </span>
        );
      case 'PROFESIONAL_DESCARTAR':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <Check className="w-3.5 h-3.5" /> Profesional (Descartado)
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-black">
      {/* Top Navigation Bar */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                  B2B Prospector & Auditor
                </span>
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800">
                  CLI + Multimodal
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Playwright Headless • PageSpeed Insights • Gemini Visión Multimodal
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveTab('pipeline')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition ${
                activeTab === 'pipeline'
                  ? 'bg-cyan-500 text-slate-950 shadow-md font-semibold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Play className="w-3.5 h-3.5" /> Pipeline CLI
            </button>
            <button
              onClick={() => setActiveTab('leads')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition ${
                activeTab === 'leads'
                  ? 'bg-cyan-500 text-slate-950 shadow-md font-semibold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" /> Leads Calificados
              {leads.length > 0 && (
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                    activeTab === 'leads' ? 'bg-slate-950 text-cyan-400' : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {leads.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('single')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition ${
                activeTab === 'single'
                  ? 'bg-cyan-500 text-slate-950 shadow-md font-semibold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Eye className="w-3.5 h-3.5" /> Auditor Individual
            </button>
            <button
              onClick={() => setActiveTab('database')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition ${
                activeTab === 'database'
                  ? 'bg-cyan-500 text-slate-950 shadow-md font-semibold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Database className="w-3.5 h-3.5" /> SQLite & CSV
            </button>
            <button
              onClick={() => setActiveTab('docs')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition ${
                activeTab === 'docs'
                  ? 'bg-cyan-500 text-slate-950 shadow-md font-semibold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Code2 className="w-3.5 h-3.5" /> Comandos CLI
            </button>
          </nav>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* STATS BAR */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3">
            <span className="text-xs text-slate-400 block font-mono">CALIFICADOS</span>
            <span className="text-2xl font-bold text-cyan-400">{leads.length}</span>
            <span className="text-[10px] text-slate-500 block">Listos para contacto</span>
          </div>
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3">
            <span className="text-xs text-amber-400 block font-mono">SIN SITIO WEB</span>
            <span className="text-2xl font-bold text-amber-400">
              {leads.filter((l) => l.category === 'SIN_WEB').length}
            </span>
            <span className="text-[10px] text-slate-500 block">Caso A (Heurístico)</span>
          </div>
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3">
            <span className="text-xs text-fuchsia-400 block font-mono">SOLO RED SOCIAL</span>
            <span className="text-2xl font-bold text-fuchsia-400">
              {leads.filter((l) => l.category === 'SOLO_RED_SOCIAL').length}
            </span>
            <span className="text-[10px] text-slate-500 block">Caso B (Instagram/FB)</span>
          </div>
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3">
            <span className="text-xs text-rose-400 block font-mono">WEB CAÍDA / SSL</span>
            <span className="text-2xl font-bold text-rose-400">
              {leads.filter((l) => l.category === 'WEB_CAIDA').length}
            </span>
            <span className="text-[10px] text-slate-500 block">Fallo Playwright 12s</span>
          </div>
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3">
            <span className="text-xs text-sky-400 block font-mono">OBSOLETO MÓVIL</span>
            <span className="text-2xl font-bold text-sky-400">
              {leads.filter((l) => l.category === 'OBSOLETO_CONTACTAR').length}
            </span>
            <span className="text-[10px] text-slate-500 block">Gemini Visión AI</span>
          </div>
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3">
            <span className="text-xs text-emerald-400 block font-mono">DESCARTADOS</span>
            <span className="text-2xl font-bold text-emerald-400">{stats.profesionalDescartado}</span>
            <span className="text-[10px] text-slate-500 block">Webs modernas filtradas</span>
          </div>
        </div>

        {/* TAB 1: PIPELINE CLI RUNNER */}
        {activeTab === 'pipeline' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Configuration Controls */}
            <div className="lg:col-span-4 space-y-5">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
                <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4">
                  <h2 className="text-base font-semibold text-white flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-cyan-400" />
                    Parámetros de Ejecución
                  </h2>
                  <span className="text-xs text-slate-500 font-mono">Node CLI Engine</span>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Rubro Comercial (<code className="text-cyan-400">--query</code>)
                    </label>
                    <input
                      type="text"
                      value={query}
                      disabled={isRunning}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder='ej: "clínicas odontológicas", "veterinarias"'
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500 transition"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Ubicación (<code className="text-cyan-400">--location</code>)
                    </label>
                    <input
                      type="text"
                      value={location}
                      disabled={isRunning}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder='ej: "Rosario, Santa Fe"'
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500 transition"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1.5">
                        Límite (<code className="text-cyan-400">--limit</code>)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="30"
                        value={limit}
                        disabled={isRunning}
                        onChange={(e) => setLimit(parseInt(e.target.value, 10) || 5)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500 transition"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1.5">
                        Delay (<code className="text-cyan-400">--delay</code> ms)
                      </label>
                      <input
                        type="number"
                        min="200"
                        max="5000"
                        step="100"
                        value={delayMs}
                        disabled={isRunning}
                        onChange={(e) => setDelayMs(parseInt(e.target.value, 10) || 1000)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500 transition"
                      />
                    </div>
                  </div>

                  <div className="pt-2">
                    <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300 select-none">
                      <input
                        type="checkbox"
                        checked={useMock}
                        disabled={isRunning}
                        onChange={(e) => setUseMock(e.target.checked)}
                        className="rounded border-slate-700 bg-slate-950 text-cyan-500 focus:ring-0 focus:ring-offset-0"
                      />
                      <span>Modo Sandbox / Simulado (Sin consumir cuotas de Places)</span>
                    </label>
                  </div>

                  <div className="pt-3 border-t border-slate-800/80 flex items-center gap-2">
                    {!isRunning ? (
                      <button
                        onClick={startPipeline}
                        className="flex-1 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold py-3 px-4 rounded-xl shadow-lg shadow-cyan-500/20 flex items-center justify-center gap-2 text-sm transition"
                      >
                        <Play className="w-4 h-4 fill-slate-950" />
                        Iniciar Pipeline
                      </button>
                    ) : (
                      <button
                        onClick={stopPipeline}
                        className="flex-1 bg-rose-500 hover:bg-rose-600 text-white font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 text-sm transition"
                      >
                        <Square className="w-4 h-4 fill-white" />
                        Detener Pipeline
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Pipeline Stage Indicators */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                  Etapas del Pipeline
                </span>
                <div className="space-y-2">
                  {[
                    { num: 1, title: 'Ingesta y Extracción', sub: 'Places API (New) o Sandbox' },
                    { num: 2, title: 'Filtro Heurístico', sub: 'Sin web / Solo red social' },
                    { num: 3, title: 'Auditoría Técnica & Visión', sub: 'Playwright (390x844) + Gemini' },
                    { num: 4, title: 'Copys & Persistencia', sub: 'WhatsApp pitches & SQLite / CSV' },
                  ].map((stage) => {
                    const isActive = currentStage?.stage === stage.num && isRunning;
                    const isPassed = (currentStage?.stage || 0) > stage.num || (!isRunning && logs.length > 5);

                    return (
                      <div
                        key={stage.num}
                        className={`flex items-center gap-3 p-2.5 rounded-xl border transition ${
                          isActive
                            ? 'bg-cyan-950/40 border-cyan-500/40 text-cyan-200'
                            : isPassed
                            ? 'bg-slate-950/50 border-emerald-900/30 text-emerald-300'
                            : 'bg-slate-950/20 border-slate-800/40 text-slate-500'
                        }`}
                      >
                        <div
                          className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                            isActive
                              ? 'bg-cyan-500 text-slate-950 animate-pulse'
                              : isPassed
                              ? 'bg-emerald-500 text-slate-950'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {isPassed ? '✓' : stage.num}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold truncate">{stage.title}</p>
                          <p className="text-[10px] text-slate-400 truncate">{stage.sub}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Right Column: Real-time Terminal Log Console */}
            <div className="lg:col-span-8 flex flex-col h-[580px] bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
              {/* Terminal Window Header */}
              <div className="h-10 bg-slate-900 border-b border-slate-800 px-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-rose-500/80" />
                  <div className="w-3 h-3 rounded-full bg-amber-500/80" />
                  <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
                  <span className="text-xs font-mono text-slate-400 ml-2">b2b-prospector@cli ~ pipeline-stream</span>
                </div>
                <div className="flex items-center gap-3">
                  {isRunning && (
                    <span className="flex items-center gap-1.5 text-xs text-cyan-400 font-mono">
                      <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                      PROCESANDO...
                    </span>
                  )}
                  <button
                    onClick={() => setLogs([])}
                    title="Limpiar Consola"
                    className="text-slate-400 hover:text-white transition p-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Terminal Log Output */}
              <div className="flex-1 p-4 overflow-y-auto font-mono text-xs space-y-1.5 bg-black/40">
                {logs.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-600 space-y-2">
                    <Terminal className="w-8 h-8 opacity-40" />
                    <p>Consola lista. Haz clic en "Iniciar Pipeline" para ejecutar el scraper y auditor multimodal.</p>
                    <p className="text-[11px] text-slate-500">
                      O corre desde tu terminal: <code className="text-cyan-400">npx tsx src/cli.ts --help</code>
                    </p>
                  </div>
                ) : (
                  logs.map((log) => {
                    let levelClass = 'text-slate-300';
                    let icon = 'ℹ';

                    if (log.level === 'stage') {
                      return (
                        <div
                          key={log.id}
                          className="my-2 p-2 bg-blue-950/40 border border-blue-800/60 rounded text-cyan-300 font-semibold"
                        >
                          {log.message}
                        </div>
                      );
                    }
                    if (log.level === 'success') {
                      levelClass = 'text-emerald-400';
                      icon = '✔';
                    } else if (log.level === 'warn') {
                      levelClass = 'text-amber-400';
                      icon = '⚠';
                    } else if (log.level === 'error') {
                      levelClass = 'text-rose-400';
                      icon = '✖';
                    }

                    return (
                      <div key={log.id} className="flex items-start gap-2 leading-relaxed">
                        <span className="text-slate-500 shrink-0 select-none">[{log.timestamp}]</span>
                        <span className={`shrink-0 ${levelClass}`}>{icon}</span>
                        <span className={`break-words ${levelClass}`}>{log.message}</span>
                      </div>
                    );
                  })
                )}
                <div ref={terminalEndRef} />
              </div>

              {/* Terminal Footer Bar */}
              <div className="h-8 bg-slate-900/80 border-t border-slate-800 px-4 flex items-center justify-between text-[11px] text-slate-400">
                <span>
                  Estado:{' '}
                  <strong className={isRunning ? 'text-cyan-400' : 'text-slate-300'}>
                    {isRunning ? 'Ejecutando' : 'Inactivo'}
                  </strong>
                </span>
                <span>
                  Líneas de log: <strong>{logs.length}</strong>
                </span>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: LEADS CALIFICADOS (CARDS & DETAIL VIEW) */}
        {activeTab === 'leads' && (
          <div className="space-y-6">
            {/* Filter and Search Bar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 rounded-2xl">
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  placeholder="Buscar comercio por nombre o ciudad..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
                <span className="text-xs text-slate-400 flex items-center gap-1 mr-1">
                  <Filter className="w-3.5 h-3.5" /> Filtrar:
                </span>
                {['ALL', 'SIN_WEB', 'SOLO_RED_SOCIAL', 'WEB_CAIDA', 'OBSOLETO_CONTACTAR'].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setLeadFilter(cat)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                      leadFilter === cat
                        ? 'bg-cyan-500 text-slate-950 font-bold'
                        : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                    }`}
                  >
                    {cat === 'ALL'
                      ? 'Todos'
                      : cat === 'SIN_WEB'
                      ? 'Sin Web'
                      : cat === 'SOLO_RED_SOCIAL'
                      ? 'Red Social'
                      : cat === 'WEB_CAIDA'
                      ? 'Caída'
                      : 'Obsoleto'}
                  </button>
                ))}

                <a
                  href="/api/leads/export.csv"
                  download="leads_calificados.csv"
                  className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition"
                >
                  <Download className="w-3.5 h-3.5" /> Exportar CSV
                </a>
              </div>
            </div>

            {/* Leads Grid */}
            {filteredLeads.length === 0 ? (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-400 space-y-3">
                <Building2 className="w-12 h-12 text-slate-600 mx-auto" />
                <h3 className="text-base font-semibold text-white">No se encontraron leads con los filtros actuales</h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Ejecuta el pipeline desde la pestaña "Pipeline CLI" para extraer y auditar comercios de tu zona.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {filteredLeads.map((lead) => {
                  const cleanPhone = (lead.phone || '').replace(/[^0-9]/g, '');
                  const waUrl = cleanPhone
                    ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(lead.pitch_mensaje || '')}`
                    : null;

                  return (
                    <div
                      key={lead.id}
                      className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden hover:border-slate-700 transition flex flex-col shadow-lg"
                    >
                      {/* Card Header */}
                      <div className="p-4 border-b border-slate-800/80 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h4 className="font-bold text-white text-sm truncate" title={lead.name}>
                            {lead.name}
                          </h4>
                          <p className="text-[11px] text-slate-400 truncate mt-0.5">{lead.address}</p>
                        </div>
                        {getCategoryBadge(lead.category)}
                      </div>

                      {/* Card Body */}
                      <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                        {/* Audit Details */}
                        <div className="space-y-2 text-xs">
                          {lead.website_url ? (
                            <div className="flex items-center gap-1.5 text-slate-400">
                              <Globe className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                              <a
                                href={lead.website_url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-cyan-400 hover:underline truncate"
                              >
                                {lead.website_url}
                              </a>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 text-amber-400/80">
                              <Globe className="w-3.5 h-3.5 shrink-0" />
                              <span>Sin sitio web propio registrado en Google Maps</span>
                            </div>
                          )}

                          {lead.pagespeed_score !== undefined && (
                            <div className="flex items-center gap-4 pt-1">
                              <div className="flex items-center gap-1">
                                <Gauge className="w-3.5 h-3.5 text-slate-400" />
                                <span className="text-slate-400">PageSpeed:</span>
                                <span
                                  className={`font-bold ${
                                    lead.pagespeed_score > 70
                                      ? 'text-emerald-400'
                                      : lead.pagespeed_score > 40
                                      ? 'text-amber-400'
                                      : 'text-rose-400'
                                  }`}
                                >
                                  {lead.pagespeed_score}/100
                                </span>
                              </div>
                              {lead.lcp_seconds !== undefined && (
                                <div className="text-slate-400">
                                  LCP: <strong className="text-white">{lead.lcp_seconds}s</strong>
                                </div>
                              )}
                            </div>
                          )}

                          {lead.resumen_critica && (
                            <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-800 text-[11px] text-slate-300">
                              <span className="text-cyan-400 font-semibold block mb-0.5">Diagnóstico Técnico:</span>
                              {lead.resumen_critica}
                            </div>
                          )}

                          {lead.screenshot_path && (
                            <button
                              onClick={() =>
                                setPreviewScreenshot(`/api/screenshots/${lead.screenshot_path?.split('/').pop()}`)
                              }
                              className="inline-flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 font-medium pt-1"
                            >
                              <Smartphone className="w-3.5 h-3.5" /> Ver Captura Móvil iPhone 14
                            </button>
                          )}
                        </div>

                        {/* Sales Pitch Draft Box */}
                        <div className="pt-2">
                          <div className="p-3 bg-cyan-950/20 border border-cyan-800/30 rounded-xl space-y-2">
                            <div className="flex items-center justify-between text-[11px] text-cyan-400 font-semibold">
                              <span>Pitch Sugerido (WhatsApp / Email):</span>
                              <button
                                onClick={() => copyToClipboard(lead.pitch_mensaje, lead.id)}
                                className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-white transition"
                              >
                                {copiedId === lead.id ? (
                                  <>
                                    <Check className="w-3 h-3 text-emerald-400" /> Copiado
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3 h-3" /> Copiar
                                  </>
                                )}
                              </button>
                            </div>
                            <p className="text-xs text-slate-200 italic line-clamp-3">"{lead.pitch_mensaje}"</p>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="pt-2 flex items-center gap-2">
                          {waUrl ? (
                            <a
                              href={waUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition"
                            >
                              <MessageCircle className="w-3.5 h-3.5" /> Enviar por WhatsApp
                            </a>
                          ) : (
                            <button
                              onClick={() => copyToClipboard(lead.pitch_mensaje, lead.id)}
                              className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-semibold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition"
                            >
                              <Copy className="w-3.5 h-3.5" /> Copiar Pitch
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: AUDITOR INDIVIDUAL RÁPIDO */}
        {activeTab === 'single' && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Eye className="w-5 h-5 text-cyan-400" />
                  Auditoría Rápida de Sitio Web (Playwright + Gemini Visión)
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Ingresa cualquier URL para capturar su vista móvil (iPhone 14), medir PageSpeed y auditar con visión multimodal de Gemini.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Nombre del Comercio</label>
                  <input
                    type="text"
                    value={singleName}
                    onChange={(e) => setSingleName(e.target.value)}
                    placeholder="ej: Odontología San Martín"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">URL del Sitio</label>
                  <input
                    type="url"
                    value={singleUrl}
                    onChange={(e) => setSingleUrl(e.target.value)}
                    placeholder="https://ejemplo.com"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              <button
                onClick={runSingleAudit}
                disabled={isAuditingSingle}
                className="w-full sm:w-auto bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold py-2.5 px-6 rounded-xl flex items-center justify-center gap-2 text-sm transition shadow-lg shadow-cyan-500/20 disabled:opacity-50"
              >
                {isAuditingSingle ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" /> Auditando con Chromium y Gemini...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-slate-950" /> Auditar Ahora
                  </>
                )}
              </button>
            </div>

            {/* Single Audit Results */}
            {singleResult && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
                <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                  <h4 className="text-base font-bold text-white">Resultado del Análisis Multimodal</h4>
                  {getCategoryBadge(singleResult.category)}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Left: Mobile Screenshot preview */}
                  <div className="space-y-2">
                    <span className="text-xs font-semibold text-slate-400 block">Captura Móvil (390x844):</span>
                    <div className="w-full max-w-[280px] mx-auto bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl p-1">
                      {singleResult.crawlResult?.screenshotUrl ? (
                        <img
                          src={singleResult.crawlResult.screenshotUrl}
                          alt="Mobile Viewport"
                          className="w-full h-auto rounded-xl object-cover"
                        />
                      ) : singleResult.crawlResult?.screenshotBase64 ? (
                        <img
                          src={`data:image/png;base64,${singleResult.crawlResult.screenshotBase64}`}
                          alt="Mobile Viewport"
                          className="w-full h-auto rounded-xl object-cover"
                        />
                      ) : (
                        <div className="h-64 flex items-center justify-center text-xs text-slate-500">
                          Sin captura disponible
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right: Technical metrics and pitch */}
                  <div className="space-y-4">
                    {singleResult.pagespeedResult && (
                      <div className="grid grid-cols-2 gap-3 p-3 bg-slate-950 border border-slate-800 rounded-xl">
                        <div>
                          <span className="text-[11px] text-slate-400 block">Score PageSpeed</span>
                          <span className="text-2xl font-bold text-cyan-400">
                            {singleResult.pagespeedResult.score}/100
                          </span>
                        </div>
                        <div>
                          <span className="text-[11px] text-slate-400 block">LCP (Carga Móvil)</span>
                          <span className="text-2xl font-bold text-white">
                            {singleResult.pagespeedResult.lcpSeconds}s
                          </span>
                        </div>
                      </div>
                    )}

                    {singleResult.visionAudit && (
                      <div className="space-y-2">
                        <span className="text-xs font-semibold text-slate-300 block">Dictamen de Gemini Visión:</span>
                        <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs space-y-2">
                          <p className="text-slate-300">{singleResult.visionAudit.resumen_critica}</p>
                          {singleResult.visionAudit.defectos_principales?.length > 0 && (
                            <ul className="list-disc list-inside text-rose-300 text-[11px] space-y-1">
                              {singleResult.visionAudit.defectos_principales.map((d: string, idx: number) => (
                                <li key={idx}>{d}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                    )}

                    {singleResult.pitch && (
                      <div className="space-y-2">
                        <span className="text-xs font-semibold text-slate-300 block">Borrador de Contacto Generado:</span>
                        <div className="p-3.5 bg-cyan-950/20 border border-cyan-800/40 rounded-xl space-y-2 text-xs">
                          <p className="text-slate-200 italic">"{singleResult.pitch}"</p>
                          <button
                            onClick={() => copyToClipboard(singleResult.pitch, 'single-pitch')}
                            className="inline-flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 font-semibold"
                          >
                            {copiedId === 'single-pitch' ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-emerald-400" /> Copiado al portapapeles
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" /> Copiar Pitch
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: DATABASE & CSV VIEWER */}
        {activeTab === 'database' && (
          <div className="space-y-5">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 rounded-2xl">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Database className="w-4 h-4 text-cyan-400" />
                  Persistencia Local SQLite (`prospector.sqlite`)
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Los prospectos calificados se guardan automáticamente en SQLite y en <code className="text-cyan-400">leads_calificados.csv</code>.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <a
                  href="/api/leads/export.csv"
                  download="leads_calificados.csv"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition"
                >
                  <Download className="w-3.5 h-3.5" /> Descargar CSV
                </a>
                <button
                  onClick={handleClearDb}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Vaciar DB
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 border-b border-slate-800 text-slate-400 font-mono">
                    <tr>
                      <th className="p-3.5">Nombre</th>
                      <th className="p-3.5">Categoría</th>
                      <th className="p-3.5">Teléfono</th>
                      <th className="p-3.5">Sitio Web</th>
                      <th className="p-3.5">PageSpeed</th>
                      <th className="p-3.5">Diagnóstico</th>
                      <th className="p-3.5 text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-sans">
                    {leads.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-slate-500">
                          La base de datos SQLite no contiene registros actualmente.
                        </td>
                      </tr>
                    ) : (
                      leads.map((l) => (
                        <tr key={l.id} className="hover:bg-slate-950/40 transition">
                          <td className="p-3.5 font-bold text-white max-w-[180px] truncate">{l.name}</td>
                          <td className="p-3.5">{getCategoryBadge(l.category)}</td>
                          <td className="p-3.5 font-mono text-slate-300">{l.phone || 'N/A'}</td>
                          <td className="p-3.5 max-w-[160px] truncate">
                            {l.website_url ? (
                              <a
                                href={l.website_url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-cyan-400 hover:underline"
                              >
                                {l.website_url}
                              </a>
                            ) : (
                              <span className="text-slate-500 italic">Ninguna</span>
                            )}
                          </td>
                          <td className="p-3.5">
                            {l.pagespeed_score !== undefined ? (
                              <span className="font-mono">{l.pagespeed_score}/100</span>
                            ) : (
                              <span className="text-slate-600">-</span>
                            )}
                          </td>
                          <td className="p-3.5 max-w-[240px] truncate text-slate-400">{l.resumen_critica}</td>
                          <td className="p-3.5 text-right">
                            <button
                              onClick={() => copyToClipboard(l.pitch_mensaje, l.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] transition"
                            >
                              {copiedId === l.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                              Pitch
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: CLI COMMANDS & DOCS */}
        {activeTab === 'docs' && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Code2 className="w-5 h-5 text-cyan-400" />
                Guía de Ejecución CLI por Terminal (Node.js + TypeScript)
              </h3>
              <p className="text-xs text-slate-400">
                La herramienta fue construida como un módulo CLI nativo en TypeScript que puedes correr directamente desde cualquier terminal con <code className="text-cyan-400">tsx</code>.
              </p>

              <div className="space-y-3 pt-2">
                <span className="text-xs font-semibold text-slate-300 block">Ejemplos de comandos:</span>

                <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl font-mono text-xs text-cyan-300 space-y-2">
                  <div className="text-slate-500"># 1. Prospección estándar con exportación a CSV</div>
                  <div className="text-white">
                    npx tsx src/cli.ts --query "clínicas odontológicas" --location "Rosario, Santa Fe" --limit 15
                  </div>

                  <div className="text-slate-500 pt-2"># 2. Modo Sandbox / Mock (sin consumir créditos de Places API)</div>
                  <div className="text-white">
                    npx tsx src/cli.ts -q "veterinarias" -l "Córdoba, Argentina" -n 10 --mock
                  </div>

                  <div className="text-slate-500 pt-2"># 3. Personalizar ruta de CSV y delay entre requests</div>
                  <div className="text-white">
                    npx tsx src/cli.ts -q "estudios contables" -l "Buenos Aires" -o "./prospectos.csv" --delay 2000
                  </div>

                  <div className="text-slate-500 pt-2"># 4. Ver todas las opciones y flags disponibles</div>
                  <div className="text-white">npx tsx src/cli.ts --help</div>
                </div>
              </div>

              <div className="space-y-3 pt-4 border-t border-slate-800">
                <span className="text-xs font-semibold text-slate-300 block">Estructura Modular del Código:</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
                    <strong className="text-cyan-400 block font-mono">src/services/places.ts</strong>
                    <span className="text-slate-400">Google Places API (New) y proveedor fallback modular.</span>
                  </div>
                  <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
                    <strong className="text-cyan-400 block font-mono">src/services/crawler.ts</strong>
                    <span className="text-slate-400">Playwright Chromium headless (iPhone 14, 390x844, 12s timeout).</span>
                  </div>
                  <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
                    <strong className="text-cyan-400 block font-mono">src/services/pagespeed.ts</strong>
                    <span className="text-slate-400">Google PageSpeed Insights v5 REST API (score móvil y LCP).</span>
                  </div>
                  <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
                    <strong className="text-cyan-400 block font-mono">src/services/analyzer.ts</strong>
                    <span className="text-slate-400">Visión multimodal de Gemini y generador de pitches de 60 palabras.</span>
                  </div>
                  <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
                    <strong className="text-cyan-400 block font-mono">src/services/storage.ts</strong>
                    <span className="text-slate-400">Persistencia SQLite (sql.js) y exportación a leads_calificados.csv.</span>
                  </div>
                  <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
                    <strong className="text-cyan-400 block font-mono">src/cli.ts</strong>
                    <span className="text-slate-400">CLI UX con Commander, Chalk y Ora para barras de progreso.</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Screenshot Zoom Modal */}
      {previewScreenshot && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="relative bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-4 shadow-2xl space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <Smartphone className="w-4 h-4 text-cyan-400" /> Simulación Móvil iPhone 14
              </span>
              <button
                onClick={() => setPreviewScreenshot(null)}
                className="text-slate-400 hover:text-white transition p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto rounded-xl border border-slate-800">
              <img src={previewScreenshot} alt="Viewport Preview" className="w-full h-auto" />
            </div>
            <button
              onClick={() => setPreviewScreenshot(null)}
              className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-4 text-center text-xs text-slate-500 font-mono">
        B2B Prospector CLI Engine • Node.js v22 • Playwright Chromium • Gemini 3.8 Flash Multimodal Vision
      </footer>
    </div>
  );
}
