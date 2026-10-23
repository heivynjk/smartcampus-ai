// Lecture centralisée des variables d'environnement (voir .env.example).
// Aucune clé AWS ici : les droits viennent du rôle IAM de l'EC2 (RG 9.4).
require('dotenv').config();

const config = {
  port: parseInt(process.env.PORT, 10) || 80,
  db: {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    database: process.env.DB_NAME || 'smartcampus',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
  },
  awsRegion: process.env.AWS_REGION || 'us-east-1',
  s3Bucket: process.env.S3_BUCKET,
  bedrockModelId: process.env.BEDROCK_MODEL_ID || 'us.amazon.nova-lite-v1:0',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-a-changer',
};

module.exports = config;
