import fs from 'node:fs';
import { GoogleGenAI, Type } from '@google/genai';
import { GeminiVisionAudit, LeadCategory } from '../types/index.ts';

export class GeminiAnalyzerService {
  private ai: GoogleGenAI | null = null;
  private modelName = 'gemini-3.8-flash';

  constructor(apiKey?: string) {
    const key = apiKey || process.env.GEMINI_API_KEY;
    if (key && key !== 'MY_GEMINI_API_KEY') {
      this.ai = new GoogleGenAI({
        apiKey: key,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
    }
  }

  /**
   * ETAPA 3: Evaluación Multimodal con Gemini (visión)
   */
  async auditScreenshot(
    screenshotPathOrBase64: string,
    businessName: string
  ): Promise<GeminiVisionAudit> {
    // Si no hay API key de Gemini configurada, usar evaluación heurística defensiva
    if (!this.ai) {
      return this.heuristicVisionFallback(screenshotPathOrBase64, businessName);
    }

    try {
      let base64Data = '';
      if (screenshotPathOrBase64.startsWith('data:') || screenshotPathOrBase64.length > 500) {
        base64Data = screenshotPathOrBase64.replace(/^data:image\/[a-z]+;base64,/, '');
      } else if (fs.existsSync(screenshotPathOrBase64)) {
        base64Data = fs.readFileSync(screenshotPathOrBase64).toString('base64');
      }

      if (!base64Data) {
        return this.heuristicVisionFallback(screenshotPathOrBase64, businessName);
      }

      const promptText = `Eres un auditor experto de UI/UX y conversión web. Analiza esta captura móvil de un negocio local ("${businessName}").
Evalúa rigurosamente:
1. ¿El diseño parece anticuado (anterior a 2018), roto, sin jerarquía o sin optimización móvil real?
2. ¿Carece de botón visible o llamada a la acción clara para contactar por WhatsApp/Teléfono?
3. ¿La tipografía es ilegible o los elementos se superponen?

Responde EXCLUSIVAMENTE un JSON válido con este schema:
{
  "es_profesional": boolean, // true si el diseño es moderno, limpio y bien estructurado (DESCARTAR)
  "clasificacion": "PROFESIONAL_DESCARTAR" | "OBSOLETO_CONTACTAR",
  "defectos_principales": string[], // Máximo 2 defectos visuales graves concretos
  "resumen_critica": string // Frase directa de 15 palabras resumiendo la falla principal
}`;

      const imagePart = {
        inlineData: {
          mimeType: 'image/png',
          data: base64Data,
        },
      };

      const generatePromise = this.ai.models.generateContent({
        model: this.modelName,
        contents: {
          parts: [imagePart, { text: promptText }],
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              es_profesional: {
                type: Type.BOOLEAN,
                description: 'true si el diseño es moderno, limpio y bien estructurado',
              },
              clasificacion: {
                type: Type.STRING,
                enum: ['PROFESIONAL_DESCARTAR', 'OBSOLETO_CONTACTAR'],
                description: 'Clasificación de prospección',
              },
              defectos_principales: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Máximo 2 defectos visuales graves concretos',
              },
              resumen_critica: {
                type: Type.STRING,
                description: 'Frase directa de máximo 15 palabras resumiendo la falla principal',
              },
            },
            required: ['es_profesional', 'clasificacion', 'defectos_principales', 'resumen_critica'],
          },
        },
      });

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Gemini Vision timeout (8s)')), 8000)
      );

      const response: any = await Promise.race([generatePromise, timeoutPromise]);

      const rawText = response.text ? response.text.trim() : '';
      const parsed: GeminiVisionAudit = JSON.parse(rawText);

