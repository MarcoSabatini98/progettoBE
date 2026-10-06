// Il contenuto di un file caricato deve corrispondere al formato dichiarato.

const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

jest.mock('../../../src/config/env', () => ({
  upload: { cartella: 'uploads', maxByte: 1024, maxByteVideo: 4096 },
}));

const { caricaMedia, caricaAllegatiChat } = require('../../../src/middlewares/upload.middleware');

const verificaImmagine = caricaMedia.at(-1);
const verificaAllegati = caricaAllegatiChat.at(-1);

let cartella;
beforeAll(async () => {
  cartella = await fs.mkdtemp(path.join(os.tmpdir(), 'upload-'));
});
afterAll(() => fs.rm(cartella, { recursive: true, force: true }));

async function caricato(nome, mimetype, byte) {
  const percorso = path.join(cartella, nome);
  await fs.writeFile(percorso, Buffer.from(byte));
  return { path: percorso, mimetype, size: byte.length };
}

const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0, 0x10];
const MP4 = [0, 0, 0, 0x20, ...Buffer.from('ftypisom')];
const WEBP = [...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WEBPVP8 ')];
const PDF = [...Buffer.from('%PDF-1.7\n')];

describe('verifica del contenuto dei file caricati', () => {
  test('accetta file che iniziano con la firma del loro formato', async () => {
    const next = jest.fn();
    await verificaImmagine({ file: await caricato('a.webp', 'image/webp', WEBP) }, {}, next);
    await verificaImmagine({ file: await caricato('v.mp4', 'video/mp4', MP4) }, {}, next);
    await verificaAllegati(
      {
        files: [
          await caricato('b.jpg', 'image/jpeg', JPEG),
          await caricato('c.pdf', 'application/pdf', PDF),
        ],
      },
      {},
      next,
    );
    await verificaAllegati({}, {}, next);
    expect(next).toHaveBeenCalledTimes(4);
  });

  test('rifiuta con 415 un file travestito da un altro formato', async () => {
    const finto = await caricato('d.png', 'image/png', [
      ...Buffer.from('<script>alert(1)</script>'),
    ]);
    await expect(verificaImmagine({ file: finto }, {}, jest.fn())).rejects.toMatchObject({
      status: 415,
      codice: 'FORMATO_FILE_NON_VALIDO',
    });
  });

  test('rifiuta un file più corto della firma', async () => {
    const corto = await caricato('e.jpg', 'image/jpeg', [0xff]);
    await expect(verificaImmagine({ file: corto }, {}, jest.fn())).rejects.toMatchObject({
      status: 415,
    });
  });

  test("un'immagine oltre il suo limite è rifiutata, un video no", async () => {
    const grande = [...JPEG, ...Array(2000).fill(0)];
    await expect(
      verificaImmagine({ file: await caricato('f.jpg', 'image/jpeg', grande) }, {}, jest.fn()),
    ).rejects.toMatchObject({ status: 413, codice: 'FILE_TROPPO_GRANDE' });
    const next = jest.fn();
    const video = [...MP4, ...Array(2000).fill(0)];
    await verificaImmagine({ file: await caricato('g.mp4', 'video/mp4', video) }, {}, next);
    expect(next).toHaveBeenCalled();
  });
});
