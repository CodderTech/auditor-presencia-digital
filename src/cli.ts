#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import path from 'node:path';
import dotenv from 'dotenv';
import { B2BProspectorPipeline } from './services/pipeline.ts';
import { StorageService } from './services/storage.ts';
import { FallbackPlacesService, GooglePlacesNewService } from './services/places.ts';
import { PipelineLogMessage, QualifiedLead } from './types/index.ts';

// Cargar variables de entorno
dotenv.config();

const program = new Command();

program
  .name('b2b-prospector')
  .description('Herramienta CLI modular para prospección B2B y auditoría visual multimodal con Gemini 2.5 Flash')
  .version('1.0.0')
  .requiredOption('-q, --query <query>', 'Rubro comercial a buscar (ej: "clínicas odontológicas")')
  .requiredOption('-l, --location <location>', 'Ubicación geográfica (ej: "Rosario, Santa Fe")')
  .option('-n, --limit <number>', 'Cantidad máxima de prospectos a auditar', '10')
  .option('-o, --out <path>', 'Ruta del archivo CSV de salida', 'leads_calificados.csv')
  .option('--delay <ms>', 'Delay entre solicitudes en milisegundos para rate limit', '1500')
  .option('--mock', 'Forzar proveedor simulado (sin consumir créditos de Places API)', false);

program.parse(process.argv);

const options = program.opts();

