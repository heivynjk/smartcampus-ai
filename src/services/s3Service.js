// Service Photos : upload et lecture des photos de tickets sur S3.
//
// Aucune clé AWS dans le code : le S3Client utilise les droits du rôle IAM de
// l'EC2 (RG 9.4) ; seule la région vient de la configuration/environnement.
//
// Multer stocke le fichier en mémoire (memoryStorage) pour le relayer
// directement à S3 sans écriture sur disque. On accepte uniquement les images
// JPG/PNG de 5 Mo maximum (RG-02) ; les messages d'erreur sont en français.
const path = require('path');
const multer = require('multer');
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const config = require('../config');

// Taille maximale d'une photo : 5 Mo (RG-02 / exigence 2.3).
const TAILLE_MAX_OCTETS = 5 * 1024 * 1024;

// Types MIME autorisés et extension associée pour la clé S3.
const TYPES_AUTORISES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

// Client S3 : région depuis la config, aucune credential en dur (rôle IAM).
const s3 = new S3Client({ region: config.awsRegion });

/**
 * fileFilter multer : n'accepte que les images JPG et PNG.
 * En cas de type invalide, on rejette avec une erreur portant le code
 * `TYPE_INVALIDE`, convertie ensuite en message français (voir
 * `erreurUploadEnFrancais`). Le contrôle de taille est géré par `limits`.
 */
function fileFilter(req, file, cb) {
  if (TYPES_AUTORISES[file.mimetype]) {
    cb(null, true);
    return;
  }
  const erreur = new Error('Type de fichier non autorisé.');
  erreur.code = 'TYPE_INVALIDE';
  cb(erreur, false);
}

// Middleware multer configuré : un seul fichier sous le champ `photo`.
// Exposé pour être branché sur la route POST /api/tickets (tâche 4.3).
const uploadPhoto = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: TAILLE_MAX_OCTETS },
  fileFilter,
}).single('photo');

/**
 * Déduit l'extension de fichier à partir du type MIME, avec repli sur
 * l'extension du nom d'origine si besoin.
 * @param {{ mimetype:string, originalname?:string }} file
 * @returns {string} extension sans point (ex. 'jpg')
 */
function extensionDepuisType(file) {
  if (TYPES_AUTORISES[file.mimetype]) {
    return TYPES_AUTORISES[file.mimetype];
  }
  const ext = path.extname(file.originalname || '').replace('.', '').toLowerCase();
  return ext || 'jpg';
}

/**
 * Téléverse la photo d'un ticket sur S3 sous `photos/<numero>-<timestamp>.<ext>`.
 *
 * @param {string} numero  Numéro du ticket (ex. `INC-2026-00001`), sert de préfixe de clé.
 * @param {{ buffer:Buffer, mimetype:string, originalname?:string }} file  Fichier multer (memoryStorage).
 * @returns {Promise<string>} La clé S3 enregistrée en base (`ticket.photo_cle`).
 */
async function televerserPhoto(numero, file) {
  if (!file || !file.buffer) {
    throw { status: 400, message: 'Aucune photo à téléverser.' };
  }

  const extension = extensionDepuisType(file);
  const cle = `photos/${numero}-${Date.now()}.${extension}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: config.s3Bucket,
      Key: cle,
      Body: file.buffer,
      ContentType: file.mimetype,
    })
  );

  return cle;
}

/**
 * Génère une URL présignée (valable 15 min) pour lire une photo stockée sur S3.
 * Utilisée au détail du ticket (tâche 6.1) pour afficher la photo sans rendre
 * le bucket public.
 *
 * @param {string} cle  Clé S3 enregistrée (`ticket.photo_cle`).
 * @returns {Promise<string|null>} URL présignée, ou `null` si aucune clé.
 */
async function urlPresignee(cle) {
  if (!cle) {
    return null;
  }
  const commande = new GetObjectCommand({ Bucket: config.s3Bucket, Key: cle });
  return getSignedUrl(s3, commande, { expiresIn: 900 });
}

/**
 * Convertit une erreur multer (taille/type) en erreur métier française
 * `{ status: 400, message }`. À utiliser dans le gestionnaire du middleware
 * `uploadPhoto` sur la route POST /api/tickets (tâche 4.3) :
 *
 *   uploadPhoto(req, res, (err) => {
 *     if (err) return next(erreurUploadEnFrancais(err));
 *     ... // suite du traitement
 *   });
 *
 * Renvoie `null` si l'erreur n'est pas une erreur d'upload reconnue
 * (l'appelant peut alors la propager telle quelle).
 *
 * @param {Error & { code?:string }} err  Erreur remontée par multer.
 * @returns {{ status:number, message:string }|null}
 */
function erreurUploadEnFrancais(err) {
  if (!err) {
    return null;
  }
  // Dépassement de taille : multer lève une MulterError de code LIMIT_FILE_SIZE.
  if (err.code === 'LIMIT_FILE_SIZE') {
    return { status: 400, message: 'La photo dépasse la taille maximale autorisée de 5 Mo.' };
  }
  // Type non autorisé : rejet émis par notre fileFilter.
  if (err.code === 'TYPE_INVALIDE') {
    return { status: 400, message: 'Format de photo invalide : seuls les fichiers JPG et PNG sont acceptés.' };
  }
  return null;
}

module.exports = {
  uploadPhoto,
  televerserPhoto,
  urlPresignee,
  erreurUploadEnFrancais,
  // Exposés pour les tests et une éventuelle réutilisation.
  TAILLE_MAX_OCTETS,
  TYPES_AUTORISES,
};
