// scripts/carica-cloudinary.js
//
// npm run cloudinary:carica: copia su Cloudinary tutti i file già presenti in
// UPLOAD_DIR (per esempio quelli creati dal seed in locale), con gli stessi
// percorsi che il DB conosce. Si può rilanciare: sovrascrive.
// ponytail: un file alla volta; con migliaia di file conviene caricarli in parallelo.

const fs = require('node:fs/promises');
const path = require('node:path');
const config = require('../src/config/env');
const file = require('../src/utils/file');

async function main() {
  if (!config.upload.cloudinary) {
    throw new Error('CLOUDINARY_URL non impostato');
  }
  const radice = path.resolve(config.upload.cartella);
  const voci = await fs.readdir(radice, { recursive: true, withFileTypes: true });
  const relativi = voci
    .filter((voce) => voce.isFile())
    .map((voce) => file.percorsoRelativo(path.join(voce.parentPath, voce.name)));
  for (const [indice, relativo] of relativi.entries()) {
    await file.carica(relativo);
    console.log(`${indice + 1}/${relativi.length} ${relativo}`);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
