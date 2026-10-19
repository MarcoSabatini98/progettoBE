process.env.DB_NAME = 'prova';
process.env.DB_USER = 'utente';
process.env.JWT_ACCESS_SECRET = 'a'.repeat(32);
process.env.JWT_REFRESH_SECRET = 'b'.repeat(32);
process.env.JWT_CHAT_SECRET = 'c'.repeat(32);

const { sequelize, transazione } = require('../../../src/config/db');

const T = { id: 'transazione-finta' };

beforeEach(() => {
  jest.spyOn(sequelize, 'transaction').mockImplementation((fn) => fn(T));
  jest.spyOn(sequelize, 'query').mockResolvedValue([]);
});

afterEach(() => jest.restoreAllMocks());

describe('config/db transazione', () => {
  test('imposta e poi azzera le variabili di audit nella stessa transazione', async () => {
    const risultato = await transazione({ utenteId: 7, ip: '1.2.3.4' }, (t) => {
      expect(t).toBe(T);
      return Promise.resolve('fatto');
    });

    expect(risultato).toBe('fatto');
    expect(sequelize.query).toHaveBeenNthCalledWith(1, 'SET @id_utente = ?, @ip = ?', {
      replacements: [7, '1.2.3.4'],
      transaction: T,
    });
    expect(sequelize.query).toHaveBeenLastCalledWith('SET @id_utente = NULL, @ip = NULL', {
      transaction: T,
    });
  });

  test('senza contesto usa NULL', async () => {
    await transazione(undefined, () => Promise.resolve());
    expect(sequelize.query.mock.calls[0][1].replacements).toEqual([null, null]);
  });

  test("azzera le variabili anche se l'operazione fallisce e propaga l'errore", async () => {
    await expect(
      transazione({ utenteId: 1 }, () => Promise.reject(new Error('CAMERA_NON_DISPONIBILE'))),
    ).rejects.toThrow('CAMERA_NON_DISPONIBILE');
    expect(sequelize.query).toHaveBeenCalledTimes(2);
  });

  test("un errore nell'azzeramento non copre il risultato", async () => {
    sequelize.query.mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('connessione persa'));
    await expect(transazione({}, () => Promise.resolve(42))).resolves.toBe(42);
  });
});
