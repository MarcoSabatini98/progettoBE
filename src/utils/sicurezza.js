// Token casuali e hash. Nel DB finisce solo l'hash SHA-256 dei token.

const crypto = require('node:crypto');

const hash = (valore) => crypto.createHash('sha256').update(String(valore)).digest('hex');

/** Token opaco da mandare al client (link email, refresh, check-in online). */
const tokenCasuale = (byte = 32) => crypto.randomBytes(byte).toString('base64url');

/** Codice numerico a 6 cifre (verifica email). */
const codiceNumerico = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');

/** Confronto a tempo costante tra due stringhe esadecimali della stessa lunghezza. */
function ugualiSicuri(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

module.exports = { hash, tokenCasuale, codiceNumerico, ugualiSicuri, uuid: crypto.randomUUID };
