process.env.DB_NAME = 'prova';
process.env.DB_USER = 'utente';
process.env.JWT_ACCESS_SECRET = 'a'.repeat(32);
process.env.JWT_REFRESH_SECRET = 'b'.repeat(32);
process.env.JWT_CHAT_SECRET = 'c'.repeat(32);

jest.mock('../../../src/models', () => ({
  sequelize: { transaction: (lavoro) => lavoro('transazione') },
}));
jest.mock('../../../src/repositories/impostazioni.repository', () => ({
  trovaTutte: jest.fn(),
  aggiornaValore: jest.fn(),
}));
jest.mock('../../../src/repositories/contenuti.repository', () => ({ trovaMedia: jest.fn() }));

const impostazioniRepo = require('../../../src/repositories/impostazioni.repository');
const contenutiRepo = require('../../../src/repositories/contenuti.repository');
const impostazioni = require('../../../src/services/impostazioni.service');

const righe = [
  { chiave: 'nome', valore: 'Casa Mare', tipo: 'testo', pubblica: true },
  { chiave: 'iban', valore: 'IT00', tipo: 'testo', pubblica: false },
  { chiave: 'aspetto_colore', valore: '#5e6b3a', tipo: 'testo', pubblica: true },
  { chiave: 'aspetto_tema', valore: 'sistema', tipo: 'testo', pubblica: true },
  { chiave: 'orario_checkin', valore: '15:00', tipo: 'testo', pubblica: true },
];

beforeEach(() => {
  jest.clearAllMocks();
  impostazioni.svuotaCache();
  impostazioniRepo.trovaTutte.mockResolvedValue(righe);
});

test('il sito pubblico vede solo le pubbliche, più il logo', async () => {
  contenutiRepo.trovaMedia.mockResolvedValue([{ percorso: 'logo/a.webp' }, { percorso: 'b.webp' }]);

  const pubbliche = await impostazioni.pubbliche();

  expect(contenutiRepo.trovaMedia).toHaveBeenCalledWith('logo');
  expect(pubbliche).toEqual({
    aspetto_logo: 'logo/a.webp',
    nome: 'Casa Mare',
    aspetto_colore: '#5e6b3a',
    aspetto_tema: 'sistema',
    orario_checkin: '15:00',
  });
});

test('senza immagini il logo è null', async () => {
  contenutiRepo.trovaMedia.mockResolvedValue([]);

  expect((await impostazioni.pubbliche()).aspetto_logo).toBeNull();
});

test('colore, tema e orari validi si salvano', async () => {
  await impostazioni.aggiorna(
    { aspetto_colore: '#A1B2C3', aspetto_tema: 'scuro', orario_checkin: '09:30' },
    { utenteId: 1 },
  );

  expect(impostazioniRepo.aggiornaValore).toHaveBeenCalledWith(
    'aspetto_colore',
    '#A1B2C3',
    1,
    'transazione',
  );
  expect(impostazioniRepo.aggiornaValore).toHaveBeenCalledTimes(3);
});

test.each([
  ['aspetto_colore', 'verde'],
  ['aspetto_tema', 'blu'],
  ['orario_checkin', '25:00'],
])('%s non accetta %s', async (chiave, valore) => {
  await expect(impostazioni.aggiorna({ [chiave]: valore })).rejects.toMatchObject({
    codice: 'IMPOSTAZIONE_NON_VALIDA',
  });
  expect(impostazioniRepo.aggiornaValore).not.toHaveBeenCalled();
});

test('i testi senza formato accettano qualunque valore', async () => {
  await impostazioni.aggiorna({ nome: 'Casa: #1' });

  expect(impostazioniRepo.aggiornaValore).toHaveBeenCalledWith(
    'nome',
    'Casa: #1',
    undefined,
    'transazione',
  );
});

test('una chiave inventata è un errore', async () => {
  await expect(impostazioni.aggiorna({ inventata: 1 })).rejects.toMatchObject({
    codice: 'IMPOSTAZIONE_SCONOSCIUTA',
  });
});
