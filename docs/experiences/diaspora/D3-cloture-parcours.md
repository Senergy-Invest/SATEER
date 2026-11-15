# Diaspora D3 — Clôture du parcours éditorial associatif

## Référence et indépendance

Parent strict : `93fe8870385069e6718c8382a67f95b482a4bab2` (`work/diaspora-mvp`).
Aucune modification du code des expériences Consulat, Ambassade, Energy, des rôles, des migrations ou du quota de notification.

## Contrat de création propre à Diaspora

`POST /api/organisations/:organisationId/diaspora/publications?tenant=CODE`.

- Compte authentifié `exigerSession`. L'auteur est `req.auth.personneId`, jamais un champ du client.
- Organisation source de type `ASSOCIATION`, active et rattachée au tenant ; permission **organisationnelle** `TARGET_COMMUNICATION` calculée via Core. Aucun privilège induit par la présence dans un menu.
- `Origin` vérifiée, refus d'autres champs, corps `{tenantCode,titre,contenu,categorie}` strict.
- Catégories : `EVENEMENT`, `FORMATION`, `EMPLOI`, `ENTREPRENEURIAT`, `CULTURE`, `COMMUNAUTE`.
- Création atomique via service générique `creerPublicationDatabase`, audience `TOUS`, priorité `NORMALE`, aucun canal/média ; état `NON_DEMANDEE`. La publication est textuelle et **invisible dans le fil Diaspora avant approbation**.
- Le ciblage géographique, l'option sponsorisée et la soumission appartiennent aux services D2B existants. Un agent Bureau seul habilité approuve ; notification opt-in envoyée à l'approbation, sous plafond 3/24h (sponsor 1/24h) et sans doublon.

## Interfaces

- `/diaspora-creer-publication.html` : création source avec la palette Diaspora, un thème du catalogue partagé, explication sur l'absence d'envoi à la création, raccourcis vers zone et soumission.
- `/diaspora-communication.html` : bouton « Rédiger une publication associative » visible uniquement si le GET source autorise l'accès et que l'organisation est une association. Dans la file Bureau, catégorie explicitement affichée.
- `/diaspora-zones-professionnelles.html` : le bouton « Déjà affectée : Bordeaux » désactivé lorsque la zone actuellement sélectionnée correspond à la zone de la publication. La zone est un ciblage des **notifications**, pas une attribution à l'association.

## Preuves et limites

Diagnostic en lecture seule sur `sateer_test` et cluster synthétique connu. Il compare le nombre de notifications des 24h **à l'instant d'approbation** de `FICTIF D2A MANUAL` et l'existence d'une alerte liée à cette publication ; refuse de conclure que l'absence est un quota si la preuve manque. Ne modifie pas le compteur.

E2E explicitement consenti : une nouvelle publication portant `FICTIF` et un identifiant aléatoire (un seul enregistrement idempotent), création via la route native, ciblage Bordeaux, soumission, approbation, fil général et fil suivi, permission citoyen refusée, catégorie consulaire refusée, verrouillage de zone, audit de transition. Une notification est exigée si le quota reste libre ou une absence vérifiée si quota déjà saturé. Aucun compte ni abonnement supplémentaire n'est créé.

Les trois comptes de recette sont lus exclusivement depuis le répertoire `~/.sateer-recette/diaspora-d2a-bureau`, mode 0600. Aucun identifiant ou mot de passe dans les logs ou l'archive de sortie.

## Recette manuelle

Écran de création SOURCE -> écran de ciblage -> soumission -> file BUREAU (catégorie/zone/source/sponsor) -> Mon SATEER et fil CITOYEN. Les preuves E2E sont automatisées, la **lisibilité et l'accès clavier sur 375 px** restent évalués par une personne. Aucun commit ou push avant validation visuelle terminal explicite.

## Critères d'arrêt

Échec preflight Git, divergence avec base, port indisponible, mauvaise DB, mauvais cluster, credential fixture absent ou trop permissif, contrôle HTTP, diagnostic quota non expliqué, test métier, non-régression, absence validation visuelle : **pas de commit/push**. Aucun force-push.
