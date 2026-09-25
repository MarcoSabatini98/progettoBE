// Confronta i modelli con database/schema.sql: stesse tabelle, stesse colonne,
// stessa obbligatorietà. Così un modello non può restare indietro rispetto
// allo schema senza che i test lo segnalino.

const fs = require('node:fs');
const path = require('node:path');

process.env.DB_NAME = 'prova';
process.env.DB_USER = 'utente';
process.env.JWT_ACCESS_SECRET = 'a'.repeat(32);
process.env.JWT_REFRESH_SECRET = 'b'.repeat(32);
process.env.JWT_CHAT_SECRET = 'c'.repeat(32);

const db = require('../../../src/models');

/** { tabella: { colonna: { nonNullo, predefinito, generata } } } */
function leggiSchema() {
  const sql = fs.readFileSync(path.join(__dirname, '../../../database/schema.sql'), 'utf8');
  const tabelle = {};
  for (const [, nome, corpo] of sql.matchAll(/^CREATE TABLE (\w+) \(\n([\s\S]*?)\n\);/gm)) {
    tabelle[nome] = {};
    for (const [riga, colonna] of corpo.matchAll(/^ {2}([a-z_]\w*)\s+[A-Z].*$/gm)) {
      const definizione = riga.replace(/--.*$/, '');
      const generata = /\bAS \(/.test(definizione);
      tabelle[nome][colonna] = {
        generata,
        nonNullo: !generata && /NOT NULL/.test(definizione),
        // i DEFAULT calcolati dal DB (data corrente, UUID) non vanno replicati
        predefinito: /DEFAULT (?!CURRENT_TIMESTAMP|\(UUID)/.test(definizione),
      };
    }
  }
  return tabelle;
}

const schema = leggiSchema();
const modelli = Object.values(db.sequelize.models);

test('ogni tabella dello schema ha il suo modello e viceversa', () => {
  expect(modelli.map((m) => m.getTableName()).sort()).toEqual(Object.keys(schema).sort());
});

describe.each(modelli.map((m) => [m.getTableName(), m]))('%s', (tabella, modello) => {
  const colonneSchema = schema[tabella];
  const attributi = Object.values(modello.getAttributes()).filter((a) => a.type.key !== 'VIRTUAL');
  const timestamp = Object.values(modello._timestampAttributes);

  test('stesse colonne dello schema', () => {
    expect(attributi.map((a) => a.field).sort()).toEqual(Object.keys(colonneSchema).sort());
  });

  test('obbligatorietà e valori predefiniti allineati', () => {
    const errori = [];
    for (const a of attributi) {
      const c = colonneSchema[a.field];
      if (!c || c.generata || a.autoIncrement || timestamp.includes(a.field)) continue;
      const nonNulloModello = a.allowNull === false || a.primaryKey === true;
      if (c.nonNullo !== nonNulloModello) errori.push(`${a.field}: NOT NULL diverso`);
      if (c.nonNullo && c.predefinito && a.defaultValue === undefined)
        errori.push(`${a.field}: manca defaultValue`);
    }
    expect(errori).toEqual([]);
  });
});

test('i campi JSON arrivano già convertiti', () => {
  const p = db.Prenotazione.build({ dettaglio_prezzo: { notti: [100] } });
  p.setDataValue('dettaglio_prezzo', '{"notti":[100]}');
  expect(p.dettaglio_prezzo).toEqual({ notti: [100] });
});

test('le colonne calcolate dal database non si possono impostare', () => {
  expect(() => db.Prenotazione.build({ totale: 10 })).toThrow(/calcolata dal database/);
});

test("l'utente non espone l'hash della password e ha un colore avatar stabile", () => {
  const u = db.Utente.build({ uuid: '0000ff00-0000-4000-8000-000000000000' });
  expect(u.colore_avatar).toBe(`hsl(${0xff00 % 360} 55% 45%)`);
  expect(db.Utente._scope.attributes.exclude).toContain('password_hash');
});
