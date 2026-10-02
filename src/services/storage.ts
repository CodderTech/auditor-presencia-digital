import fs from 'node:fs';
import path from 'node:path';
import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import { QualifiedLead } from '../types/index.ts';

export class StorageService {
  private dbPath: string;
  private csvPath: string;
  private db: Database | null = null;
  private SQL: SqlJsStatic | null = null;

  constructor(customDbPath?: string, customCsvPath?: string) {
    const dataDir = path.resolve(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      try {
        fs.mkdirSync(dataDir, { recursive: true });
      } catch (e) {
        // Ignorar
      }
    }

    this.dbPath = customDbPath || path.join(dataDir, 'prospector.sqlite');
    this.csvPath = customCsvPath || path.resolve(process.cwd(), 'leads_calificados.csv');
  }

  async init(): Promise<void> {
    if (this.db) return;

    if (!this.SQL) {
      this.SQL = await initSqlJs();
    }

    if (fs.existsSync(this.dbPath)) {
      const fileBuffer = fs.readFileSync(this.dbPath);
      this.db = new this.SQL.Database(fileBuffer);
    } else {
      this.db = new this.SQL.Database();
    }

    // Crear tabla si no existe
    this.db.run(`
      CREATE TABLE IF NOT EXISTS qualified_leads (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        address TEXT,
        phone TEXT,
        website_url TEXT,
        rating REAL,
        user_ratings_total INTEGER,
        pagespeed_score INTEGER,
        lcp_seconds REAL,
        defectos_principales TEXT,
        resumen_critica TEXT,
        pitch_mensaje TEXT,
        screenshot_path TEXT,
        created_at TEXT
      );
    `);

    this.persistToDisk();
  }

  private persistToDisk(): void {
    if (!this.db) return;
    try {
      const data = this.db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(this.dbPath, buffer);
    } catch (err: any) {
      console.warn(`[Storage] Advertencia al sincronizar SQLite a disco: ${err.message}`);
    }
  }

  async saveLead(lead: QualifiedLead): Promise<void> {
    await this.init();
    if (!this.db) return;

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO qualified_leads (
        id, name, category, address, phone, website_url,
        rating, user_ratings_total, pagespeed_score, lcp_seconds,
        defectos_principales, resumen_critica, pitch_mensaje,
        screenshot_path, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run([
      lead.id,
      lead.name,
      lead.category,
      lead.address || '',
      lead.phone || '',
      lead.website_url || '',
      lead.rating || 0,
      lead.user_ratings_total || 0,
      lead.pagespeed_score ?? null,
      lead.lcp_seconds ?? null,
      JSON.stringify(lead.defectos_principales || []),
      lead.resumen_critica || '',
      lead.pitch_mensaje || '',
      lead.screenshot_path || '',
      lead.created_at || new Date().toISOString(),
    ]);
    stmt.free();

    this.persistToDisk();
  }

  async getAllLeads(): Promise<QualifiedLead[]> {
    await this.init();
    if (!this.db) return [];

    const stmt = this.db.prepare('SELECT * FROM qualified_leads ORDER BY created_at DESC');
    const leads: QualifiedLead[] = [];

    while (stmt.step()) {
      const row = stmt.getAsObject();
      let defectos: string[] = [];
      try {
        if (row.defectos_principales) {
          defectos = JSON.parse(row.defectos_principales as string);
        }
      } catch (e) {
        defectos = [];
      }

      leads.push({
        id: String(row.id),
        name: String(row.name),
        category: row.category as any,
        address: String(row.address),
        phone: String(row.phone),
        website_url: String(row.website_url),
        rating: Number(row.rating),
        user_ratings_total: Number(row.user_ratings_total),
        pagespeed_score: row.pagespeed_score !== null ? Number(row.pagespeed_score) : undefined,
        lcp_seconds: row.lcp_seconds !== null ? Number(row.lcp_seconds) : undefined,
        defectos_principales: defectos,
        resumen_critica: String(row.resumen_critica),
        pitch_mensaje: String(row.pitch_mensaje),
        screenshot_path: String(row.screenshot_path),
        created_at: String(row.created_at),
      });
    }

    stmt.free();
    return leads;
  }

  async appendLeadToCsv(lead: QualifiedLead, targetCsvPath?: string): Promise<void> {
    const csvFile = targetCsvPath || this.csvPath;
    const exists = fs.existsSync(csvFile);

    const headers = [
      'ID',
      'Nombre',
      'Categoria',
      'Telefono',
      'Direccion',
      'SitioWeb',
      'Rating',
      'TotalReseñas',
      'PageSpeedScore',
      'LCP_Segundos',
      'Defectos',
      'Critica',
      'MensajePitch',
      'Fecha',
    ];

    const row = [
      lead.id,
      lead.name,
      lead.category,
      lead.phone || '',
      lead.address || '',
      lead.website_url || '',
      String(lead.rating || 0),
      String(lead.user_ratings_total || 0),
      lead.pagespeed_score !== undefined ? String(lead.pagespeed_score) : 'N/A',
      lead.lcp_seconds !== undefined ? String(lead.lcp_seconds) : 'N/A',
      (lead.defectos_principales || []).join('; '),
      lead.resumen_critica || '',
      lead.pitch_mensaje || '',
      lead.created_at || new Date().toISOString(),
    ];

    const escapeCsvField = (val: string) => {
      if (val.includes(',') || val.includes('"') || val.includes('\n') || val.includes('\r')) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    };

    const csvRow = row.map(escapeCsvField).join(',') + '\n';

    if (!exists) {
      fs.writeFileSync(csvFile, headers.join(',') + '\n' + csvRow, 'utf8');
    } else {
      fs.appendFileSync(csvFile, csvRow, 'utf8');
    }
  }

  async exportToCsv(leads: QualifiedLead[], outputPath?: string): Promise<string> {
    const targetFile = outputPath || this.csvPath;
    const headers = [
      'ID',
      'Nombre',
      'Categoria',
      'Telefono',
      'Direccion',
      'SitioWeb',
      'Rating',
      'TotalReseñas',
      'PageSpeedScore',
      'LCP_Segundos',
      'Defectos',
      'Critica',
      'MensajePitch',
      'Fecha',
    ];

    const escapeCsvField = (val: string) => {
      if (val.includes(',') || val.includes('"') || val.includes('\n') || val.includes('\r')) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    };

    const rows = leads.map((lead) => {
      return [
        lead.id,
        lead.name,
        lead.category,
        lead.phone || '',
        lead.address || '',
        lead.website_url || '',
        String(lead.rating || 0),
        String(lead.user_ratings_total || 0),
        lead.pagespeed_score !== undefined ? String(lead.pagespeed_score) : 'N/A',
        lead.lcp_seconds !== undefined ? String(lead.lcp_seconds) : 'N/A',
        (lead.defectos_principales || []).join('; '),
        lead.resumen_critica || '',
        lead.pitch_mensaje || '',
        lead.created_at || new Date().toISOString(),
      ]
        .map(escapeCsvField)
        .join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    fs.writeFileSync(targetFile, csvContent, 'utf8');
    return targetFile;
  }

  async clearAll(): Promise<void> {
    await this.init();
    if (!this.db) return;
    this.db.run('DELETE FROM qualified_leads');
    this.persistToDisk();
    if (fs.existsSync(this.csvPath)) {
      try {
        fs.unlinkSync(this.csvPath);
      } catch (e) {
        // Ignorar
      }
    }
  }
}
