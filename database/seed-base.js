// Dati di base che servono a ogni installazione, anche in produzione.
//
//   npm run seed   (insieme ai dati di prova, database/seeders)
//
//  - tabelle ufficiali Alloggiati Web (comuni, stati, documenti) dai file della
//    Polizia di Stato in database/dati (aggiornati ogni volta che si rilancia)
//  - il primo amministratore, da SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD
//  - le voci predefinite della checklist delle pulizie
//  - le dotazioni più comuni delle camere
//  - il piano tariffario "Standard" predefinito
//
// Si può rilanciare: ciò che esiste già non viene toccato.
// Ruoli, permessi, livelli fedeltà e impostazioni li crea già schema.sql.
//
// I file ufficiali si scaricano da
// https://alloggiatiweb.poliziadistato.it/PortaleAlloggiati/ashx/Download.ashx?ID=0&N=COMUNI
// (ID=1 stati, ID=2 documenti).

const fs = require('node:fs');
const path = require('node:path');
const modelli = require('../src/models');
const utentiRepo = require('../src/repositories/utenti.repository');
const authService = require('../src/services/auth.service');
const chatService = require('../src/services/chat.service');

const CARTELLA_DATI = path.join(__dirname, 'dati');
const RIGHE_PER_BLOCCO = 1000;

// ─────────────────────────────────────
// Lettura dei file Alloggiati
// ─────────────────────────────────────

/**
 * Righe di un CSV Alloggiati (senza intestazione), già divise nei campi.
 * I file ufficiali non hanno virgolette né virgole nei valori.
 * @param {string} testo
 * @returns {string[][]}
 */
function righeCsv(testo) {
  const righe = testo.split(/\r?\n/).filter((riga) => riga.trim() !== '');
  return righe.slice(1).map((riga) => riga.split(',').map((campo) => campo.trim()));
}

/** "31/12/1983 00:00:00" → "1983-12-31"; vuoto → null. */
function dataDaCsv(testo) {
  if (!testo) {
    return null;
  }
  const [giorno, mese, anno] = testo.split(' ')[0].split('/');
  return `${anno}-${mese}-${giorno}`;
}

/**
 * Comuni o stati: Codice,Descrizione,Provincia,DataFineVal.
 * Gli stati hanno provincia "ES" (estero), che nel database è NULL.
 * @param {string} testo
 * @param {'comune'|'stato'} tipo
 */
function luoghiDaCsv(testo, tipo) {
  return righeCsv(testo).map(([codice, descrizione, provincia, fineValidita]) => ({
    codice,
    descrizione,
    provincia: tipo === 'stato' ? null : provincia,
    tipo,
    soppresso_il: dataDaCsv(fineValidita),
  }));
}

/** Documenti: Codice,Descrizione. */
function documentiDaCsv(testo) {
  return righeCsv(testo).map(([codice, descrizione]) => ({ codice, descrizione }));
}

function leggiFile(nome) {
  return fs.readFileSync(path.join(CARTELLA_DATI, nome), 'utf8');
}

// ─────────────────────────────────────
// Dati predefiniti
// ─────────────────────────────────────

// tipo_pulizia null = vale per tutti i tipi di pulizia.
const CHECKLIST = [
  { voce: 'Arieggiare la camera', tipo_pulizia: null },
  { voce: 'Svuotare i cestini', tipo_pulizia: null },
  { voce: 'Rifare il letto', tipo_pulizia: 'riassetto' },
  { voce: 'Cambiare lenzuola e federe', tipo_pulizia: 'partenza' },
  { voce: 'Cambiare gli asciugamani', tipo_pulizia: 'partenza' },
  { voce: 'Pulire e disinfettare il bagno', tipo_pulizia: null },
  { voce: 'Rifornire carta igienica e cortesia bagno', tipo_pulizia: null },
  { voce: 'Spolverare mobili e superfici', tipo_pulizia: null },
  { voce: 'Aspirare e lavare i pavimenti', tipo_pulizia: null },
  { voce: 'Controllare minibar e bollitore', tipo_pulizia: 'partenza' },
  { voce: 'Controllare oggetti dimenticati', tipo_pulizia: 'partenza' },
  { voce: 'Verificare luci, TV e telecomando', tipo_pulizia: 'partenza' },
  { voce: 'Pulire vetri e infissi', tipo_pulizia: 'profonda' },
  { voce: 'Lavare tende e coprimaterasso', tipo_pulizia: 'profonda' },
  { voce: 'Pulire sotto letti e mobili', tipo_pulizia: 'profonda' },
  { voce: 'Controllo finale della camera', tipo_pulizia: 'ispezione' },
];

