process.env.DB_NAME = 'prova';
process.env.DB_USER = 'utente';
process.env.JWT_ACCESS_SECRET = 'a'.repeat(32);
process.env.JWT_REFRESH_SECRET = 'b'.repeat(32);
process.env.JWT_CHAT_SECRET = 'c'.repeat(32);

jest.mock('../../../src/models', () => ({ sequelize: {} }));
jest.mock('../../../src/repositories/camere.repository', () => ({
  trovaTipologiePubbliche: jest.fn(),
  trovaCamerePubbliche: jest.fn(),
}));
jest.mock('../../../src/services/contenuti.service', () => ({}));

const camereRepo = require('../../../src/repositories/camere.repository');
const camere = require('../../../src/services/camere.service');

const record = (dati) => ({ ...dati, toJSON: () => dati });

test('la tipologia del sito porta le sue camere e le sue dotazioni, tutte tradotte', async () => {
  const terrazzo = { id: 9, nome: 'Terrazzo', traduzioni: [{ campo: 'nome', testo: 'Terrace' }] };
  camereRepo.trovaTipologiePubbliche.mockResolvedValue([
    record({ id: 2, nome: 'Doppia', servizi: [terrazzo], traduzioni: [] }),
  ]);
  camereRepo.trovaCamerePubbliche.mockResolvedValue([
    record({
      id: 5,
      numero: '102',
      descrizione: 'Vista mare',
      traduzioni: [{ campo: 'descrizione', testo: 'Sea view' }],
    }),
  ]);

  const tipologia = await camere.tipologiaPubblica('doppia', 'en');

  expect(camereRepo.trovaCamerePubbliche).toHaveBeenCalledWith(2, 'en');
  expect(tipologia.servizi).toEqual([{ id: 9, nome: 'Terrace' }]);
  expect(tipologia.camere).toEqual([{ id: 5, numero: '102', descrizione: 'Sea view' }]);
});

test('tipologia inesistente o non attiva: non trovata', async () => {
  camereRepo.trovaTipologiePubbliche.mockResolvedValue([]);

  await expect(camere.tipologiaPubblica('nessuna')).rejects.toMatchObject({
    codice: 'TIPOLOGIA_NON_TROVATA',
  });
});
