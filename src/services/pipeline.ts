import {
  PipelineOptions,
  PipelineStats,
  PlaceBusiness,
  QualifiedLead,
  LeadCategory,
  PipelineLogMessage,
} from '../types/index.ts';
import { GooglePlacesNewService, IPlacesService } from './places.ts';
import { PlaywrightCrawler } from './crawler.ts';
import { PageSpeedService } from './pagespeed.ts';
import { GeminiAnalyzerService } from './analyzer.ts';
import { StorageService } from './storage.ts';

export interface PipelineCallbacks {
  onLog?: (log: PipelineLogMessage) => void;
  onLeadProcessed?: (lead: QualifiedLead, isDiscarded: boolean) => void;
  onStageChange?: (stage: number, stageName: string) => void;
}

export class B2BProspectorPipeline {
  private placesService: IPlacesService;
  private crawler: PlaywrightCrawler;
  private pageSpeedService: PageSpeedService;
  private analyzerService: GeminiAnalyzerService;
  private storageService: StorageService;
  private callbacks: PipelineCallbacks;

  constructor(
    callbacks: PipelineCallbacks = {},
    customStorage?: StorageService,
    customPlaces?: IPlacesService
  ) {
    this.callbacks = callbacks;
    this.placesService = customPlaces || new GooglePlacesNewService();
    this.crawler = new PlaywrightCrawler();
    this.pageSpeedService = new PageSpeedService();
    this.analyzerService = new GeminiAnalyzerService();
    this.storageService = customStorage || new StorageService();
  }

