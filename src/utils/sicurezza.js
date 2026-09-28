// Token casuali e hash. Nel DB finisce solo l'hash SHA-256 dei token.

const crypto = require('node:crypto');

const hash = (valore) => crypto.createHash('sha256').update(String(valore)).digest('hex');

/** Token opaco da mandare al client (link email, refresh, check-in online). */
const tokenCasuale = (byte = 32) => crypto.randomBytes(byte).toString('base64url');

/** Codice numerico a 6 cifre (verifica email). */
const codiceNumerico = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');

module.exports = { hash, tokenCasuale, codiceNumerico, uuid: crypto.randomUUID };
