process.env.DB_NAME = 'prova';
process.env.DB_USER = 'utente';
process.env.JWT_ACCESS_SECRET = 'a'.repeat(32);
process.env.JWT_REFRESH_SECRET = 'b'.repeat(32);
process.env.JWT_CHAT_SECRET = 'c'.repeat(32);

jest.mock('../../../src/repositories/contenuti.repository', () => ({
  trovaPaginaPubblica: jest.fn(),
  trovaPaginaPerId: jest.fn(),
  creaSezione: jest.fn(),
  trovaSezionePerId: jest.fn(),
  eliminaSezione: jest.fn(),
  trovaMedia: jest.fn(),
  eliminaMediaDi: jest.fn(),
  eliminaTraduzioniDi: jest.fn(),
}));
jest.mock('../../../src/models', () => ({
  sequelize: { transaction: (lavoro) => lavoro('transazione') },
}));

const contenutiRepo = require('../../../src/repositories/contenuti.repository');
const contenuti = require('../../../src/services/contenuti.service');

beforeEach(() => jest.clearAllMocks());

test('la pagina pubblica arriva tradotta, sezioni comprese', async () => {
  contenutiRepo.trovaPaginaPubblica.mockResolvedValue({
    chiave: 'struttura',
    descrizione: 'Casa sul mare',
    traduzioni: [{ campo: 'descrizione', testo: 'House by the sea' }],
    sezioni: [
      { titolo: 'Giardino', testo: 'Ulivi', traduzioni: [{ campo: 'titolo', testo: 'Garden' }] },
    ],
  });

  const pagina = await contenuti.paginaPubblica('struttura', 'en');

  expect(contenutiRepo.trovaPaginaPubblica).toHaveBeenCalledWith('struttura', 'en');
  expect(pagina).toEqual({
    chiave: 'struttura',
    descrizione: 'House by the sea',
    sezioni: [{ titolo: 'Garden', testo: 'Ulivi' }],
  });
});

test('una sezione non nasce su una pagina che non esiste', async () => {
  contenutiRepo.trovaPaginaPerId.mockResolvedValue(null);

  await expect(
    contenuti.creaSezione({ pagina_id: 9, titolo: 'Spiaggia', testo: 'A due passi' }),
  ).rejects.toMatchObject({ codice: 'PAGINA_NON_TROVATA' });
  expect(contenutiRepo.creaSezione).not.toHaveBeenCalled();
});

test('la sezione eliminata si porta via immagine e traduzioni', async () => {
  contenutiRepo.trovaSezionePerId.mockResolvedValue({ id: 4 });
  contenutiRepo.trovaMedia.mockResolvedValue([]);

  await contenuti.eliminaSezione(4);

  expect(contenutiRepo.eliminaSezione).toHaveBeenCalledWith(4);
  expect(contenutiRepo.eliminaMediaDi).toHaveBeenCalledWith('sezione', 4, 'transazione');
  expect(contenutiRepo.eliminaTraduzioniDi).toHaveBeenCalledWith('sezione', 4, 'transazione');
});