  private log(
    level: PipelineLogMessage['level'],
    message: string,
    stage?: number,
    leadId?: string
  ): void {
    const item: PipelineLogMessage = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toLocaleTimeString(),
      level,
      stage,
      message,
      leadId,
    };
    if (this.callbacks.onLog) {
      this.callbacks.onLog(item);
    }
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async run(options: PipelineOptions): Promise<{ stats: PipelineStats; leads: QualifiedLead[] }> {
    const startTime = Date.now();
    const delay = options.delayMs || parseInt(process.env.PIPELINE_REQUEST_DELAY_MS || '1500', 10);
    const qualifiedLeads: QualifiedLead[] = [];

    const stats: PipelineStats = {
      totalProcessed: 0,
      sinWeb: 0,
      soloRedSocial: 0,
      webCaida: 0,
      obsoletoContactar: 0,
      profesionalDescartado: 0,
      calificadosFinales: 0,
      durationSeconds: 0,
    };

    await this.storageService.init();

    this.log('stage', `🚀 Iniciando Pipeline de Prospección B2B: "${options.query}" en "${options.location}" (Límite: ${options.limit})`, 1);

    // ==========================================
    // ETAPA 1: Ingesta y Extracción de Comercios
    // ==========================================
    if (this.callbacks.onStageChange) this.callbacks.onStageChange(1, 'Ingesta y Extracción de Comercios (Places API)');
    this.log('info', `[Etapa 1] Consultando API de Places para "${options.query}" en "${options.location}"...`, 1);

    let businesses: PlaceBusiness[] = [];
    try {
      businesses = await this.placesService.searchBusinesses({
        query: options.query,
        location: options.location,
        limit: options.limit,
      });
      this.log('success', `[Etapa 1] Extracción completada: se obtuvieron ${businesses.length} comercios para auditar.`, 1);
    } catch (err: any) {
      this.log('error', `[Etapa 1] Error en la extracción: ${err.message}`, 1);
      return { stats, leads: [] };
    }

    // ==========================================
    // PROCESAMIENTO SECUENCIAL DE CADA COMERCIO
    // ==========================================
    for (let index = 0; index < businesses.length; index++) {
      const biz = businesses[index];
      stats.totalProcessed++;
      const prefix = `[${index + 1}/${businesses.length}] ${biz.name}:`;

      this.log('info', `Analizando prospecto: ${biz.name} (${biz.website_url || 'Sin URL'})`, 2, biz.id);

      // ==========================================
      // ETAPA 2: Filtro Heurístico Inicial
      // ==========================================
      const rawUrl = (biz.website_url || '').trim().toLowerCase();
      let category: LeadCategory | null = null;

      if (!rawUrl) {
        // CASO A: Sin Web
        category = 'SIN_WEB';
        stats.sinWeb++;
        this.log('warn', `${prefix} 🚫 CASO A: Sin sitio web registrado. Marcado como SIN_WEB.`, 2, biz.id);
      } else if (
        rawUrl.includes('instagram.com') ||
        rawUrl.includes('facebook.com') ||
        rawUrl.includes('fb.com') ||
        rawUrl.includes('linktr.ee') ||
        rawUrl.includes('tiktok.com') ||
        rawUrl.includes('wa.me') ||
        rawUrl.includes('whatsapp.com') ||
        rawUrl.includes('twitter.com') ||
        rawUrl.includes('x.com') ||
        rawUrl.includes('linkedin.com')
      ) {
        // CASO B: Solo Red Social
        category = 'SOLO_RED_SOCIAL';
        stats.soloRedSocial++;
        this.log('warn', `${prefix} 📱 CASO B: Enlace apunta a Red Social (${rawUrl}). Marcado como SOLO_RED_SOCIAL.`, 2, biz.id);
      } else {
        // CASO C: Dominio Propio ➔ Pasa a Etapa 3
        this.log('info', `${prefix} 🌐 CASO C: Dominio propio detectado (${biz.website_url}). Pasando a Etapa 3...`, 2, biz.id);
      }

      // Si fue CASO A o B, omitimos Etapa 3 y pasamos directo a Etapa 4
      let crawlResult = null;
      let pagespeedResult = null;
      let visionAudit = null;

      if (!category) {
        // ==========================================
        // ETAPA 3: Auditoría Técnica y Análisis Visual
        // ==========================================
        if (this.callbacks.onStageChange) this.callbacks.onStageChange(3, 'Auditoría Técnica y Visión Multimodal con Gemini');
        const slug = `${biz.id}_${biz.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;

        // 1. Captura Headless con Playwright móvil (390x844, 12s timeout)
        this.log('info', `${prefix} 📸 Capturando screenshot móvil (390x844) con Playwright...`, 3, biz.id);
        crawlResult = await this.crawler.captureMobileScreenshot(biz.website_url!, slug);

        if (!crawlResult.ok || crawlResult.isDown) {
          category = 'WEB_CAIDA';
          stats.webCaida++;
          this.log('error', `${prefix} ❌ Falla de navegación o SSL en ${biz.website_url}. Marcado como WEB_CAIDA.`, 3, biz.id);
        } else {
          // 2. PageSpeed Insights móvil
          this.log('info', `${prefix} ⚡ Consultando PageSpeed Insights móvil...`, 3, biz.id);
          pagespeedResult = await this.pageSpeedService.auditMobilePerformance(
            biz.website_url!,
            crawlResult.loadTimeMs
          );
          this.log(
            'info',
            `${prefix} 📊 PageSpeed: ${pagespeedResult.score}/100 | LCP: ${pagespeedResult.lcpSeconds}s`,
            3,
            biz.id
          );

          // 3. Evaluación Multimodal con Gemini (gemini-2.5-flash)
          this.log('info', `${prefix} 🤖 Evaluando captura móvil con Gemini Visión Multimodal...`, 3, biz.id);
          visionAudit = await this.analyzerService.auditScreenshot(
            crawlResult.screenshotPath || crawlResult.screenshotBase64 || '',
            biz.name
          );

          if (visionAudit.es_profesional) {
            stats.profesionalDescartado++;
            this.log(
              'info',
              `${prefix} 🎯 Sitio evaluado como PROFESIONAL y Moderno. DESCARTADO del reporte. (${visionAudit.resumen_critica})`,
              3,
              biz.id
            );
            if (this.callbacks.onLeadProcessed) {
              this.callbacks.onLeadProcessed(
                {
                  id: biz.id,
                  name: biz.name,
                  category: 'PROFESIONAL_DESCARTAR',
                  address: biz.formatted_address,
                  phone: biz.international_phone_number || '',
                  website_url: biz.website_url || '',
                  rating: biz.rating || 0,
                  user_ratings_total: biz.user_ratings_total || 0,
                  pagespeed_score: pagespeedResult.score,
                  lcp_seconds: pagespeedResult.lcpSeconds,
                  defectos_principales: visionAudit.defectos_principales,
                  resumen_critica: visionAudit.resumen_critica,
                  pitch_mensaje: 'Descartado por ser profesional.',
                  screenshot_path: crawlResult.screenshotPath,
                  created_at: new Date().toISOString(),
                  es_profesional: true,
                },
                true
              );
            }
            // Respetar delay entre solicitudes
            await this.sleep(delay);
            continue; // DESCARTAR del reporte final
          } else {
            category = 'OBSOLETO_CONTACTAR';
            stats.obsoletoContactar++;
            this.log(
              'warn',
              `${prefix} ⚠️ Sitio calificado como OBSOLETO_CONTACTAR: ${visionAudit.resumen_critica}`,
              3,
              biz.id
            );
          }
        }
      }

      // ==========================================
      // ETAPA 4: Generación de Copys de Venta y Persistencia
      // ==========================================
      if (this.callbacks.onStageChange) this.callbacks.onStageChange(4, 'Generación de Copys de Venta y Persistencia SQLite');
      this.log('info', `${prefix} ✍️ Redactando mensaje de ventas ultracorto para ${category}...`, 4, biz.id);

      const pitchMessage = await this.analyzerService.generateOutreachPitch({
        businessName: biz.name,
        category: category!,
        websiteUrl: biz.website_url,
        critica: visionAudit?.resumen_critica,
        defectos: visionAudit?.defectos_principales,
        pagespeedScore: pagespeedResult?.score,
        lcpSeconds: pagespeedResult?.lcpSeconds,
      });

      const qualifiedLead: QualifiedLead = {
        id: biz.id,
        name: biz.name,
        category: category!,
        address: biz.formatted_address,
        phone: biz.international_phone_number || '',
        website_url: biz.website_url || '',
        rating: biz.rating || 0,
        user_ratings_total: biz.user_ratings_total || 0,
        pagespeed_score: pagespeedResult?.score,
        lcp_seconds: pagespeedResult?.lcpSeconds,
        defectos_principales: visionAudit?.defectos_principales || [],
        resumen_critica: visionAudit?.resumen_critica || (category === 'SIN_WEB' ? 'Comercio sin web propia' : 'Enlace a red social'),
        pitch_mensaje: pitchMessage,
        screenshot_path: crawlResult?.screenshotPath,
        screenshot_base64: crawlResult?.screenshotBase64,
        created_at: new Date().toISOString(),
        es_profesional: false,
      };

      // Persistir en SQLite
      await this.storageService.saveLead(qualifiedLead);

      // Persistir en CSV
      await this.storageService.appendLeadToCsv(qualifiedLead, options.outputCsv);

      qualifiedLeads.push(qualifiedLead);
      stats.calificadosFinales++;

      this.log('success', `${prefix} ✅ Lead calificado persistido exitosamente en SQLite y CSV.`, 4, biz.id);

      if (this.callbacks.onLeadProcessed) {
        this.callbacks.onLeadProcessed(qualifiedLead, false);
      }

      // Respetar delay configurable (1 a 2 segundos) entre solicitudes
      if (index < businesses.length - 1) {
        await this.sleep(delay);
      }
    }

    stats.durationSeconds = Math.round((Date.now() - startTime) / 1000);
    this.log('success', `🏁 Pipeline completado en ${stats.durationSeconds}s. Leads calificados: ${stats.calificadosFinales} (Descartados: ${stats.profesionalDescartado})`);

    // Cerrar navegador Playwright para liberar recursos
    await this.crawler.close();

    return { stats, leads: qualifiedLeads };
  }
}
