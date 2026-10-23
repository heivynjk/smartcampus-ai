// Tests unitaires du service Photos (tâche 4.2).
// Le client S3 et le générateur d'URL présignée sont mockés : aucun appel réel
// à AWS (voir design.md « les tests mockent le client »).
const test = require('node:test');
const assert = require('node:assert');

// --- Mocks des SDK AWS ------------------------------------------------------
const cheminS3 = require.resolve('@aws-sdk/client-s3');
const cheminPresigner = require.resolve('@aws-sdk/s3-request-presigner');

// Journal des commandes envoyées au client S3 simulé.
const envois = [];

class FauxS3Client {
  constructor(options) {
    this.options = options;
  }

  async send(commande) {
    envois.push(commande);
    return {};
  }
}

// Commandes : on conserve simplement leurs paramètres pour les assertions.
class PutObjectCommand {
  constructor(input) {
    this.input = input;
    this.type = 'Put';
  }
}
class GetObjectCommand {
  constructor(input) {
    this.input = input;
    this.type = 'Get';
  }
}

require.cache[cheminS3] = {
  id: cheminS3,
  filename: cheminS3,
  loaded: true,
  exports: { S3Client: FauxS3Client, PutObjectCommand, GetObjectCommand },
};

// getSignedUrl : renvoie une URL factice reflétant la clé et l'expiration.
require.cache[cheminPresigner] = {
  id: cheminPresigner,
  filename: cheminPresigner,
  loaded: true,
  exports: {
    getSignedUrl: async (client, commande, opts) =>
      `https://signed.example/${commande.input.Key}?exp=${opts.expiresIn}`,
  },
};

// Charger le service APRÈS avoir injecté les mocks.
delete require.cache[require.resolve('../src/services/s3Service')];
const s3Service = require('../src/services/s3Service');

test.beforeEach(() => {
  envois.length = 0;
});

// --- televerserPhoto --------------------------------------------------------
test('televerserPhoto envoie un PutObjectCommand vers photos/ avec ContentType', async () => {
  const file = {
    buffer: Buffer.from('image'),
    mimetype: 'image/jpeg',
    originalname: 'photo.jpg',
  };

  const cle = await s3Service.televerserPhoto('INC-2026-00001', file);

  assert.match(cle, /^photos\/INC-2026-00001-\d+\.jpg$/);
  assert.strictEqual(envois.length, 1);
  const put = envois[0];
  assert.strictEqual(put.type, 'Put');
  assert.strictEqual(put.input.Key, cle);
  assert.strictEqual(put.input.ContentType, 'image/jpeg');
  assert.strictEqual(put.input.Body, file.buffer);
});

test('televerserPhoto utilise l\'extension png pour un PNG', async () => {
  const cle = await s3Service.televerserPhoto('INC-2026-00002', {
    buffer: Buffer.from('x'),
    mimetype: 'image/png',
    originalname: 'capture.png',
  });
  assert.match(cle, /\.png$/);
});

test('televerserPhoto refuse (400) si aucun fichier n\'est fourni', async () => {
  await assert.rejects(
    () => s3Service.televerserPhoto('INC-2026-00003', null),
    (err) => err.status === 400 && typeof err.message === 'string'
  );
});

// --- urlPresignee -----------------------------------------------------------
test('urlPresignee produit une URL présignée valable 900 s', async () => {
  const url = await s3Service.urlPresignee('photos/INC-2026-00001-123.jpg');
  assert.ok(url.includes('photos/INC-2026-00001-123.jpg'));
  assert.ok(url.includes('exp=900'));
});

test('urlPresignee renvoie null si la clé est absente', async () => {
  assert.strictEqual(await s3Service.urlPresignee(null), null);
  assert.strictEqual(await s3Service.urlPresignee(''), null);
});

// --- erreurUploadEnFrancais -------------------------------------------------
test('erreurUploadEnFrancais convertit un dépassement de taille en 400 français', () => {
  const metier = s3Service.erreurUploadEnFrancais({ code: 'LIMIT_FILE_SIZE' });
  assert.strictEqual(metier.status, 400);
  assert.match(metier.message, /5 Mo/);
});

test('erreurUploadEnFrancais convertit un type invalide en 400 français', () => {
  const metier = s3Service.erreurUploadEnFrancais({ code: 'TYPE_INVALIDE' });
  assert.strictEqual(metier.status, 400);
  assert.match(metier.message, /JPG et PNG/);
});

test('erreurUploadEnFrancais renvoie null pour une erreur non reconnue', () => {
  assert.strictEqual(s3Service.erreurUploadEnFrancais({ code: 'AUTRE' }), null);
  assert.strictEqual(s3Service.erreurUploadEnFrancais(null), null);
});

// --- Configuration multer ---------------------------------------------------
test('uploadPhoto est un middileware multer et la limite est 5 Mo', () => {
  assert.strictEqual(typeof s3Service.uploadPhoto, 'function');
  assert.strictEqual(s3Service.TAILLE_MAX_OCTETS, 5 * 1024 * 1024);
  assert.deepStrictEqual(Object.keys(s3Service.TYPES_AUTORISES).sort(), ['image/jpeg', 'image/png']);
});
