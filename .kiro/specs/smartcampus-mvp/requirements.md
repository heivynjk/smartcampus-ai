# Requirements Document

## Introduction

SmartCampus AI centralise la gestion des incidents d'un campus : les étudiants signalent et suivent leurs demandes, les techniciens les traitent, un assistant IA répond aux questions fréquentes, et l'administration pilote l'activité via un tableau de bord. Ce document couvre le MVP (6 user stories, US-01 à US-06), réalisable en environ 3 h de développement.

Statuts d'un ticket : **Ouvert**, **En cours**, **Résolu**. Rôles : `etudiant`, `technicien`, `admin`.

## Requirements

### Requirement 1 — Authentification et rôles (transverse)

**User Story:** En tant qu'utilisateur du campus, je veux me connecter avec mon compte afin d'accéder uniquement aux fonctions de mon rôle.

#### Acceptance Criteria

1. WHEN un utilisateur soumet un e-mail et un mot de passe valides THEN le système SHALL renvoyer un jeton JWT valable 8 h contenant son id, son nom et son rôle.
2. WHEN les identifiants sont invalides THEN le système SHALL répondre 401 avec le message « Identifiants invalides ».
3. WHEN une route `/api` protégée est appelée sans jeton valide THEN le système SHALL répondre 401.
4. WHEN un utilisateur appelle une route réservée à un autre rôle THEN le système SHALL répondre 403.
5. The système SHALL fournir 3 comptes de démo : Léa (etudiant), Karim (technicien), Sophie (admin), mot de passe `demo1234`.

### Requirement 2 — Signaler un incident (US-01, Must)

**User Story:** En tant qu'étudiante, je veux signaler un incident (salle fermée, matériel défectueux, problème réseau) depuis mon téléphone afin qu'il soit pris en charge sans que j'aie à chercher le bon interlocuteur.

#### Acceptance Criteria

1. WHEN une étudiante soumet catégorie, lieu et description THEN le système SHALL créer un ticket avec un numéro unique au format `INC-AAAA-NNNNN`, le statut « Ouvert », la date de création et l'auteur (RG-03).
2. IF la catégorie, le lieu ou la description est manquant THEN le système SHALL refuser la création (400) et le formulaire SHALL signaler le champ en rouge (RG-01).
3. WHEN une photo est jointe THEN le système SHALL accepter uniquement JPG ou PNG de 5 Mo maximum, la stocker dans S3 sous `photos/` et enregistrer sa clé (RG-02).
4. IF la photo n'est pas JPG/PNG ou dépasse 5 Mo THEN le système SHALL refuser avec un message explicite.
5. WHEN un ticket est créé THEN le système SHALL l'assigner au technicien référent de sa catégorie et lui donner la priorité par défaut de la catégorie (RG-04).
6. IF la catégorie est « Sécurité » THEN le système SHALL fixer la priorité à « Critique » (RG-05).
7. WHEN la création réussit THEN l'écran SHALL afficher le numéro du ticket et un lien vers son détail, et le ticket SHALL apparaître dans « Mes demandes ».
8. WHEN un ticket est créé THEN le système SHALL enregistrer une première ligne d'historique et une notification in-app « Votre signalement INC-… a bien été pris en compte ».

### Requirement 3 — Suivre sa demande (US-02, Must)

**User Story:** En tant qu'étudiante, je veux consulter le statut et l'historique de mes signalements afin de savoir où en est mon problème sans relancer l'administration.

#### Acceptance Criteria

1. WHEN une étudiante ouvre « Mes demandes » THEN le système SHALL lister uniquement ses tickets, du plus récent au plus ancien, avec numéro, catégorie, lieu, statut et date de mise à jour.
2. WHEN elle ouvre un ticket THEN le système SHALL afficher son détail, la photo (URL présignée) et l'historique horodaté dans l'ordre chronologique avec les commentaires.
3. IF une étudiante demande le ticket d'un autre étudiant THEN le système SHALL répondre 403 avec un message d'erreur (RG-06).
4. WHEN le statut d'un de ses tickets change THEN le système SHALL créer une notification in-app et l'en-tête SHALL afficher le nombre de notifications non lues.

### Requirement 4 — Traiter un incident (US-03, Must)

**User Story:** En tant que technicien, je veux voir les tickets qui me sont assignés et mettre à jour leur statut avec un commentaire afin d'organiser mon travail et d'informer l'étudiant.

#### Acceptance Criteria

1. WHEN un technicien ouvre « Ma file » THEN le système SHALL afficher les tickets qui lui sont assignés et non résolus, triés par priorité (Critique, Haute, Normale, Basse) puis par date de création croissante.
2. The système SHALL autoriser uniquement les transitions Ouvert → En cours et En cours → Résolu ; toute autre transition SHALL être refusée (RG-09).
3. IF le passage à « Résolu » n'a pas de commentaire THEN le système SHALL refuser la mise à jour (400) avec un message (RG-10).
4. IF l'utilisateur n'est ni le technicien assigné ni un admin THEN le système SHALL refuser la modification (403) (RG-07).
5. WHEN le statut change THEN le système SHALL enregistrer une ligne d'historique (acteur, ancien statut, nouveau statut, commentaire, date), mettre à jour `maj_le` (et `resolu_le` si Résolu), et notifier l'étudiant (RG-11).
6. WHEN un ticket est en retard (RG-08) THEN la file SHALL afficher un badge « En retard ».

