---
inclusion: always
---

# Produit — SmartCampus AI

## Le besoin
Une école veut centraliser la gestion des incidents du campus. Aujourd'hui les demandes arrivent par mail, à l'oral ou sur post-it, les étudiants n'ont aucun retour et l'administration n'a aucune donnée consolidée.

SmartCampus AI permet :
1. aux étudiants de **signaler** un incident (salle fermée, matériel défectueux, problème réseau) depuis leur téléphone ;
2. de **suivre** leur demande (statut + historique) ;
3. d'**interroger un assistant IA** sur les questions fréquentes, et de basculer vers un signalement si l'IA ne suffit pas ;
4. à l'administration de **piloter** le campus via un tableau de bord.

## Personas
| Persona | Rôle applicatif | Besoin |
| --- | --- | --- |
| Léa, 20 ans, étudiante | `etudiant` | Signaler vite, savoir où en est sa demande |
| Karim, 38 ans, technicien | `technicien` | File de tickets claire, triée par priorité |
| Sophie, 45 ans, responsable vie de campus | `admin` | Indicateurs pour justifier budget et priorités |

## Périmètre MVP (6 user stories, 34 points)
| Ordre | US | Titre | Priorité |
| --- | --- | --- | --- |
| 1 | US-01 | Signaler un incident | Must |
| 2 | US-03 | Traiter un incident (technicien) | Must |
| 3 | US-02 | Suivre sa demande | Must |
| 4 | US-04 | Interroger l'assistant IA | Must |
| 5 | US-06 | Piloter le campus (tableau de bord) | Must |
| 6 | US-05 | Créer un ticket depuis l'assistant | Should (bonus) |

Le cycle complet **signalement → traitement → suivi** doit fonctionner avant de toucher à l'IA.

## Décisions de périmètre (MVP réduit, validées)
- Notifications **in-app uniquement** (pas d'e-mail : Amazon SES est hors MVP). Les requirements R3 des US-01/02/03 sont satisfaits par la notification in-app et l'historique visible dans « Mes demandes ».
- Authentification par **comptes de démo + JWT** (Cognito hors MVP).
- Pas d'alerte SNS : un incident de catégorie « Sécurité » passe en priorité **Critique** et en tête de file.
- Relance 24 h : tâche planifiée dans l'application (pas de Lambda).

## Hors périmètre
Application mobile native, SSO école, e-mails, multilingue, réouverture de ticket, statut « Rejeté », Bedrock Knowledge Bases.

## Langue
Toute l'interface et toutes les réponses de l'assistant sont **en français**.
