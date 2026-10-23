-- Schéma SmartCampus AI (voir design.md).
-- Exécuté par db/init.js : les tables sont supprimées puis recréées.

CREATE TABLE utilisateur (
  id SERIAL PRIMARY KEY,
  nom TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  mot_de_passe_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('etudiant','technicien','admin'))
);

CREATE TABLE lieu (
  id SERIAL PRIMARY KEY,
  batiment TEXT NOT NULL,
  salle TEXT NOT NULL,
  UNIQUE (batiment, salle)
);

CREATE TABLE categorie (
  id SERIAL PRIMARY KEY,
  libelle TEXT UNIQUE NOT NULL,          -- Salle fermée, Matériel défectueux, Problème réseau, Sécurité, Autre
  priorite_defaut TEXT NOT NULL CHECK (priorite_defaut IN ('Critique','Haute','Normale','Basse')),
  technicien_referent_id INT REFERENCES utilisateur(id)
);

CREATE TABLE ticket (
  id SERIAL PRIMARY KEY,
  numero TEXT UNIQUE NOT NULL,            -- INC-2026-00001
  description TEXT NOT NULL,
  categorie_id INT NOT NULL REFERENCES categorie(id),
  lieu_id INT NOT NULL REFERENCES lieu(id),
  auteur_id INT NOT NULL REFERENCES utilisateur(id),
  technicien_id INT REFERENCES utilisateur(id),
  statut TEXT NOT NULL DEFAULT 'Ouvert' CHECK (statut IN ('Ouvert','En cours','Résolu')),
  priorite TEXT NOT NULL CHECK (priorite IN ('Critique','Haute','Normale','Basse')),
  photo_cle TEXT,
  origine TEXT NOT NULL DEFAULT 'formulaire' CHECK (origine IN ('formulaire','assistant')),
  en_retard BOOLEAN NOT NULL DEFAULT false,
  cree_le TIMESTAMPTZ NOT NULL DEFAULT now(),
  maj_le TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolu_le TIMESTAMPTZ
);
CREATE SEQUENCE ticket_numero_seq;

CREATE TABLE historique_ticket (
  id SERIAL PRIMARY KEY,
  ticket_id INT NOT NULL REFERENCES ticket(id) ON DELETE CASCADE,
  acteur_id INT NOT NULL REFERENCES utilisateur(id),
  ancien_statut TEXT,
  nouveau_statut TEXT NOT NULL,
  commentaire TEXT,
  cree_le TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE notification (
  id SERIAL PRIMARY KEY,
  utilisateur_id INT NOT NULL REFERENCES utilisateur(id),
  ticket_id INT REFERENCES ticket(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  lue BOOLEAN NOT NULL DEFAULT false,
  cree_le TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE faq (
  id SERIAL PRIMARY KEY,
  titre TEXT NOT NULL,
  contenu TEXT NOT NULL
);

CREATE INDEX idx_ticket_auteur ON ticket(auteur_id);
CREATE INDEX idx_ticket_tech_statut ON ticket(technicien_id, statut);
CREATE INDEX idx_ticket_cree ON ticket(cree_le);