### Requirement 5 — Interroger l'assistant IA (US-04, Must)

**User Story:** En tant qu'étudiante, je veux poser une question en langage naturel à un assistant IA (horaires, accès Wi-Fi, réservation de salle…) afin d'obtenir une réponse immédiate, même en dehors des heures d'ouverture.

#### Acceptance Criteria

1. WHEN une étudiante envoie une question THEN le système SHALL appeler Amazon Bedrock (Nova Lite, API Converse) avec un prompt système contenant les fiches FAQ de la base, et afficher la réponse en moins de 5 s.
2. WHEN la réponse vient de la FAQ THEN le système SHALL afficher le titre de la fiche source.
3. IF aucune fiche ne répond à la question THEN l'assistant SHALL répondre « Je ne sais pas » au lieu d'inventer, et proposer un signalement (RG-12).
4. The assistant SHALL répondre en français, en langage clair.
5. The système SHALL n'envoyer au modèle que la question et l'historique de la conversation en cours, sans nom ni e-mail de l'utilisateur.
6. While la session est ouverte, la conversation SHALL rester affichée (historique gardé côté navigateur, non stocké en base).
7. IF Bedrock est indisponible THEN le système SHALL afficher un message d'erreur et un lien vers le formulaire de signalement.

### Requirement 6 — Créer un ticket depuis l'assistant (US-05, Should)

**User Story:** En tant qu'étudiante, je veux que l'assistant me propose de créer un signalement pré-rempli quand il ne peut pas résoudre mon problème afin de ne pas tout ressaisir.

#### Acceptance Criteria

1. WHEN l'assistant détecte un incident ou n'a pas de réponse THEN le chat SHALL afficher un bouton « Créer un signalement ».
2. WHEN l'étudiante clique sur ce bouton THEN le formulaire de signalement SHALL s'ouvrir avec description, lieu et catégorie pré-remplis à partir de la réponse JSON de l'assistant.
3. IF la catégorie ou le lieu ne peut pas être déduit THEN le champ SHALL rester vide et obligatoire.
4. The système SHALL ne jamais créer de ticket sans validation explicite de l'étudiante (RG-13) ; le ticket créé porte `origine = 'assistant'`.

### Requirement 7 — Piloter le campus (US-06, Must)

**User Story:** En tant que responsable de campus, je veux visualiser les tendances des incidents dans un tableau de bord afin de prioriser les investissements et d'identifier les points noirs.

#### Acceptance Criteria

1. WHEN un admin ouvre le tableau de bord THEN le système SHALL afficher le nombre de tickets par catégorie, par lieu (top 5 bâtiments/salles) et par statut, et le délai moyen de résolution.
2. WHEN l'admin choisit la période semaine, mois ou semestre THEN tous les indicateurs SHALL être recalculés sur cette période.
3. The délai de résolution SHALL être calculé comme `resolu_le − cree_le` sur les tickets résolus uniquement, affiché en heures (RG-14).
4. IF la période ne contient aucun ticket THEN la page SHALL afficher « Aucun incident sur la période ».
5. IF un étudiant ou un technicien appelle les statistiques THEN le système SHALL répondre 403 (RG-15).
6. The tableau de bord SHALL n'afficher que des données agrégées, sans nom d'étudiant.

### Requirement 8 — Relance des tickets non pris en charge (RG-08)

**User Story:** En tant qu'étudiante, je veux être prévenue si mon ticket n'est pas pris en charge sous 24 h afin de savoir que la demande est en attente.

#### Acceptance Criteria

1. The système SHALL exécuter toutes les heures une tâche planifiée (node-cron) dans l'application.
2. WHEN un ticket est « Ouvert » depuis plus de 24 h et n'a pas encore été relancé THEN le système SHALL le marquer `en_retard = true` et créer une notification in-app pour l'étudiante.
3. The relance SHALL n'être envoyée qu'une seule fois par ticket.

### Requirement 9 — Exigences non fonctionnelles

#### Acceptance Criteria

1. The création et la mise à jour d'un ticket SHALL répondre en moins de 2 s ; la liste en moins de 2 s ; le tableau de bord en moins de 3 s.
2. The interface SHALL être utilisable sur mobile (largeur 375 px) sans défilement horizontal.
3. The application SHALL utiliser uniquement des requêtes SQL paramétrées.
4. The code SHALL ne contenir aucune clé AWS ; les droits viennent du rôle IAM de l'EC2.
5. The fichier `.env` SHALL être exclu de Git.
