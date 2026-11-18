# SATEER Energy — MVP02-A : recette persistante / clôture — lot B

**Branche :** `work/energy-mvp01`. **Parent vérifié :** `5b5d617f272fbfe0ccf3cf68d93c05c24e563494`.
**Rôle du lot B :** éprouver puis publier le **noyau privé** de l'inventaire du MVP02-A, sans prétendre avoir livré la contribution multi-utilisateur.

## Contrat livré

- Modèle stable `EnergyCase -> site inventaire -> bâtiments/étages/pièces/zones/extérieurs -> équipements déclarés`.
- Un site par dossier, propriétaire dérivé de `auth_sessions` via `exigerSession`. Même tenant Energy que le dossier.
- Hiérarchie et FKs composites interdisant les références à un autre site/propriétaire ; refus entre sessions A/B et avec tenant institutionnel.
- Données et puissance d'équipement sont **déclarées** et non vérifiées ; unités en W si puissance connue. Pas de calcul énergétique, de rapport d'audit, de partage institutionnel ou financier.
- Migration 051 versionnée : tables `energy_inventory_sites`, `energy_inventory_zones`, `energy_inventory_equipements`, `energy_inventory_events`, avec intégrité et événements d'inventaire, strictement sous `sateer_test`.
- Interface `/inventaire-energie.html?tenant=ENERGY_MVP01D_RECETTE&case=<EnergyCase-UUID>`, liée depuis `sunu-courant.html` ; l'API exige une vraie session Core.

## Recette et confidentialité

Le lanceur `SATEER-ENERGY-MVP02-B-RECETTE-CLOTURE/EXECUTER_MVP02_B.sh` :

1. Vérifie base SHA Git locale/distante, diff strict, fichiers exacts A et B ; ne touche pas aux autres worktrees.
2. Relance huit campagnes Energy, Core, P1, Ambassade, Diaspora et PG/HTTP avec rollback (identités de test).
3. Exige une **confirmation explicite** avant toute migration 051 persistante ; valide DB et cluster PostgreSQL épinglé.
4. Réutilise les **deux comptes fictifs MVP01-D**, sans en créer de nouveaux et sans copier leurs secrets dans Git ou dans le rapport.
5. Démarre une instance distincte en port `3473`, sans stopper `3472` ; requiert les flags Energy MVP01 et MVP02.
6. Vérifie sur serveur réel les cookies HttpOnly/Core Auth, propriétaire A/B, tenant, origine, site, zone, équipement, relecture, idempotence, révocation.
7. Ouvre le navigateur et attend la validation humaine **avant** commit/push.
8. Commit ciblé de l'inventaire et des preuves E2E, push normal et contrôle du SHA distant.

La campagne E2E produit uniquement des entités **synthétiques et déclaratives** dans le tenant Energy, qui restent dans `sateer_test` après exécution. Les mots de passe et cookies n'apparaissent pas dans les ZIP de diagnostic. Le script ne convient pas à la production.

## Statut et limites

- Si le rapport final inclut `MVP02_A_CLOTURE_GITHUB_SHA_IDENTIQUE` et `PUSH_ET_SHA=PASS_SHA_IDENTIQUE`, le noyau privé est livré en recette locale.
- **MVP02-B fonctionnel (participatif)** sera une tranche séparée : invitations bornées, consentement du contributeur, droits par ressource, provenance par auteur, revue/validation/rejet par le responsable, audit et révocation. Ne pas présenter cette capacité comme déjà livrée.
- **MVP02A — Passeport numérique équipement** : sera adossé aux lignes d'inventaire existantes, sans second registre d'identités ni déduction de certification depuis une déclaration.
- Vérifier le SHA distant et lire `docs/energy/INDEX-ACTIF-REV3.md`, `ROADMAP-MVP-REV3.md`, `MVP01-LIVRAISON-TESTEE.md` puis le présent document à la reprise Codex.