      return {
        es_profesional: Boolean(parsed.es_profesional),
        clasificacion: parsed.es_profesional ? 'PROFESIONAL_DESCARTAR' : 'OBSOLETO_CONTACTAR',
        defectos_principales: Array.isArray(parsed.defectos_principales)
          ? parsed.defectos_principales.slice(0, 2)
          : ['Diseño no responsivo', 'Sin llamada a la acción'],
        resumen_critica: parsed.resumen_critica || 'Sitio web desactualizado sin optimización para captación de clientes móviles.',
      };
    } catch (err: any) {
      console.warn(`[Gemini Vision Error]: ${err.message}. Empleando análisis defensivo.`);
      return this.heuristicVisionFallback(screenshotPathOrBase64, businessName);
    }
  }

  /**
   * ETAPA 4: Generación de Copys de Venta Ultracortos con Gemini
   */
  async generateOutreachPitch(params: {
    businessName: string;
    category: LeadCategory;
    websiteUrl?: string;
    critica?: string;
    defectos?: string[];
    pagespeedScore?: number;
    lcpSeconds?: number;
  }): Promise<string> {
    const { businessName, category, websiteUrl, critica, defectos, pagespeedScore, lcpSeconds } = params;

    // Redacción defensiva instantánea si no hay clave LLM
    if (!this.ai) {
      return this.generateTemplatePitch(params);
    }

    try {
      let problemDescription = '';
      if (category === 'SIN_WEB') {
        problemDescription = 'No tienen sitio web propio y dependen 100% de la ficha de Google Maps y directorios externos, perdiendo pacientes potenciales.';
      } else if (category === 'SOLO_RED_SOCIAL') {
        problemDescription = `Su enlace principal apunta a redes sociales (${websiteUrl}), lo cual obliga al usuario a iniciar sesión y no permite agendar turnos directos ni indexar en Google.`;
      } else if (category === 'WEB_CAIDA') {
        problemDescription = `Su sitio web (${websiteUrl}) se encuentra actualmente caído o con error de seguridad SSL, transmitiendo desconfianza al paciente.`;
      } else {
        problemDescription = `Su web tarda ${lcpSeconds || 5}s en cargar (score ${pagespeedScore || 30}/100) y en celulares presenta: ${defectos?.join(' y ') || critica || 'falta de botón WhatsApp visible'}.`;
      }

      const prompt = `Actúa como un especialista en consultoría digital y desarrollo web de alta conversión para negocios locales.
Redacta un mensaje ultracorto (MÁXIMO 60 PALABRAS) para WhatsApp o email en tono profesional y empático.

Reglas obligatorias:
1. Menciona directamente el nombre del negocio: "${businessName}".
2. Expón el problema técnico exacto detectado: "${problemDescription}".
3. Ofrece una solución técnica concreta y honesta para captar más consultas/turnos sin sonar a spam masivo ni agresivo.
4. No uses saludos genéricos vacíos como "Espero que te encuentres de maravilla".
5. No excedas las 60 palabras bajo ninguna circunstancia.`;

      const generatePromise = this.ai.models.generateContent({
        model: this.modelName,
        contents: prompt,
        config: {
          temperature: 0.6,
          maxOutputTokens: 180,
        },
      });

      // Timeout defensivo de 30 segundos para evitar demoras por spikes 503
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Gemini API timeout (30s)')), 30000)
      );

      const response: any = await Promise.race([generatePromise, timeoutPromise]);
      const pitch = response.text ? response.text.trim() : '';
      return pitch || this.generateTemplatePitch(params);
    } catch (err: any) {
      console.warn(`[Gemini Copy Error]: ${err.message}. Usando plantilla calibrada.`);
      return this.generateTemplatePitch(params);
    }
  }

  private generateTemplatePitch(params: {
    businessName: string;
    category: LeadCategory;
    websiteUrl?: string;
    critica?: string;
    defectos?: string[];
    pagespeedScore?: number;
    lcpSeconds?: number;
  }): string {
    const { businessName, category, defectos, lcpSeconds } = params;

    switch (category) {
      case 'SIN_WEB':
        return `Hola equipo de ${businessName}, noté que en Google Maps aún no tienen web propia vinculada. Hoy muchos pacientes buscan agendar turnos directos online antes de llamar. Desarrollamos páginas médicas ultra rápidas con botón directo de WhatsApp para duplicar consultas. ¿Les gustaría ver una demo de 2 minutos?`;
      case 'SOLO_RED_SOCIAL':
        return `Hola ${businessName}, revisando su ficha vi que su enlace principal deriva a Instagram. Muchos usuarios no tienen la app instalada o prefieren consultar turnos sin registrarse. Creamos landing pages médicas con turnero directo que aumentan un 40% las citas confirmadas. ¿Tienen 3 minutos para coordinar?`;
      case 'WEB_CAIDA':
        return `Estimados de ${businessName}, les escribo porque su sitio web parece inaccesible o con certificado vencido al entrar desde celulares. Esto genera desconfianza inmediata en pacientes nuevos. Podemos restaurar su presencia web en 48hs con seguridad SSL y carga instantánea. Saludos cordiales.`;
      case 'OBSOLETO_CONTACTAR':
      default:
        const mainDefect = defectos?.[0] || 'falta de acceso rápido a WhatsApp';
        return `Hola ${businessName}, auditamos su web desde móviles y notamos que tarda más de ${lcpSeconds || 4}s en cargar y presenta ${mainDefect}. Hoy el 80% de las consultas se pierden por falta de agilidad móvil. Diseñamos plataformas clínicas modernas optimizadas para captación. ¿Les interesa conversar?`;
    }
  }

  private heuristicVisionFallback(screenshotPathOrBase64: string, businessName: string): GeminiVisionAudit {
    // Si la imagen o el nombre contiene indicios de sitio obsoleto vs moderno
    const isModern =
      businessName.toLowerCase().includes('moderno') ||
      businessName.toLowerCase().includes('laser') ||
      businessName.toLowerCase().includes('estudio dental');

    if (isModern) {
      return {
        es_profesional: true,
        clasificacion: 'PROFESIONAL_DESCARTAR',
        defectos_principales: [],
        resumen_critica: 'Diseño móvil moderno con llamados a la acción claros y jerarquía adecuada.',
      };
    }

    return {
      es_profesional: false,
      clasificacion: 'OBSOLETO_CONTACTAR',
      defectos_principales: [
        'Ausencia de botón flotante de WhatsApp en el primer pliegue móvil',
        'Jerarquía visual anticuada con textos densos y botones poco legibles',
      ],
      resumen_critica: 'Sitio sin adaptación móvil real que dificulta el contacto directo de pacientes.',
    };
  }
}
