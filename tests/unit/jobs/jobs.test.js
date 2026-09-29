process.env.DB_NAME = 'prova';
process.env.DB_USER = 'utente';
process.env.JWT_ACCESS_SECRET = 'a'.repeat(32);
process.env.JWT_REFRESH_SECRET = 'b'.repeat(32);
process.env.JWT_CHAT_SECRET = 'c'.repeat(32);

const cron = require('node-cron');
const logger = require('../../../src/config/logger');
const { JOB, esegui } = require('../../../src/jobs');

test('ogni job ha un orario valido e un nome unico', () => {
  for (const job of JOB) {
    expect(cron.validate(job.quando)).toBe(true);
  }
  expect(new Set(JOB.map((job) => job.nome)).size).toBe(JOB.length);
});

test('un job che fallisce finisce nel log e non lancia', async () => {
  const log = jest.spyOn(logger, 'error').mockImplementation(() => {});
  await esegui({ nome: 'prova', esegui: () => Promise.reject(new Error('rotto')) });
  expect(log).toHaveBeenCalledWith('Job prova non riuscito', expect.anything());
  log.mockRestore();
});
