-- Données de démo SmartCampus AI (voir design.md).
-- NB : les utilisateurs sont insérés par db/init.js (mot de passe demo1234 hashé
-- avec bcrypt au moment de l'exécution). Ce fichier suppose que les 4 comptes
-- existent déjà dans l'ordre : 1 = Léa, 2 = Karim, 3 = Sophie, 4 = Tom.

-- ---------------------------------------------------------------------------
-- Lieux : bâtiments A et B
-- ---------------------------------------------------------------------------
INSERT INTO lieu (batiment, salle) VALUES
  ('A', 'A12'),            -- id 1
  ('A', 'A14'),            -- id 2
  ('B', 'B204'),           -- id 3
  ('B', 'B210'),           -- id 4
  ('A', 'Amphi A'),        -- id 5
  ('A', 'Bibliothèque');   -- id 6

-- ---------------------------------------------------------------------------
-- Catégories : Karim (id 2) référent de toutes
-- ---------------------------------------------------------------------------
INSERT INTO categorie (libelle, priorite_defaut, technicien_referent_id) VALUES
  ('Salle fermée', 'Normale', 2),           -- id 1
  ('Matériel défectueux', 'Normale', 2),    -- id 2
  ('Problème réseau', 'Haute', 2),          -- id 3
  ('Sécurité', 'Critique', 2),              -- id 4
  ('Autre', 'Basse', 2);                    -- id 5

-- ---------------------------------------------------------------------------
-- FAQ (6 fiches)
-- ---------------------------------------------------------------------------
INSERT INTO faq (titre, contenu) VALUES
  ('Connexion au Wi-Fi',
   'Le réseau Wi-Fi du campus s''appelle « SmartCampus ». Connectez-vous avec vos identifiants habituels (e-mail du campus et mot de passe). En cas d''échec, oubliez le réseau puis reconnectez-vous. Le réseau « SmartCampus-Invite » est réservé aux visiteurs.'),
  ('Horaires d''ouverture',
   'Les bâtiments A et B sont ouverts du lundi au vendredi de 7 h 30 à 21 h, et le samedi de 8 h à 18 h. La bibliothèque ferme à 22 h en semaine. Les bâtiments sont fermés les dimanches et jours fériés.'),
  ('Réservation de salle',
   'Les salles se réservent depuis l''intranet, rubrique « Réservations ». Une réservation peut être posée jusqu''à 14 jours à l''avance pour une durée maximale de 3 heures. Les amphis sont réservés aux enseignants.'),
  ('Impression',
   'Les imprimantes libre-service se trouvent à la bibliothèque et au rez-de-chaussée du bâtiment A. Chaque étudiant dispose d''un quota de 200 pages par semestre. Le rechargement du quota se fait au secrétariat.'),
  ('Mot de passe oublié',
   'En cas de mot de passe oublié, utilisez le lien « Mot de passe oublié » sur la page de connexion de l''intranet. Un e-mail de réinitialisation est envoyé sur votre adresse du campus. Si vous n''y avez plus accès, contactez le secrétariat.'),
  ('Objets perdus',
   'Les objets trouvés sont déposés à l''accueil du bâtiment A. Ils y sont conservés 30 jours. Présentez-vous avec votre carte étudiante pour récupérer un objet.');

-- ---------------------------------------------------------------------------
-- Tickets (~30) répartis sur les 4 derniers mois.
-- Les numéros utilisent ticket_numero_seq et l'année de création.
-- auteurs : Léa (1) et Tom (4) ; technicien assigné : Karim (2).
-- Les lignes d'historique sont ajoutées juste après chaque ticket.
-- ---------------------------------------------------------------------------

-- Résolus (délai mesurable pour le tableau de bord) -------------------------
INSERT INTO ticket (numero, description, categorie_id, lieu_id, auteur_id, technicien_id, statut, priorite, origine, cree_le, maj_le, resolu_le)
VALUES ('INC-' || to_char(now() - interval '115 days', 'YYYY') || '-' || lpad(nextval('ticket_numero_seq')::text, 5, '0'),
        'Vidéoprojecteur de la salle B204 qui ne s''allume plus.', 2, 3, 1, 2, 'Résolu', 'Normale', 'formulaire',
        now() - interval '115 days', now() - interval '113 days', now() - interval '113 days');
INSERT INTO historique_ticket (ticket_id, acteur_id, ancien_statut, nouveau_statut, commentaire, cree_le) VALUES
  (currval('ticket_id_seq'), 1, NULL, 'Ouvert', 'Signalement créé.', now() - interval '115 days'),
  (currval('ticket_id_seq'), 2, 'Ouvert', 'En cours', 'Diagnostic en cours.', now() - interval '114 days'),
  (currval('ticket_id_seq'), 2, 'En cours', 'Résolu', 'Câble HDMI remplacé, test OK.', now() - interval '113 days');

INSERT INTO ticket (numero, description, categorie_id, lieu_id, auteur_id, technicien_id, statut, priorite, origine, cree_le, maj_le, resolu_le)
VALUES ('INC-' || to_char(now() - interval '108 days', 'YYYY') || '-' || lpad(nextval('ticket_numero_seq')::text, 5, '0'),
        'Prise électrique arrachée au fond de la salle A12.', 2, 1, 4, 2, 'Résolu', 'Normale', 'formulaire',
        now() - interval '108 days', now() - interval '105 days', now() - interval '105 days');
INSERT INTO historique_ticket (ticket_id, acteur_id, ancien_statut, nouveau_statut, commentaire, cree_le) VALUES
  (currval('ticket_id_seq'), 4, NULL, 'Ouvert', 'Signalement créé.', now() - interval '108 days'),
  (currval('ticket_id_seq'), 2, 'Ouvert', 'En cours', 'Intervention planifiée.', now() - interval '107 days'),
  (currval('ticket_id_seq'), 2, 'En cours', 'Résolu', 'Prise remplacée et sécurisée.', now() - interval '105 days');

INSERT INTO ticket (numero, description, categorie_id, lieu_id, auteur_id, technicien_id, statut, priorite, origine, cree_le, maj_le, resolu_le)
VALUES ('INC-' || to_char(now() - interval '100 days', 'YYYY') || '-' || lpad(nextval('ticket_numero_seq')::text, 5, '0'),
        'Wi-Fi très lent dans l''amphi A pendant les cours.', 3, 5, 1, 2, 'Résolu', 'Haute', 'formulaire',
        now() - interval '100 days', now() - interval '98 days', now() - interval '98 days');
INSERT INTO historique_ticket (ticket_id, acteur_id, ancien_statut, nouveau_statut, commentaire, cree_le) VALUES
  (currval('ticket_id_seq'), 1, NULL, 'Ouvert', 'Signalement créé.', now() - interval '100 days'),
  (currval('ticket_id_seq'), 2, 'Ouvert', 'En cours', 'Vérification de la borne.', now() - interval '99 days'),
  (currval('ticket_id_seq'), 2, 'En cours', 'Résolu', 'Borne Wi-Fi redémarrée et firmware mis à jour.', now() - interval '98 days');

INSERT INTO ticket (numero, description, categorie_id, lieu_id, auteur_id, technicien_id, statut, priorite, origine, cree_le, maj_le, resolu_le)
VALUES ('INC-' || to_char(now() - interval '95 days', 'YYYY') || '-' || lpad(nextval('ticket_numero_seq')::text, 5, '0'),
        'Store cassé dans la salle B210, impossible de le baisser.', 5, 4, 4, 2, 'Résolu', 'Basse', 'formulaire',
        now() - interval '95 days', now() - interval '90 days', now() - interval '90 days');
INSERT INTO historique_ticket (ticket_id, acteur_id, ancien_statut, nouveau_statut, commentaire, cree_le) VALUES
  (currval('ticket_id_seq'), 4, NULL, 'Ouvert', 'Signalement créé.', now() - interval '95 days'),
  (currval('ticket_id_seq'), 2, 'Ouvert', 'En cours', 'Pièce commandée.', now() - interval '93 days'),
  (currval('ticket_id_seq'), 2, 'En cours', 'Résolu', 'Mécanisme du store remplacé.', now() - interval '90 days');

INSERT INTO ticket (numero, description, categorie_id, lieu_id, auteur_id, technicien_id, statut, priorite, origine, cree_le, maj_le, resolu_le)
VALUES ('INC-' || to_char(now() - interval '88 days', 'YYYY') || '-' || lpad(nextval('ticket_numero_seq')::text, 5, '0'),
        'Porte de secours de la bibliothèque qui ne se ferme pas.', 4, 6, 1, 2, 'Résolu', 'Critique', 'formulaire',
        now() - interval '88 days', now() - interval '88 days', now() - interval '88 days');
INSERT INTO historique_ticket (ticket_id, acteur_id, ancien_statut, nouveau_statut, commentaire, cree_le) VALUES
  (currval('ticket_id_seq'), 1, NULL, 'Ouvert', 'Signalement créé.', now() - interval '88 days'),
  (currval('ticket_id_seq'), 2, 'Ouvert', 'En cours', 'Intervention immédiate (sécurité).', now() - interval '88 days' + interval '1 hour'),
  (currval('ticket_id_seq'), 2, 'En cours', 'Résolu', 'Gâche réparée, porte testée.', now() - interval '88 days' + interval '3 hours');

INSERT INTO ticket (numero, description, categorie_id, lieu_id, auteur_id, technicien_id, statut, priorite, origine, cree_le, maj_le, resolu_le)
VALUES ('INC-' || to_char(now() - interval '80 days', 'YYYY') || '-' || lpad(nextval('ticket_numero_seq')::text, 5, '0'),
        'Imprimante de la bibliothèque en panne de toner.', 2, 6, 4, 2, 'Résolu', 'Normale', 'formulaire',
        now() - interval '80 days', now() - interval '79 days', now() - interval '79 days');
INSERT INTO historique_ticket (ticket_id, acteur_id, ancien_statut, nouveau_statut, commentaire, cree_le) VALUES
  (currval('ticket_id_seq'), 4, NULL, 'Ouvert', 'Signalement créé.', now() - interval '80 days'),
  (currval('ticket_id_seq'), 2, 'Ouvert', 'En cours', 'Toner disponible en stock.', now() - interval '79 days' - interval '2 hours'),
  (currval('ticket_id_seq'), 2, 'En cours', 'Résolu', 'Toner remplacé.', now() - interval '79 days');

INSERT INTO ticket (numero, description, categorie_id, lieu_id, auteur_id, technicien_id, statut, priorite, origine, cree_le, maj_le, resolu_le)
VALUES ('INC-' || to_char(now() - interval '72 days', 'YYYY') || '-' || lpad(nextval('ticket_numero_seq')::text, 5, '0'),
        'Salle A14 fermée alors qu''un TD y est prévu.', 1, 2, 1, 2, 'Résolu', 'Normale', 'formulaire',
        now() - interval '72 days', now() - interval '72 days', now() - interval '72 days');
INSERT INTO historique_ticket (ticket_id, acteur_id, ancien_statut, nouveau_statut, commentaire, cree_le) VALUES
  (currval('ticket_id_seq'), 1, NULL, 'Ouvert', 'Signalement créé.', now() - interval '72 days'),
  (currval('ticket_id_seq'), 2, 'Ouvert', 'En cours', 'Recherche du responsable des clés.', now() - interval '72 days' + interval '30 minutes'),
  (currval('ticket_id_seq'), 2, 'En cours', 'Résolu', 'Salle ouverte par l''agent d''accueil.', now() - interval '72 days' + interval '2 hours');

INSERT INTO ticket (numero, description, categorie_id, lieu_id, auteur_id, technicien_id, statut, priorite, origine, cree_le, maj_le, resolu_le)
VALUES ('INC-' || to_char(now() - interval '60 days', 'YYYY') || '-' || lpad(nextval('ticket_numero_seq')::text, 5, '0'),
        'Coupure réseau totale dans le bâtiment B.', 3, 3, 4, 2, 'Résolu', 'Haute', 'formulaire',
        now() - interval '60 days', now() - interval '59 days', now() - interval '59 days');
INSERT INTO historique_ticket (ticket_id, acteur_id, ancien_statut, nouveau_statut, commentaire, cree_le) VALUES
  (currval('ticket_id_seq'), 4, NULL, 'Ouvert', 'Signalement créé.', now() - interval '60 days'),
  (currval('ticket_id_seq'), 2, 'Ouvert', 'En cours', 'Switch principal en cause.', now() - interval '60 days' + interval '1 hour'),
  (currval('ticket_id_seq'), 2, 'En cours', 'Résolu', 'Switch redémarré, liaison rétablie.', now() - interval '59 days');

INSERT INTO ticket (numero, description, categorie_id, lieu_id, auteur_id, technicien_id, statut, priorite, origine, cree_le, maj_le, resolu_le)
VALUES ('INC-' || to_char(now() - interval '52 days', 'YYYY') || '-' || lpad(nextval('ticket_numero_seq')::text, 5, '0'),
        'Chaise cassée dans l''amphi A, risque de chute.', 2, 5, 1, 2, 'Résolu', 'Normale', 'assistant',
        now() - interval '52 days', now() - interval '50 days', now() - interval '50 days');
INSERT INTO historique_ticket (ticket_id, acteur_id, ancien_statut, nouveau_statut, commentaire, cree_le) VALUES
  (currval('ticket_id_seq'), 1, NULL, 'Ouvert', 'Signalement créé depuis l''assistant.', now() - interval '52 days'),
  (currval('ticket_id_seq'), 2, 'Ouvert', 'En cours', 'Chaise retirée.', now() - interval '51 days'),
  (currval('ticket_id_seq'), 2, 'En cours', 'Résolu', 'Chaise remplacée.', now() - interval '50 days');

INSERT INTO ticket (numero, description, categorie_id, lieu_id, auteur_id, technicien_id, statut, priorite, origine, cree_le, maj_le, resolu_le)
VALUES ('INC-' || to_char(now() - interval '40 days', 'YYYY') || '-' || lpad(nextval('ticket_numero_seq')::text, 5, '0'),
        'Fuite d''eau sous l''évier de la salle A12.', 5, 1, 4, 2, 'Résolu', 'Basse', 'formulaire',
        now() - interval '40 days', now() - interval '37 days', now() - interval '37 days');
INSERT INTO historique_ticket (ticket_id, acteur_id, ancien_statut, nouveau_statut, commentaire, cree_le) VALUES
  (currval('ticket_id_seq'), 4, NULL, 'Ouvert', 'Signalement créé.', now() - interval '40 days'),
  (currval('ticket_id_seq'), 2, 'Ouvert', 'En cours', 'Plombier prévenu.', now() - interval '39 days'),
  (currval('ticket_id_seq'), 2, 'En cours', 'Résolu', 'Joint remplacé, plus de fuite.', now() - interval '37 days');

-- En cours (prise en charge, non résolus) -----------------------------------
INSERT INTO ticket (numero, description, categorie_id, lieu_id, auteur_id, technicien_id, statut, priorite, origine, cree_le, maj_le)
VALUES ('INC-' || to_char(now() - interval '34 days', 'YYYY') || '-' || lpad(nextval('ticket_numero_seq')::text, 5, '0'),
        'Tableau interactif de la B210 qui ne répond pas au stylet.', 2, 4, 1, 2, 'En cours', 'Normale', 'formulaire',
        now() - interval '34 days', now() - interval '33 days');
INSERT INTO historique_ticket (ticket_id, acteur_id, ancien_statut, nouveau_statut, commentaire, cree_le) VALUES
  (currval('ticket_id_seq'), 1, NULL, 'Ouvert', 'Signalement créé.', now() - interval '34 days'),
  (currval('ticket_id_seq'), 2, 'Ouvert', 'En cours', 'Pilote en cours de réinstallation.', now() - interval '33 days');

INSERT INTO ticket (numero, description, categorie_id, lieu_id, auteur_id, technicien_id, statut, priorite, origine, cree_le, maj_le)
VALUES ('INC-' || to_char(now() - interval '28 days', 'YYYY') || '-' || lpad(nextval('ticket_numero_seq')::text, 5, '0'),
        'Connexion réseau instable à la bibliothèque.', 3, 6, 4, 2, 'En cours', 'Haute', 'formulaire',
        now() - interval '28 days', now() - interval '27 days');
INSERT INTO historique_ticket (ticket_id, acteur_id, ancien_statut, nouveau_statut, commentaire, cree_le) VALUES
  (currval('ticket_id_seq'), 4, NULL, 'Ouvert', 'Signalement créé.', now() - interval '28 days'),
  (currval('ticket_id_seq'), 2, 'Ouvert', 'En cours', 'Analyse du câblage en cours.', now() - interval '27 days');

INSERT INTO ticket (numero, description, categorie_id, lieu_id, auteur_id, technicien_id, statut, priorite, origine, cree_le, maj_le)
VALUES ('INC-' || to_char(now() - interval '21 days', 'YYYY') || '-' || lpad(nextval('ticket_numero_seq')::text, 5, '0'),
        'Serrure de la salle A14 difficile à ouvrir.', 1, 2, 1, 2, 'En cours', 'Normale', 'formulaire',
        now() - interval '21 days', now() - interval '20 days');
INSERT INTO historique_ticket (ticket_id, acteur_id, ancien_statut, nouveau_statut, commentaire, cree_le) VALUES
  (currval('ticket_id_seq'), 1, NULL, 'Ouvert', 'Signalement créé.', now() - interval '21 days'),
  (currval('ticket_id_seq'), 2, 'Ouvert', 'En cours', 'Lubrification prévue.', now() - interval '20 days');

INSERT INTO ticket (numero, description, categorie_id, lieu_id, auteur_id, technicien_id, statut, priorite, origine, cree_le, maj_le)
VALUES ('INC-' || to_char(now() - interval '15 days', 'YYYY') || '-' || lpad(nextval('ticket_numero_seq')::text, 5, '0'),
        'Issue de secours du bâtiment A mal signalée.', 4, 1, 4, 2, 'En cours', 'Critique', 'formulaire',
        now() - interval '15 days', now() - interval '14 days');
INSERT INTO historique_ticket (ticket_id, acteur_id, ancien_statut, nouveau_statut, commentaire, cree_le) VALUES
  (currval('ticket_id_seq'), 4, NULL, 'Ouvert', 'Signalement créé.', now() - interval '15 days'),
  (currval('ticket_id_seq'), 2, 'Ouvert', 'En cours', 'Commande d''un nouveau panneau.', now() - interval '14 days');

INSERT INTO ticket (numero, description, categorie_id, lieu_id, auteur_id, technicien_id, statut, priorite, origine, cree_le, maj_le)
VALUES ('INC-' || to_char(now() - interval '10 days', 'YYYY') || '-' || lpad(nextval('ticket_numero_seq')::text, 5, '0'),
        'Micro de l''amphi A qui grésille.', 2, 5, 1, 2, 'En cours', 'Normale', 'formulaire',
        now() - interval '10 days', now() - interval '9 days');
INSERT INTO historique_ticket (ticket_id, acteur_id, ancien_statut, nouveau_statut, commentaire, cree_le) VALUES
  (currval('ticket_id_seq'), 1, NULL, 'Ouvert', 'Signalement créé.', now() - interval '10 days'),
  (currval('ticket_id_seq'), 2, 'Ouvert', 'En cours', 'Test du micro de rechange.', now() - interval '9 days');

INSERT INTO ticket (numero, description, categorie_id, lieu_id, auteur_id, technicien_id, statut, priorite, origine, cree_le, maj_le)
VALUES ('INC-' || to_char(now() - interval '6 days', 'YYYY') || '-' || lpad(nextval('ticket_numero_seq')::text, 5, '0'),
        'Ordinateur de la bibliothèque qui redémarre tout seul.', 2, 6, 4, 2, 'En cours', 'Normale', 'formulaire',
        now() - interval '6 days', now() - interval '5 days');
INSERT INTO historique_ticket (ticket_id, acteur_id, ancien_statut, nouveau_statut, commentaire, cree_le) VALUES
  (currval('ticket_id_seq'), 4, NULL, 'Ouvert', 'Signalement créé.', now() - interval '6 days'),
  (currval('ticket_id_seq'), 2, 'Ouvert', 'En cours', 'Diagnostic matériel lancé.', now() - interval '5 days');

-- Ouverts non en retard (récents) -------------------------------------------
INSERT INTO ticket (numero, description, categorie_id, lieu_id, auteur_id, technicien_id, statut, priorite, origine, cree_le, maj_le)
VALUES ('INC-' || to_char(now() - interval '5 days', 'YYYY') || '-' || lpad(nextval('ticket_numero_seq')::text, 5, '0'),
        'Néon qui clignote dans la salle B204.', 2, 3, 1, 2, 'Ouvert', 'Normale', 'formulaire',
        now() - interval '5 days', now() - interval '5 days');
INSERT INTO historique_ticket (ticket_id, acteur_id, ancien_statut, nouveau_statut, commentaire, cree_le) VALUES
  (currval('ticket_id_seq'), 1, NULL, 'Ouvert', 'Signalement créé.', now() - interval '5 days');

INSERT INTO ticket (numero, description, categorie_id, lieu_id, auteur_id, technicien_id, statut, priorite, origine, cree_le, maj_le)
VALUES ('INC-' || to_char(now() - interval '3 days', 'YYYY') || '-' || lpad(nextval('ticket_numero_seq')::text, 5, '0'),
        'Pas de connexion Wi-Fi dans la salle A12.', 3, 1, 4, 2, 'Ouvert', 'Haute', 'formulaire',
        now() - interval '3 days', now() - interval '3 days');
INSERT INTO historique_ticket (ticket_id, acteur_id, ancien_statut, nouveau_statut, commentaire, cree_le) VALUES
  (currval('ticket_id_seq'), 4, NULL, 'Ouvert', 'Signalement créé.', now() - interval '3 days');

INSERT INTO ticket (numero, description, categorie_id, lieu_id, auteur_id, technicien_id, statut, priorite, origine, cree_le, maj_le)
VALUES ('INC-' || to_char(now() - interval '2 days', 'YYYY') || '-' || lpad(nextval('ticket_numero_seq')::text, 5, '0'),
        'Salle B210 trouvée fermée ce matin.', 1, 4, 1, 2, 'Ouvert', 'Normale', 'assistant',
        now() - interval '2 days', now() - interval '2 days');
INSERT INTO historique_ticket (ticket_id, acteur_id, ancien_statut, nouveau_statut, commentaire, cree_le) VALUES
  (currval('ticket_id_seq'), 1, NULL, 'Ouvert', 'Signalement créé depuis l''assistant.', now() - interval '2 days');

INSERT INTO ticket (numero, description, categorie_id, lieu_id, auteur_id, technicien_id, statut, priorite, origine, cree_le, maj_le)
VALUES ('INC-' || to_char(now() - interval '1 days', 'YYYY') || '-' || lpad(nextval('ticket_numero_seq')::text, 5, '0'),
        'Fenêtre de l''amphi A qui ne se verrouille plus.', 4, 5, 4, 2, 'Ouvert', 'Critique', 'formulaire',
        now() - interval '1 days', now() - interval '1 days');
INSERT INTO historique_ticket (ticket_id, acteur_id, ancien_statut, nouveau_statut, commentaire, cree_le) VALUES
  (currval('ticket_id_seq'), 4, NULL, 'Ouvert', 'Signalement créé.', now() - interval '1 days');

INSERT INTO ticket (numero, description, categorie_id, lieu_id, auteur_id, technicien_id, statut, priorite, origine, cree_le, maj_le)
VALUES ('INC-' || to_char(now() - interval '6 hours', 'YYYY') || '-' || lpad(nextval('ticket_numero_seq')::text, 5, '0'),
        'Clavier défectueux sur un poste de la bibliothèque.', 2, 6, 1, 2, 'Ouvert', 'Normale', 'formulaire',
        now() - interval '6 hours', now() - interval '6 hours');
INSERT INTO historique_ticket (ticket_id, acteur_id, ancien_statut, nouveau_statut, commentaire, cree_le) VALUES
  (currval('ticket_id_seq'), 1, NULL, 'Ouvert', 'Signalement créé.', now() - interval '6 hours');

-- Ouverts EN RETARD (ouverts depuis plus de 24 h, déjà relancés) -------------
INSERT INTO ticket (numero, description, categorie_id, lieu_id, auteur_id, technicien_id, statut, priorite, origine, en_retard, cree_le, maj_le)
VALUES ('INC-' || to_char(now() - interval '48 days', 'YYYY') || '-' || lpad(nextval('ticket_numero_seq')::text, 5, '0'),
        'Projecteur de la salle A14 sans image.', 2, 2, 1, 2, 'Ouvert', 'Normale', 'formulaire', true,
        now() - interval '48 days', now() - interval '48 days');
INSERT INTO historique_ticket (ticket_id, acteur_id, ancien_statut, nouveau_statut, commentaire, cree_le) VALUES
  (currval('ticket_id_seq'), 1, NULL, 'Ouvert', 'Signalement créé.', now() - interval '48 days');
INSERT INTO notification (utilisateur_id, ticket_id, message, lue, cree_le) VALUES
  (1, currval('ticket_id_seq'), 'Votre signalement n''a pas encore été pris en charge.', false, now() - interval '47 days');

INSERT INTO ticket (numero, description, categorie_id, lieu_id, auteur_id, technicien_id, statut, priorite, origine, en_retard, cree_le, maj_le)
VALUES ('INC-' || to_char(now() - interval '25 days', 'YYYY') || '-' || lpad(nextval('ticket_numero_seq')::text, 5, '0'),
        'Débit internet très faible dans la salle B204.', 3, 3, 4, 2, 'Ouvert', 'Haute', 'formulaire', true,
        now() - interval '25 days', now() - interval '25 days');
INSERT INTO historique_ticket (ticket_id, acteur_id, ancien_statut, nouveau_statut, commentaire, cree_le) VALUES
  (currval('ticket_id_seq'), 4, NULL, 'Ouvert', 'Signalement créé.', now() - interval '25 days');
INSERT INTO notification (utilisateur_id, ticket_id, message, lue, cree_le) VALUES
  (4, currval('ticket_id_seq'), 'Votre signalement n''a pas encore été pris en charge.', false, now() - interval '24 days');

INSERT INTO ticket (numero, description, categorie_id, lieu_id, auteur_id, technicien_id, statut, priorite, origine, en_retard, cree_le, maj_le)
VALUES ('INC-' || to_char(now() - interval '12 days', 'YYYY') || '-' || lpad(nextval('ticket_numero_seq')::text, 5, '0'),
        'Serrure de l''issue de secours du bâtiment B bloquée.', 4, 4, 1, 2, 'Ouvert', 'Critique', 'formulaire', true,
        now() - interval '12 days', now() - interval '12 days');
INSERT INTO historique_ticket (ticket_id, acteur_id, ancien_statut, nouveau_statut, commentaire, cree_le) VALUES
  (currval('ticket_id_seq'), 1, NULL, 'Ouvert', 'Signalement créé.', now() - interval '12 days');
INSERT INTO notification (utilisateur_id, ticket_id, message, lue, cree_le) VALUES
  (1, currval('ticket_id_seq'), 'Votre signalement n''a pas encore été pris en charge.', false, now() - interval '11 days');

-- Quelques tickets supplémentaires pour étoffer les statistiques -------------
INSERT INTO ticket (numero, description, categorie_id, lieu_id, auteur_id, technicien_id, statut, priorite, origine, cree_le, maj_le, resolu_le)
VALUES ('INC-' || to_char(now() - interval '44 days', 'YYYY') || '-' || lpad(nextval('ticket_numero_seq')::text, 5, '0'),
        'Table bancale dans la salle A12.', 5, 1, 4, 2, 'Résolu', 'Basse', 'formulaire',
        now() - interval '44 days', now() - interval '42 days', now() - interval '42 days');
INSERT INTO historique_ticket (ticket_id, acteur_id, ancien_statut, nouveau_statut, commentaire, cree_le) VALUES
  (currval('ticket_id_seq'), 4, NULL, 'Ouvert', 'Signalement créé.', now() - interval '44 days'),
  (currval('ticket_id_seq'), 2, 'Ouvert', 'En cours', 'Vissage prévu.', now() - interval '43 days'),
  (currval('ticket_id_seq'), 2, 'En cours', 'Résolu', 'Table resserrée.', now() - interval '42 days');

INSERT INTO ticket (numero, description, categorie_id, lieu_id, auteur_id, technicien_id, statut, priorite, origine, cree_le, maj_le, resolu_le)
VALUES ('INC-' || to_char(now() - interval '66 days', 'YYYY') || '-' || lpad(nextval('ticket_numero_seq')::text, 5, '0'),
        'Projecteur de la bibliothèque trop sombre.', 2, 6, 1, 2, 'Résolu', 'Normale', 'formulaire',
        now() - interval '66 days', now() - interval '64 days', now() - interval '64 days');
INSERT INTO historique_ticket (ticket_id, acteur_id, ancien_statut, nouveau_statut, commentaire, cree_le) VALUES
  (currval('ticket_id_seq'), 1, NULL, 'Ouvert', 'Signalement créé.', now() - interval '66 days'),
  (currval('ticket_id_seq'), 2, 'Ouvert', 'En cours', 'Lampe commandée.', now() - interval '65 days'),
  (currval('ticket_id_seq'), 2, 'En cours', 'Résolu', 'Lampe du projecteur remplacée.', now() - interval '64 days');

INSERT INTO ticket (numero, description, categorie_id, lieu_id, auteur_id, technicien_id, statut, priorite, origine, cree_le, maj_le, resolu_le)
VALUES ('INC-' || to_char(now() - interval '19 days', 'YYYY') || '-' || lpad(nextval('ticket_numero_seq')::text, 5, '0'),
        'Prise réseau arrachée dans la salle B210.', 3, 4, 4, 2, 'Résolu', 'Haute', 'formulaire',
        now() - interval '19 days', now() - interval '18 days', now() - interval '18 days');
INSERT INTO historique_ticket (ticket_id, acteur_id, ancien_statut, nouveau_statut, commentaire, cree_le) VALUES
  (currval('ticket_id_seq'), 4, NULL, 'Ouvert', 'Signalement créé.', now() - interval '19 days'),
  (currval('ticket_id_seq'), 2, 'Ouvert', 'En cours', 'Recâblage planifié.', now() - interval '18 days' - interval '3 hours'),
  (currval('ticket_id_seq'), 2, 'En cours', 'Résolu', 'Prise RJ45 remise en place.', now() - interval '18 days');

INSERT INTO ticket (numero, description, categorie_id, lieu_id, auteur_id, technicien_id, statut, priorite, origine, cree_le, maj_le)
VALUES ('INC-' || to_char(now() - interval '4 days', 'YYYY') || '-' || lpad(nextval('ticket_numero_seq')::text, 5, '0'),
        'Distributeur de boissons hors service près de l''amphi A.', 5, 5, 1, 2, 'Ouvert', 'Basse', 'formulaire',
        now() - interval '4 days', now() - interval '4 days');
INSERT INTO historique_ticket (ticket_id, acteur_id, ancien_statut, nouveau_statut, commentaire, cree_le) VALUES
  (currval('ticket_id_seq'), 1, NULL, 'Ouvert', 'Signalement créé.', now() - interval '4 days');

INSERT INTO ticket (numero, description, categorie_id, lieu_id, auteur_id, technicien_id, statut, priorite, origine, cree_le, maj_le)
VALUES ('INC-' || to_char(now() - interval '8 days', 'YYYY') || '-' || lpad(nextval('ticket_numero_seq')::text, 5, '0'),
        'Chauffage ne fonctionne pas dans la salle A14.', 5, 2, 4, 2, 'En cours', 'Basse', 'formulaire',
        now() - interval '8 days', now() - interval '7 days');
INSERT INTO historique_ticket (ticket_id, acteur_id, ancien_statut, nouveau_statut, commentaire, cree_le) VALUES
  (currval('ticket_id_seq'), 4, NULL, 'Ouvert', 'Signalement créé.', now() - interval '8 days'),
  (currval('ticket_id_seq'), 2, 'Ouvert', 'En cours', 'Vérification de la vanne.', now() - interval '7 days');

INSERT INTO ticket (numero, description, categorie_id, lieu_id, auteur_id, technicien_id, statut, priorite, origine, cree_le, maj_le, resolu_le)
VALUES ('INC-' || to_char(now() - interval '30 days', 'YYYY') || '-' || lpad(nextval('ticket_numero_seq')::text, 5, '0'),
        'Souris cassée sur un poste de la salle A12.', 2, 1, 1, 2, 'Résolu', 'Normale', 'formulaire',
        now() - interval '30 days', now() - interval '29 days', now() - interval '29 days');
INSERT INTO historique_ticket (ticket_id, acteur_id, ancien_statut, nouveau_statut, commentaire, cree_le) VALUES
  (currval('ticket_id_seq'), 1, NULL, 'Ouvert', 'Signalement créé.', now() - interval '30 days'),
  (currval('ticket_id_seq'), 2, 'Ouvert', 'En cours', 'Souris de rechange prête.', now() - interval '29 days' - interval '2 hours'),
  (currval('ticket_id_seq'), 2, 'En cours', 'Résolu', 'Souris remplacée.', now() - interval '29 days');

INSERT INTO ticket (numero, description, categorie_id, lieu_id, auteur_id, technicien_id, statut, priorite, origine, cree_le, maj_le)
VALUES ('INC-' || to_char(now() - interval '2 hours', 'YYYY') || '-' || lpad(nextval('ticket_numero_seq')::text, 5, '0'),
        'Fuite au plafond dans le couloir du bâtiment B.', 4, 3, 4, 2, 'Ouvert', 'Critique', 'formulaire',
        now() - interval '2 hours', now() - interval '2 hours');
INSERT INTO historique_ticket (ticket_id, acteur_id, ancien_statut, nouveau_statut, commentaire, cree_le) VALUES
  (currval('ticket_id_seq'), 4, NULL, 'Ouvert', 'Signalement créé.', now() - interval '2 hours');

-- Notifications « pris en compte » pour les deux tickets récents de Léa ------
INSERT INTO notification (utilisateur_id, ticket_id, message, lue, cree_le)
SELECT auteur_id, id, 'Votre signalement ' || numero || ' a bien été pris en compte.', true, cree_le
FROM ticket
WHERE statut = 'Résolu';
