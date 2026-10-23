---
inclusion: always
---

# Stack technique — SmartCampus AI (MVP KISS)

## Principe
Réalisable en ~3 h de code. Une seule application Node.js qui sert le frontend **et** l'API. Pas de framework frontend à compiler, pas de Docker, pas de microservices.

## Architecture AWS
- **Amazon EC2** (t3.small, Amazon Linux 2023) : héberge l'application Node.js, port **80** en HTTP.
- **Amazon RDS PostgreSQL** (db.t4g.micro, accès public : Non) : seule l'EC2 y accède (sg-db ← sg-web, port 5432).
- **Amazon S3** (bucket privé) : photos des tickets, envoyées par l'API via le SDK.
- **Amazon Bedrock** (modèle **Amazon Nova Lite**, ID `us.amazon.nova-lite-v1:0`) : assistant IA, FAQ injectée dans le prompt. Claude est bloqué par la politique Marketplace du compte : ne pas l'utiliser.
- **Rôle IAM** attaché à l'EC2 : le SDK AWS récupère ses droits automatiquement. **Ne jamais mettre de clé AWS dans le code ni dans `.env`.**

## Stack applicative
- Node.js **20**, JavaScript (CommonJS), **Express 4**.
- Base : `pg` (node-postgres) avec un `Pool`, requêtes SQL paramétrées (`$1, $2…`) — **jamais** de concaténation de chaînes SQL.
- Pas d'ORM. Schéma dans `db/schema.sql`, données de démo dans `db/seed.sql`.
- Authentification : `jsonwebtoken` + `bcryptjs`, jeton dans l'en-tête `Authorization: Bearer <token>`, durée 8 h.
- Upload : `multer` en mémoire (limite 5 Mo, JPG/PNG uniquement), puis `@aws-sdk/client-s3` (`PutObjectCommand`) ; lecture par URL présignée (`@aws-sdk/s3-request-presigner`, 15 min).
- IA : `@aws-sdk/client-bedrock-runtime`, commande **`ConverseCommand`**.
- Tâche planifiée : `node-cron`.
- Configuration : `dotenv`, variables listées dans `.env.example`.
- Frontend : pages **HTML + JavaScript vanilla + CSS** dans `public/`, servies par `express.static`. Graphiques avec **Chart.js** (CDN). Interface **responsive mobile first**.
- Tests : `node --test` + `supertest`.
- Process manager en production : `pm2`.

## Variables d'environnement
```
PORT=80
DB_HOST=
DB_PORT=5432
DB_NAME=smartcampus
DB_USER=postgres
DB_PASSWORD=
AWS_REGION=us-east-1
S3_BUCKET=smartcampus-photos-gx-1234
BEDROCK_MODEL_ID=us.amazon.nova-lite-v1:0
JWT_SECRET=
```

## Conventions de code
- Routes API sous `/api/...`, réponses JSON, erreurs au format `{ "error": "message en français" }` avec le bon code HTTP (400 validation, 401 non authentifié, 403 interdit, 404 introuvable).
- Toute règle métier vit dans `src/services/` (testable sans HTTP), jamais dans les routes.
- Chaque fonction métier référence la règle qu'elle implémente en commentaire, ex. `// RG-10`.
- Contrôle d'accès systématique côté serveur (ne jamais faire confiance au frontend).
- Commandes : `npm start`, `npm test`, `npm run db:init` (exécute schema.sql puis seed.sql).

## Exigences non fonctionnelles
- Création / mise à jour de ticket < 2 s ; liste < 2 s ; tableau de bord < 3 s ; réponse assistant < 5 s.
- Aucune donnée personnelle envoyée au modèle en dehors de la question.
- Le tableau de bord n'affiche que des données agrégées, sans nom d'étudiant.
