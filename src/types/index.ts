export type LeadCategory = 
  | 'SIN_WEB' 
  | 'SOLO_RED_SOCIAL' 
  | 'DOMINIO_PROPIO' 
  | 'WEB_CAIDA' 
  | 'OBSOLETO_CONTACTAR' 
  | 'PROFESIONAL_DESCARTAR';

export interface PlaceBusiness {
  id: string;
  name: string;
  formatted_address: string;
  international_phone_number?: string;
  website_url?: string;
  rating?: number;
  user_ratings_total?: number;
  types?: string[];
}

export interface GeminiVisionAudit {
  es_profesional: boolean;
  clasificacion: 'PROFESIONAL_DESCARTAR' | 'OBSOLETO_CONTACTAR';
  defectos_principales: string[];
  resumen_critica: string;
}

export interface CrawlResult {
  ok: boolean;
  isDown: boolean;
  error?: string;
  statusCode?: number;
  screenshotPath?: string;
  screenshotBase64?: string;
  loadTimeMs?: number;
}

export interface PageSpeedResult {
  score: number; // 0 - 100
  lcpSeconds: number; // Largest Contentful Paint in seconds
  isFallback?: boolean;
}

export interface QualifiedLead {
  id: string;
  name: string;
  category: LeadCategory;
  address: string;
  phone: string;
  website_url: string;
  rating: number;
  user_ratings_total: number;
  pagespeed_score?: number;
  lcp_seconds?: number;
  defectos_principales?: string[];
  resumen_critica?: string;
  pitch_mensaje: string;
  screenshot_path?: string;
  screenshot_base64?: string;
  created_at: string;
  es_profesional?: boolean;
}

export interface PipelineOptions {
  query: string;
  location: string;
  limit: number;
  delayMs?: number;
  outputCsv?: string;
  useMockFallbackIfNoKey?: boolean;
}

export interface PipelineStats {
  totalProcessed: number;
  sinWeb: number;
  soloRedSocial: number;
  webCaida: number;
  obsoletoContactar: number;
  profesionalDescartado: number;
  calificadosFinales: number;
  durationSeconds: number;
}

export type LogLevel = 'info' | 'warn' | 'error' | 'success' | 'stage';

export interface PipelineLogMessage {
  id: string;
  timestamp: string;
  level: LogLevel;
  stage?: number;
  message: string;
  leadId?: string;
}
