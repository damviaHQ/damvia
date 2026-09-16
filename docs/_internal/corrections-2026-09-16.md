# Corrections de la documentation — 16 septembre 2026

La documentation reste destinée aux développeurs, administrateurs et exploitants. Les parcours des utilisateurs finaux sont réservés à une autre documentation. Les sections de partage, téléchargement et connexion conservées ici décrivent les contrats API, les droits et les conséquences opérationnelles.

## Changements effectués

- Correction du contenu des pages existantes : installation, configuration, sauvegardes, reprise des fichiers, limites de téléchargement, groupes, rôles, dates, tâches, emails, S3, OneDrive et Dropbox.
- Ajout de cinq pages : exploitation, recette de validation, comptes et liens, limites connues et état des vérifications.
- Correction du modèle d'environnement serveur : commentaires séparés compatibles avec `docker run --env-file`, chemin OneDrive `root`. Ajout de `server/.dockerignore`.
- Résolution du conflit apparu lors de l'arrivée du commit `f8eb687`, en conservant les couleurs hexadécimales sans `#` et les exemples dotenv entre guillemets.
- Vérification documentaire avec analyse YAML/Markdown, dates réelles, ordre des pages, liens sources, couverture des modèles d'environnement et des queues, détection des conflits non résolus. Dix tests de régression et workflow CI ajoutés.
- Dans le dépôt voisin `damvia-website` : moteur Markdown explicite pour Astro 7, transformation des liens depuis les fichiers sources, validation stricte du frontmatter, vérification des routes et ancres du HTML généré, workflow de build avec sous-module.

## Résultats

| Contrôle | Résultat |
|---|---|
| Sources documentaires | 51 pages publiques, 32 variables, 14 queues ; aucune erreur |
| Tests du contrôle documentaire | 10 réussis |
| Build avec les documents corrigés | 64 pages totales, dont 51 documents et la redirection ; 3 968 liens internes contrôlés, aucune route ni ancre cassée |
| Build du dépôt du site avec son sous-module actuel | Réussi ; 3 356 liens contrôlés sans erreur |
| Métadonnées invalides dans un vrai build Astro | `lastUpdated: true` et ordre non numérique refusés |
| TypeScript serveur | Réussi |
| Build Vite client | Réussi |
| TypeScript client | Échec préexistant : 7 erreurs de syntaxe dans `search.vue`, ligne 402 |

Les résultats structurés sont conservés dans [validation-apres-corrections.json](./audit-2026-09-16/validation-apres-corrections.json). Le rapport d'audit initial reste un état historique, antérieur à ces corrections.

## Portée et suites applicatives

Cette passe corrige la documentation et sa publication locale, pas les règles métier du serveur. Les défauts F04/F05/F06/F10/F11/F12/F18/F21/F24 et le runtime F17 sont désormais décrits sans garantie trompeuse dans les pages concernées et dans [les limites connues](../reference/known-limitations.md). Les corrections fonctionnelles, en particulier les défauts de contrôle d'accès, nécessitent leur propre modification du code et des tests de régression. Les règles effectives de licence, d'invitation et d'accès des invités sont décrites telles qu'elles existent.

Aucune connexion aux intégrations réelles, synchronisation distante, migration de base, restauration, émission d'email ou publication n'a été effectuée. Les procédures de recette et de restauration sont à exécuter sur une instance isolée ; elles ne sont pas présentées comme des essais déjà réussis. Le build local du site réussit avec Node 22.14, mais npm signale que la dépendance `undici` exige au moins 22.19 ; la CI utilise la version 22 maintenue.

Les modifications existent dans les deux dépôts. Le sous-module du site pointe encore sur sa version enregistrée : la publication des nouvelles pages demandera le commit des changements documentaires puis la mise à jour de cette référence. La copie de vérification a utilisé les documents actuels sans modifier ce sous-module. Aucun commit ni push n'a été créé par cette passe.

## Relecture pour la lisibilité

Après le retour sur la description de `DialogMemberDownloads.vue`, les explications concrètes de l'interface ont été rétablies : informations affichées, boutons disponibles, badge et moment où il change. Les formulations abstraites des pages d'accès, synchronisation, déploiement et exploitation ont aussi été réécrites pour expliquer d'abord le comportement et ses conséquences. Les noms des fonctions et champs restent présents lorsqu'ils permettent de vérifier l'explication. Cette règle est ajoutée au guide de rédaction.