// Dotazioni incluse nel prezzo: la struttura assegna quelle che ha.
const DOTAZIONI = [
  { nome: 'Wi-Fi gratuito', icona: 'wifi' },
  { nome: 'Aria condizionata', icona: 'ac_unit' },
  { nome: 'Riscaldamento', icona: 'heat' },
  { nome: 'TV a schermo piatto', icona: 'tv' },
  { nome: 'Bagno privato', icona: 'bathtub' },
  { nome: 'Doccia', icona: 'shower' },
  { nome: 'Asciugacapelli', icona: 'air' },
  { nome: 'Set di cortesia', icona: 'soap' },
  { nome: 'Biancheria da letto e da bagno', icona: 'bed' },
  { nome: 'Minibar', icona: 'kitchen' },
  { nome: 'Bollitore', icona: 'coffee' },
  { nome: 'Cassaforte', icona: 'lock' },
  { nome: 'Scrivania', icona: 'desk' },
  { nome: 'Balcone', icona: 'balcony' },
  { nome: 'Vista mare', icona: 'water' },
  { nome: 'Accessibile in sedia a rotelle', icona: 'accessible' },
  { nome: 'Culla su richiesta', icona: 'crib' },
  { nome: 'Animali ammessi', icona: 'pets' },
].map((dotazione, indice) => ({ ...dotazione, tipo: 'dotazione', prezzo: 0, ordine: indice }));

const PIANO_STANDARD = {
  nome: 'Standard',
  descrizione: 'Tariffa flessibile: cancellazione gratuita fino a 48 ore prima.',
  tipo_variazione: 'percentuale',
  valore_variazione: 0,
  rimborsabile: true,
  ore_cancellazione_gratuita: 48,
  penale_percentuale: 100,
  acconto_percentuale: 30,
  predefinito: true,
  ordine: 0,
};

// ─────────────────────────────────────
// Caricamento
// ─────────────────────────────────────

async function caricaAlloggiati() {
  const luoghi = [
    ...luoghiDaCsv(leggiFile('alloggiati_comuni.csv'), 'comune'),
    ...luoghiDaCsv(leggiFile('alloggiati_stati.csv'), 'stato'),
  ];
  for (let inizio = 0; inizio < luoghi.length; inizio += RIGHE_PER_BLOCCO) {
    await modelli.AlloggiatiLuogo.bulkCreate(luoghi.slice(inizio, inizio + RIGHE_PER_BLOCCO), {
      updateOnDuplicate: ['descrizione', 'provincia', 'tipo', 'soppresso_il'],
    });
  }

  const documenti = documentiDaCsv(leggiFile('alloggiati_documenti.csv'));
  await modelli.AlloggiatiDocumento.bulkCreate(documenti, {
    updateOnDuplicate: ['descrizione'],
  });

  return { luoghi: luoghi.length, documenti: documenti.length };
}

// Il primo admin si crea solo qui: dall'applicazione l'admin non è assegnabile.
async function creaPrimoAdmin() {
  if ((await utentiRepo.contaAdminAttivi()) > 0) {
    return 'già presente';
  }

  const { SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, SEED_ADMIN_NOME, SEED_ADMIN_COGNOME } =
    process.env;
  if (!SEED_ADMIN_EMAIL || !SEED_ADMIN_PASSWORD) {
    return 'non creato: imposta SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD nel file .env';
  }
  if (SEED_ADMIN_PASSWORD.length < 8) {
    throw new Error('SEED_ADMIN_PASSWORD deve avere almeno 8 caratteri');
  }

  const email = authService.normalizzaEmail(SEED_ADMIN_EMAIL);
  if (await utentiRepo.esisteEmail(email)) {
    throw new Error(`Esiste già un account non admin con l'email ${email}`);
  }

  const passwordHash = await authService.hashPassword(SEED_ADMIN_PASSWORD);
  await modelli.sequelize.transaction(async (transaction) => {
    const admin = await utentiRepo.creaUtente(
      {
        email,
        password_hash: passwordHash,
        ruolo: 'admin',
        nome: SEED_ADMIN_NOME || 'Amministratore',
        cognome: SEED_ADMIN_COGNOME || '',
        email_verificata_il: new Date(),
      },
      transaction,
    );
    await chatService.sincronizzaSquadre(admin.id, admin.ruolo, true, transaction);
  });
  return `creato (${email})`;
}

async function seedBase() {
  const alloggiati = await caricaAlloggiati();
  const admin = await creaPrimoAdmin();

  // La checklist si crea solo la prima volta: dopo è della struttura.
  const vociChecklist = await modelli.ChecklistModello.count();
  if (vociChecklist === 0) {
    await modelli.ChecklistModello.bulkCreate(
      CHECKLIST.map((voce, indice) => ({ ...voce, ordine: indice })),
    );
  }

  await modelli.Servizio.bulkCreate(DOTAZIONI, { ignoreDuplicates: true });

  const pianiEsistenti = await modelli.PianoTariffario.count();
  if (pianiEsistenti === 0) {
    await modelli.PianoTariffario.create(PIANO_STANDARD);
  }

  return {
    'Alloggiati: comuni e stati': alloggiati.luoghi,
    'Alloggiati: documenti': alloggiati.documenti,
    Amministratore: admin,
    'Checklist pulizie': vociChecklist === 0 ? `${CHECKLIST.length} voci create` : 'già presente',
    Dotazioni: `${DOTAZIONI.length} verificate`,
    'Piano tariffario': pianiEsistenti === 0 ? 'Standard creato' : 'già presente',
  };
}

module.exports = { righeCsv, dataDaCsv, luoghiDaCsv, documentiDaCsv, seedBase };
