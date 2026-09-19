// Configuração central lida das variáveis de ambiente (com valores padrão).
import path from 'node:path';

export const config = {
  port: Number(process.env.PORT || 4000),

  // API do google-maps-scraper (gosom). Ver docker-compose.yml.
  scraperBaseUrl: (process.env.SCRAPER_BASE_URL || 'http://localhost:8080').replace(/\/$/, ''),

  // Banco de leads (SQLite)
  dbPath: process.env.DB_PATH || path.resolve('data', 'leads.db'),

  // Idioma padrão das buscas no Maps
  defaultLang: process.env.DEFAULT_LANG || 'pt',

  // CORS
  corsOrigin: process.env.CORS_ORIGIN || '*',

  // Limites/segurança do scraper
  scraper: {
    // profundidade de rolagem (quanto maior, mais resultados e mais lento)
    depth: Number(process.env.SCRAPER_DEPTH || 10),
    // tempo máximo de um job em segundos
    maxTime: Number(process.env.SCRAPER_MAX_TIME || 600),
    // intervalo de verificação do status do job (ms)
    pollIntervalMs: Number(process.env.SCRAPER_POLL_MS || 4000),
    // tempo máximo total esperando um job (ms)
    pollTimeoutMs: Number(process.env.SCRAPER_POLL_TIMEOUT_MS || 12 * 60 * 1000),
  },
};
