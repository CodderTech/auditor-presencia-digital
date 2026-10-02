import express, { Request, Response } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { B2BProspectorPipeline } from './src/services/pipeline.ts';
import { StorageService } from './src/services/storage.ts';
import { PlaywrightCrawler } from './src/services/crawler.ts';
import { PageSpeedService } from './src/services/pagespeed.ts';
import { GeminiAnalyzerService } from './src/services/analyzer.ts';
import { PipelineLogMessage, QualifiedLead } from './src/types/index.ts';
import { GooglePlacesNewService, FallbackPlacesService } from './src/services/places.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = parseInt(process.env.PORT || '3000', 10);
const isProd = process.env.NODE_ENV === 'production';

app.use(express.json({ limit: '10mb' }));

const storageService = new StorageService();
const crawler = new PlaywrightCrawler();
const pageSpeedService = new PageSpeedService();
const analyzerService = new GeminiAnalyzerService();

// Servir screenshots
app.get('/api/screenshots/:filename', (req: Request, res: Response) => {
  const filename = path.basename(req.params.filename);
  const persistentPath = path.join(process.cwd(), 'data', 'screenshots', filename);
  const tmpPath = path.join('/tmp', 'screenshots', filename);

  if (fs.existsSync(persistentPath)) {
    return res.sendFile(persistentPath);
  } else if (fs.existsSync(tmpPath)) {
    return res.sendFile(tmpPath);
  }
  return res.status(404).send('Screenshot no encontrado');
});

// Obtener todos los leads guardados en SQLite
app.get('/api/leads', async (_req: Request, res: Response) => {
  try {
    const leads = await storageService.getAllLeads();
    res.json({ ok: true, leads });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Descargar CSV
app.get('/api/leads/export.csv', async (_req: Request, res: Response) => {
  try {
    const leads = await storageService.getAllLeads();
    const csvPath = path.resolve(process.cwd(), 'leads_calificados.csv');
    await storageService.exportToCsv(leads, csvPath);

    if (fs.existsSync(csvPath)) {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="leads_calificados.csv"');
      return res.sendFile(csvPath);
    }
    return res.status(404).send('No hay archivo CSV disponible aún');
  } catch (err: any) {
    res.status(500).send(`Error al exportar: ${err.message}`);
  }
});

// Borrar base de datos
app.post('/api/leads/clear', async (_req: Request, res: Response) => {
  try {
    await storageService.clearAll();
    res.json({ ok: true, message: 'Base de datos y CSV limpiados.' });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Auditoría individual interactiva (para probar cualquier URL al instante)
app.post('/api/audit/single', async (req: Request, res: Response) => {
  const { url, businessName } = req.body;
  if (!url) {
    return res.status(400).json({ ok: false, error: 'Se requiere URL' });
  }

  const name = businessName || 'Comercio Auditado';
  const slug = `audit_${Date.now()}`;

  try {
    const crawlResult = await crawler.captureMobileScreenshot(url, slug);
    if (!crawlResult.ok || crawlResult.isDown) {
      const pitch = await analyzerService.generateOutreachPitch({
        businessName: name,
        category: 'WEB_CAIDA',
        websiteUrl: url,
        critica: crawlResult.error || 'Sitio web caído o con error SSL',
      });
      return res.json({
        ok: true,
        category: 'WEB_CAIDA',
        crawlResult,
        pitch,
      });
    }

    const pagespeedResult = await pageSpeedService.auditMobilePerformance(
      url,
      crawlResult.loadTimeMs
    );

    const visionAudit = await analyzerService.auditScreenshot(
      crawlResult.screenshotPath || crawlResult.screenshotBase64 || '',
      name
    );

    const category = visionAudit.es_profesional ? 'PROFESIONAL_DESCARTAR' : 'OBSOLETO_CONTACTAR';

    const pitch = await analyzerService.generateOutreachPitch({
      businessName: name,
      category,
      websiteUrl: url,
      critica: visionAudit.resumen_critica,
      defectos: visionAudit.defectos_principales,
      pagespeedScore: pagespeedResult.score,
      lcpSeconds: pagespeedResult.lcpSeconds,
    });

    res.json({
      ok: true,
      category,
      crawlResult: {
        ...crawlResult,
        screenshotUrl: crawlResult.screenshotPath
          ? `/api/screenshots/${path.basename(crawlResult.screenshotPath)}`
          : undefined,
      },
      pagespeedResult,
      visionAudit,
      pitch,
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Ejecución del pipeline con Server-Sent Events (SSE) para stream en vivo a la UI
app.get('/api/pipeline/stream', async (req: Request, res: Response) => {
  const query = (req.query.query as string) || 'clínicas odontológicas';
  const location = (req.query.location as string) || 'Rosario, Santa Fe';
  const limit = parseInt((req.query.limit as string) || '6', 10);
  const delayMs = parseInt((req.query.delayMs as string) || '1200', 10);
  const useMock = req.query.mock === 'true';

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendEvent = (event: string, data: any) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  sendEvent('log', {
    id: 'start',
    timestamp: new Date().toLocaleTimeString(),
    level: 'info',
    message: `Iniciando prospección B2B: "${query}" en "${location}" (Límite: ${limit})...`,
  });

  const places = useMock ? new FallbackPlacesService() : new GooglePlacesNewService();

  const pipeline = new B2BProspectorPipeline(
    {
      onLog: (log: PipelineLogMessage) => {
        sendEvent('log', log);
      },
      onStageChange: (stage: number, stageName: string) => {
        sendEvent('stage', { stage, stageName });
      },
      onLeadProcessed: (lead: QualifiedLead, isDiscarded: boolean) => {
        sendEvent('lead', { lead, isDiscarded });
      },
    },
    storageService,
    places
  );

  try {
    const result = await pipeline.run({
      query,
      location,
      limit,
      delayMs,
    });

    sendEvent('done', result);
  } catch (err: any) {
    sendEvent('error', { message: err.message });
  } finally {
    res.end();
  }
});

async function startServer() {
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`[B2B Prospector Server] Servidor activo en http://0.0.0.0:${port}`);
  });
}

startServer();
