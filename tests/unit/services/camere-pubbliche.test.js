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

test('la tipologia del sito porta le sue camere, con le dotazioni tradotte', async () => {
  camereRepo.trovaTipologiePubbliche.mockResolvedValue([
    record({ id: 2, nome: 'Doppia', servizi: [], traduzioni: [] }),
  ]);
  const terrazzo = { id: 9, nome: 'Terrazzo', traduzioni: [{ campo: 'nome', testo: 'Terrace' }] };
  camereRepo.trovaCamerePubbliche.mockResolvedValue([
    record({ id: 5, numero: '102', servizi: [terrazzo] }),
  ]);

  const tipologia = await camere.tipologiaPubblica('doppia', 'en');

  expect(camereRepo.trovaCamerePubbliche).toHaveBeenCalledWith(2, 'en');
  expect(tipologia.camere).toEqual([
    { id: 5, numero: '102', servizi: [{ id: 9, nome: 'Terrace' }] },
  ]);
});

test('tipologia inesistente o non attiva: non trovata', async () => {
  camereRepo.trovaTipologiePubbliche.mockResolvedValue([]);

  await expect(camere.tipologiaPubblica('nessuna')).rejects.toMatchObject({
    codice: 'TIPOLOGIA_NON_TROVATA',
  });
});
