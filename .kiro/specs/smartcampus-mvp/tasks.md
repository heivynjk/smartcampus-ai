# Implementation Plan

Ordre imposé par la priorisation MVP : socle → US-01 → US-03 → US-02 → US-04 → US-06 → US-05. Chaque tâche doit laisser l'application démarrable.

- [x] 1. Initialiser le projet
  - Créer `package.json` (scripts `start`, `test`, `db:init`), installer express, pg, dotenv, jsonwebtoken, bcryptjs, multer, node-cron, @aws-sdk/client-s3, @aws-sdk/s3-request-presigner, @aws-sdk/client-bedrock-runtime ; en dev : supertest
  - Créer `.gitignore` (node_modules, .env), `.env.example`, `src/config.js`, `src/db.js`, `src/app.js` (express.json, static `public/`, middleware d'erreur), `src/server.js`
  - Route `GET /api/sante` → `{ ok: true }`
  - _Requirements: 9.3, 9.4, 9.5_

- [x] 2. Base de données et données de démo
  - Écrire `db/schema.sql` et `db/seed.sql` selon design.md (4 utilisateurs, 6 lieux, 5 catégories, 6 fiches FAQ, ~30 tickets répartis sur 4 mois avec historiques)
  - Écrire `db/init.js` : supprime et recrée les tables, hash `demo1234` avec bcrypt, insère le seed
  - _Requirements: 1.5, 7.1_

- [x] 3. Authentification et rôles
  - `POST /api/auth/login`, middleware `auth.js` (JWT 8 h) et `requireRole.js`
  - `GET /api/referentiels`
  - Frontend : `index.html` (connexion), `public/js/api.js`, `css/style.css`, barre de navigation selon le rôle, redirection après connexion (etudiant → mes-demandes, technicien → file, admin → dashboard)
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 4. US-01 — Signaler un incident
  - [x] 4.1 `ticketService.creerTicket` : validation (RG-01), numéro `INC-AAAA-NNNNN` via séquence (RG-03), assignation au référent et priorité de la catégorie (RG-04), Sécurité → Critique (RG-05), première ligne d'historique, notification « pris en compte »
    - _Requirements: 2.1, 2.2, 2.5, 2.6, 2.8_
  - [x] 4.2 `s3Service` + multer : JPG/PNG ≤ 5 Mo, upload `photos/`, erreurs en français
    - _Requirements: 2.3, 2.4_
  - [x] 4.3 `POST /api/tickets` (etudiant) + page `signaler.html` (champs obligatoires en rouge, écran de confirmation avec numéro et lien)
    - _Requirements: 2.2, 2.7_
  - [x] 4.4 Tests : création OK, champ manquant → 400, Sécurité → Critique
    - _Requirements: 2.1, 2.2, 2.6_

- [x] 5. US-03 — Traiter un incident
  - [x] 5.1 `ticketService.changerStatut` : transitions autorisées (RG-09), commentaire obligatoire pour Résolu (RG-10), contrôle technicien assigné ou admin (RG-07), historique + `maj_le` / `resolu_le` + notification étudiant (RG-11)
    - _Requirements: 4.2, 4.3, 4.4, 4.5_
  - [x] 5.2 `GET /api/technicien/tickets` (tri priorité puis date), `PATCH /api/tickets/:id/statut`, page `file.html` avec boutons « Prendre en charge » / « Résoudre » + champ commentaire, badge « En retard »
    - _Requirements: 4.1, 4.6_
  - [x] 5.3 Tests : tri de la file, Résolu sans commentaire → 400, transition Ouvert → Résolu refusée, autre technicien → 403
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] 6. US-02 — Suivre sa demande
  - [x] 6.1 `GET /api/tickets/mes-tickets`, `GET /api/tickets/:id` avec contrôle d'accès (RG-06), URL présignée de la photo, historique chronologique
    - _Requirements: 3.1, 3.2, 3.3_
  - [x] 6.2 `GET /api/notifications`, `POST /api/notifications/:id/lue`, compteur de non lues dans la barre de navigation (rafraîchi toutes les 30 s)
    - _Requirements: 3.4_
  - [x] 6.3 Pages `mes-demandes.html` et `ticket.html` (chronologie lisible sur mobile)
    - _Requirements: 3.1, 3.2_
  - [x] 6.4 Tests : liste filtrée sur l'auteur, ticket d'un autre étudiant → 403
    - _Requirements: 3.1, 3.3_

- [x] 7. US-04 — Interroger l'assistant IA
  - [x] 7.1 `bedrockService` : prompt système avec les fiches FAQ, `ConverseCommand` (Nova Lite), parsing JSON robuste, gestion d'erreur → 503
    - _Requirements: 5.1, 5.3, 5.4, 5.5, 5.7_
  - [x] 7.2 `POST /api/chat` (etudiant) renvoyant `reponse`, `source`, `proposerSignalement`, `prefill`
    - _Requirements: 5.1, 5.2, 5.3_
  - [x] 7.3 Page `chat.html` : bulles de conversation, historique de session côté navigateur, affichage de la fiche source, indicateur de chargement
    - _Requirements: 5.2, 5.6_
  - [x] 7.4 Tests avec Bedrock mocké : question couverte (source renseignée), hors périmètre → « Je ne sais pas » + proposerSignalement
    - _Requirements: 5.2, 5.3_

- [x] 8. US-06 — Piloter le campus
  - [x] 8.1 `statsService` : agrégats par catégorie, top 5 lieux, par statut, délai moyen en heures sur les résolus (RG-14), filtre semaine / mois / semestre
    - _Requirements: 7.1, 7.2, 7.3_
  - [x] 8.2 `GET /api/stats` (admin uniquement, RG-15) + page `dashboard.html` (Chart.js, sélecteur de période, message « Aucun incident sur la période »)
    - _Requirements: 7.2, 7.4, 7.5, 7.6_
  - [x] 8.3 Tests : étudiant → 403, calcul du délai moyen sur un jeu connu
    - _Requirements: 7.3, 7.5_

- [x] 9. US-05 — Créer un ticket depuis l'assistant (bonus)
  - Bouton « Créer un signalement » dans `chat.html` quand `proposerSignalement` est vrai, ouvrant `signaler.html?description=…&categorieId=…&lieuId=…&origine=assistant`
  - Pré-remplissage et champs non déduits laissés vides et obligatoires ; numéro du ticket affiché au retour
  - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [x] 10. Relance des tickets non pris en charge
  - `relanceJob.js` (node-cron toutes les heures, démarré dans `server.js`), fonction `relancer()` exportée, relance unique par ticket
  - _Requirements: 8.1, 8.2, 8.3_

- [~] 11. Déploiement sur l'EC2 et recette
  - Pousser sur GitHub, cloner sur l'EC2 dans `/opt/smartcampus/app`, copier `.env`, `npm ci`, `npm run db:init`, `pm2 start src/server.js --name smartcampus`, `pm2 save`
  - Dérouler le scénario de démo : Léa signale (B204, vidéoprojecteur) → Karim prend en charge puis résout → Léa voit l'historique → Léa pose une question Wi-Fi → Léa décrit une panne et crée le ticket depuis le chat → Sophie consulte le tableau de bord
  - _Requirements: 9.1, 9.2_
