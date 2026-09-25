// Scorciatoie per definire i campi dei modelli.
// Regole:
//   - lo schema SQL (database/schema.sql) è la fonte di verità: mai sync();
//   - una colonna NOT NULL con DEFAULT nel DB ha lo stesso defaultValue qui,
//     altrimenti Sequelize rifiuta il create() prima ancora di inviarlo;
//   - le colonne generate dal DB (notti, totale...) sono in sola lettura.

const { DataTypes } = require('sequelize');

const T = DataTypes;
const EURO = T.DECIMAL(10, 2);
const PERCENTUALE = T.DECIMAL(5, 2);

const id = (tipo = T.INTEGER.UNSIGNED) => ({ type: tipo, primaryKey: true, autoIncrement: true });

/** Chiave esterna o riferimento a un id. */
const rif = (obbligatorio = false, tipo = T.INTEGER.UNSIGNED) => ({
  type: tipo,
  allowNull: !obbligatorio,
});

/** Colonna NOT NULL, con l'eventuale DEFAULT del database. */
function obbligatorio(tipo, predefinito) {
  return predefinito === undefined
    ? { type: tipo, allowNull: false }
    : { type: tipo, allowNull: false, defaultValue: predefinito };
}

/** uuid generato in JS, così è disponibile subito dopo il create(). */
const uuid = () => ({ type: T.CHAR(36), allowNull: false, defaultValue: T.UUIDV4 });

/** MariaDB salva JSON come testo: il getter lo restituisce già convertito. */
function json(nome) {
  return {
    type: T.JSON,
    get() {
      const valore = this.getDataValue(nome);
      return typeof valore === 'string' ? JSON.parse(valore) : valore;
    },
  };
}

/** Colonna calcolata dal database: leggibile, mai scritta dal backend. */
function generata(tipo, nome) {
  return {
    type: tipo,
    set() {
      throw new Error(`La colonna ${nome} è calcolata dal database e non si può impostare`);
    },
  };
}

module.exports = { T, EURO, PERCENTUALE, id, rif, obbligatorio, uuid, json, generata };