async function main() {
  console.log('\n' + chalk.bold.cyan('╔══════════════════════════════════════════════════════════════════╗'));
  console.log(chalk.bold.cyan('║') + chalk.bold.white('   B2B PROSPECTOR CLI & AUDITOR MULTIMODAL GEMINI 2.5 FLASH      ') + chalk.bold.cyan('║'));
  console.log(chalk.bold.cyan('╚══════════════════════════════════════════════════════════════════╝\n'));

  const query = options.query;
  const location = options.location;
  const limit = parseInt(options.limit, 10) || 10;
  const outputCsv = path.resolve(process.cwd(), options.out);
  const delayMs = parseInt(options.delay, 10) || 1500;
  const useMock = Boolean(options.mock);

  console.log(chalk.gray('  • Rubro/Búsqueda : ') + chalk.bold.yellow(query));
  console.log(chalk.gray('  • Ubicación      : ') + chalk.bold.yellow(location));
  console.log(chalk.gray('  • Límite         : ') + chalk.white(limit.toString()));
  console.log(chalk.gray('  • Archivo CSV    : ') + chalk.cyan(outputCsv));
  console.log(chalk.gray('  • Delay          : ') + chalk.white(`${delayMs}ms`));
  console.log(chalk.gray('  • Proveedor      : ') + (useMock ? chalk.magenta('Simulado / Mock') : chalk.green('Google Places API (New)')));
  console.log(chalk.gray('  • Modelo Visión  : ') + chalk.bold.green('gemini-2.5-flash\n'));

  const spinner = ora({
    text: chalk.blue('Iniciando pipeline de prospección...'),
    color: 'cyan',
  }).start();

  const storageService = new StorageService(undefined, outputCsv);
  const placesService = useMock ? new FallbackPlacesService() : new GooglePlacesNewService();

  const pipeline = new B2BProspectorPipeline(
    {
      onLog: (log: PipelineLogMessage) => {
        spinner.stop();
        const time = chalk.dim(`[${log.timestamp}]`);
        let badge = '';

        switch (log.level) {
          case 'stage':
            console.log('\n' + chalk.bgBlue.bold.white(` ${log.message} `));
            break;
          case 'success':
            badge = chalk.green('✔');
            console.log(`${time} ${badge} ${chalk.green(log.message)}`);
            break;
          case 'warn':
            badge = chalk.yellow('⚠');
            console.log(`${time} ${badge} ${chalk.yellow(log.message)}`);
            break;
          case 'error':
            badge = chalk.red('✖');
            console.log(`${time} ${badge} ${chalk.red(log.message)}`);
            break;
          case 'info':
          default:
            badge = chalk.blue('ℹ');
            console.log(`${time} ${badge} ${chalk.white(log.message)}`);
            break;
        }

        spinner.start(chalk.dim('Procesando etapa...'));
      },
      onStageChange: (stage: number, stageName: string) => {
        spinner.text = chalk.cyan(`Etapa ${stage}: ${stageName}`);
      },
    },
    storageService,
    placesService
  );

  try {
    const { stats, leads } = await pipeline.run({
      query,
      location,
      limit,
      delayMs,
      outputCsv,
    });

    spinner.succeed(chalk.bold.green('Pipeline finalizado exitosamente.'));

    // Resumen final impreso en consola
    console.log('\n' + chalk.bold.white('════════════════════════ RESUMEN DE RESULTADOS ════════════════════════'));
    console.log(`  ${chalk.gray('Total Comercios Procesados :')} ${chalk.bold.white(stats.totalProcessed.toString())}`);
    console.log(`  ${chalk.gray('Sin Sitio Web (Caso A)     :')} ${chalk.yellow(stats.sinWeb.toString())}`);
    console.log(`  ${chalk.gray('Solo Red Social (Caso B)   :')} ${chalk.magenta(stats.soloRedSocial.toString())}`);
    console.log(`  ${chalk.gray('Sitios Caídos / SSL Roto   :')} ${chalk.red(stats.webCaida.toString())}`);
    console.log(`  ${chalk.gray('Sitios Obsoletos Calificados:')} ${chalk.cyan(stats.obsoletoContactar.toString())}`);
    console.log(`  ${chalk.gray('Profesionales Descartados  :')} ${chalk.dim(stats.profesionalDescartado.toString())}`);
    console.log(`  ${chalk.gray('LEADS CALIFICADOS TOTALES  :')} ${chalk.bold.green(stats.calificadosFinales.toString())}`);
    console.log(`  ${chalk.gray('Tiempo Total de Ejecución  :')} ${chalk.white(`${stats.durationSeconds} segundos`)}`);
    console.log(chalk.bold.white('════════════════════════════════════════════════════════════════════════\n'));

    if (leads.length > 0) {
      console.log(chalk.bold.yellow('Top Leads Calificados Listos para Contacto:'));
      leads.slice(0, 5).forEach((lead, idx) => {
        const catBadge =
          lead.category === 'SIN_WEB'
            ? chalk.bgYellow.black(' SIN_WEB ')
            : lead.category === 'SOLO_RED_SOCIAL'
            ? chalk.bgMagenta.white(' RED_SOCIAL ')
            : lead.category === 'WEB_CAIDA'
            ? chalk.bgRed.white(' WEB_CAIDA ')
            : chalk.bgCyan.black(' OBSOLETO ');

        console.log(`\n${chalk.bold.white(`${idx + 1}. ${lead.name}`)} ${catBadge}`);
        console.log(`   ${chalk.gray('Tel:')} ${lead.phone || 'N/A'} | ${chalk.gray('Web:')} ${lead.website_url || 'Ninguna'}`);
        if (lead.pagespeed_score !== undefined) {
          console.log(`   ${chalk.gray('PageSpeed:')} ${lead.pagespeed_score}/100 | ${chalk.gray('LCP:')} ${lead.lcp_seconds}s`);
        }
        console.log(`   ${chalk.gray('Pitch WhatsApp:')} ${chalk.italic.green(`"${lead.pitch_mensaje}"`)}`);
      });

      console.log('\n' + chalk.green(`✔ Base de datos SQLite guardada en: ./data/prospector.sqlite`));
      console.log(chalk.green(`✔ Archivo CSV guardado en: ${outputCsv}\n`));
    }
  } catch (error: any) {
    spinner.fail(chalk.bold.red(`Fallo en el pipeline: ${error.message}`));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(chalk.red('Error crítico no controlado:'), err);
  process.exit(1);
});
