---
inclusion: always
---

# Structure du projet

```
smartcampus/
├── package.json
├── .env.example
├── .gitignore                 # node_modules, .env
├── db/
│   ├── schema.sql             # tables + index
│   ├── seed.sql               # lieux, catégories, comptes démo, FAQ, tickets de démo
│   └── init.js                # npm run db:init
├── src/
│   ├── server.js              # démarre Express + cron
│   ├── app.js                 # middlewares, routes, static (exporté pour les tests)
│   ├── config.js              # lecture des variables d'environnement
│   ├── db.js                  # Pool pg
│   ├── middleware/
│   │   ├── auth.js            # vérifie le JWT, req.user = { id, role, nom }
│   │   └── requireRole.js     # requireRole('technicien', 'admin')
│   ├── routes/
│   │   ├── auth.js            # POST /api/auth/login
│   │   ├── referentiels.js    # GET  /api/referentiels
│   │   ├── tickets.js         # POST /api/tickets, GET /api/tickets/mes-tickets, GET /api/tickets/:id, PATCH /api/tickets/:id/statut
│   │   ├── technicien.js      # GET  /api/technicien/tickets
│   │   ├── notifications.js   # GET  /api/notifications, POST /api/notifications/:id/lue
│   │   ├── chat.js            # POST /api/chat
│   │   └── stats.js           # GET  /api/stats?periode=semaine|mois|semestre
│   └── services/
│       ├── ticketService.js   # création, transitions, historique, règles RG-01 à RG-11
│       ├── notificationService.js
│       ├── s3Service.js       # upload photo, URL présignée
│       ├── bedrockService.js  # prompt, appel Converse, parsing JSON
│       ├── statsService.js    # agrégations SQL
│       └── relanceJob.js      # node-cron, RG-08
├── public/
│   ├── index.html             # connexion
│   ├── signaler.html          # US-01 (+ pré-remplissage US-05 via query string)
│   ├── mes-demandes.html      # US-02 liste
│   ├── ticket.html            # US-02 détail + historique
│   ├── file.html              # US-03 file technicien
│   ├── chat.html              # US-04 / US-05
│   ├── dashboard.html         # US-06
│   ├── css/style.css
│   └── js/                    # api.js (fetch + jeton), un fichier par page
└── tests/
    ├── tickets.test.js
    ├── technicien.test.js
    ├── chat.test.js           # Bedrock mocké
    └── stats.test.js
```

## Règles
- Une page HTML par écran, un fichier JS par page, un `api.js` commun qui ajoute le jeton et redirige vers `index.html` sur 401.
- La barre de navigation affiche uniquement les liens autorisés pour le rôle connecté, et le compteur de notifications non lues.
- Les services ne connaissent pas Express (ils reçoivent des valeurs, renvoient des données ou lèvent une erreur métier `{ status, message }`).
