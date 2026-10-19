// Log solo su console: su Render i log di stdout sono già raccolti, e il disco
// è poco. In produzione JSON (filtrabile), in sviluppo testo leggibile.

const winston = require('winston');
const config = require('./env');

const { combine, timestamp, errors, json, colorize, printf } = winston.format;

const leggibile = printf(({ level, message, timestamp: ora, stack, ...dati }) => {
  const extra = Object.keys(dati).length ? ` ${JSON.stringify(dati)}` : '';
  return `${ora} ${level}: ${stack || message}${extra}`;
});

module.exports = winston.createLogger({
  level: config.livelloLog,
  silent: config.test && !process.env.LOG_LEVEL,
  format: combine(
    timestamp(),
    errors({ stack: true }),
    config.produzione ? json() : combine(colorize(), leggibile),
  ),
  transports: [new winston.transports.Console()],
});
