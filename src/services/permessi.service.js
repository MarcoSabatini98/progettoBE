// Permessi per ruolo, configurabili dall'admin. L'admin li ha sempre tutti:
// non può togliersene nessuno per sbaglio e restare chiuso fuori.

const { Ruolo, Permesso, RuoloPermesso, RegolaChat, sequelize } = require('../models');
const { oppure404, richiestaNonValida } = require('../utils/errori');

const ADMIN = 'admin';

/** Map ruolo → Set di codici permesso. */
let cache = null;

async function carica() {
  if (!cache) {
    const [righe, tutti] = await Promise.all([
      RuoloPermesso.findAll({ raw: true }),
      Permesso.findAll({ attributes: ['codice'], raw: true }),
    ]);
    cache = new Map();
    for (const { ruolo, permesso } of righe) {
      if (!cache.has(ruolo)) cache.set(ruolo, new Set());
      cache.get(ruolo).add(permesso);
    }
    cache.set(ADMIN, new Set(tutti.map((p) => p.codice)));
  }
  return cache;
}

async function ha(ruolo, permesso) {
  return (await carica()).get(ruolo)?.has(permesso) ?? false;
}

async function permessiDi(ruolo) {
  return [...((await carica()).get(ruolo) ?? [])].sort();
}

/** Ruoli, catalogo dei permessi e assegnazioni: la matrice per l'admin. */
async function matrice() {
  const [ruoli, permessi, mappa] = await Promise.all([
    Ruolo.findAll({ order: [['staff', 'DESC'], 'codice'], raw: true }),
    Permesso.findAll({ order: ['modulo', 'codice'], raw: true }),
    carica(),
  ]);
  return {
    permessi,
    ruoli: ruoli.map((r) => ({ ...r, permessi: [...(mappa.get(r.codice) ?? [])].sort() })),
  };
}

/** Sostituisce i permessi di un ruolo (non admin). */
async function impostaPermessi(ruolo, codici) {
  if (ruolo === ADMIN) {
    throw richiestaNonValida(
      'RUOLO_NON_MODIFICABILE',
      'L’amministratore ha sempre tutti i permessi',
    );
  }
  oppure404(await Ruolo.findByPk(ruolo), 'RUOLO_NON_TROVATO', 'Ruolo non trovato');
  const validi = new Set(
    (await Permesso.findAll({ attributes: ['codice'], raw: true })).map((p) => p.codice),
  );
  const sconosciuti = codici.filter((c) => !validi.has(c));
  if (sconosciuti.length) {
    throw richiestaNonValida(
      'PERMESSO_SCONOSCIUTO',
      `Permessi inesistenti: ${sconosciuti.join(', ')}`,
    );
  }
  await sequelize.transaction(async (transaction) => {
    await RuoloPermesso.destroy({ where: { ruolo }, transaction });
    await RuoloPermesso.bulkCreate(
      [...new Set(codici)].map((permesso) => ({ ruolo, permesso })),
      { transaction },
    );
  });
  svuotaCache();
  return permessiDi(ruolo);
}

// --- regole della chat interna ----------------------------------------------

const coppia = (a, b) => (a <= b ? [a, b] : [b, a]);

function regoleChat() {
  return RegolaChat.findAll({ order: ['ruolo_a', 'ruolo_b'], raw: true });
}

async function puoChattare(ruoloA, ruoloB) {
  const [ruolo_a, ruolo_b] = coppia(ruoloA, ruoloB);
  return Boolean(await RegolaChat.findOne({ where: { ruolo_a, ruolo_b } }));
}

/** Sostituisce tutte le regole: [[ruolo, ruolo], ...]. */
async function impostaRegoleChat(coppie) {
  const staff = new Set(
    (await Ruolo.findAll({ where: { staff: true }, attributes: ['codice'], raw: true })).map(
      (r) => r.codice,
    ),
  );
  const nonStaff = coppie.flat().filter((r) => !staff.has(r));
  if (nonStaff.length) {
    throw richiestaNonValida(
      'RUOLO_NON_STAFF',
      `La chat interna è solo per lo staff: ${[...new Set(nonStaff)].join(', ')}`,
    );
  }
  const uniche = [...new Map(coppie.map((c) => [coppia(...c).join('|'), coppia(...c)])).values()];
  await sequelize.transaction(async (transaction) => {
    await RegolaChat.destroy({ where: {}, transaction });
    await RegolaChat.bulkCreate(
      uniche.map(([ruolo_a, ruolo_b]) => ({ ruolo_a, ruolo_b })),
      {
        transaction,
      },
    );
  });
  return regoleChat();
}

function svuotaCache() {
  cache = null;
}

module.exports = {
  ha,
  permessiDi,
  matrice,
  impostaPermessi,
  regoleChat,
  puoChattare,
  impostaRegoleChat,
  svuotaCache,
};
