# E-METER-1E1 — Remplacement de compteur : recette et clôture GitHub

Date de recette : **22 novembre 2026**. Périmètre : **SATEER Energy / SUNU Courant**, tenant et site **strictement fictifs**, base locale `sateer_test`.

## Fonctionnalité validée

- Un point de comptage reste inchangé. L'ancien compteur est conservé et désactivé ; un seul nouveau compteur devient actif.
- L'opération est atomique et idempotente, avec justification et confirmation explicite. L'horodatage de transition est fixé côté serveur.
- Aucun index n'est transféré au compteur de remplacement ; aucune consommation, économie, facture ou tarification n'est calculée.
- Le journal d'audit existant est conservé ; l'événement `MeterDeviceReplaced.v1` est autorisé via la migration additive `065_energy_meter_replacement.sql`.
- Les permissions Core et l'isolation tenant/site sont contrôlées ; la route n'est active que sur `sateer_test` avec le drapeau `SATEER_ENABLE_ENERGY_METER_1E1=1`.

## Preuves de recette R3D

- Rapport local source : `EMETER-1E1-R3D-tvvzcu4m-RESULTAT.zip`, empreinte SHA-256 `4e72f0101c2a87c8e70342bc65e5e713e46a9f073e489dca99a2a7cfdc2c7caf`. Rapport conservé hors dépôt dans `~/Documents/SATEER-RAPPORTS/`.
- Verdict du rapport : `R3D_REMPLACEMENT_FICTIF_VERIFIE_ATTENTE_CLOTURE_GITHUB` et contrôle PostgreSQL `REMPLACEMENT_CONFORME_PG`.
- Avant : 1 compteur actif, 1 registre, 8 relevés, 11 événements, aucun remplacement.
- Après : 2 compteurs au total, **1 seul actif**, 2 registres, **8 relevés inchangés**, 14 événements, **1 événement de remplacement**, 2 événements d'import CSV inchangés.
- Les 13 contrôles de cohérence PostgreSQL de R3D sont conformes, dont préservation de l'empreinte des huit relevés, du journal historique et des registres antérieurs, ainsi que 3 nouveaux événements d'audit sans réécriture.
- Recette navigateur : message « Compteur remplacé dans le registre de recette ; ancien compteur et relevés conservés. » ; compteur de remplacement fictif R3D actif, ancien compteur historisé.
- Tests du candidat : **33/33** tests E-METER-1E1, **56/56** tests E-METER-1D1, tests généraux et refus HTTP (session anonyme, tenant, origine étrangère, confirmation et clé d'idempotence).

## Limites, traçabilité et reprise

- Les données et les identités de la recette sont **fictives** : aucune intervention physique ni certification métrologique n'est revendiquée.
- Ne jamais rejouer le remplacement R3D : la transition fictive existe déjà en base.
- Le script de clôture R4 réexécute les tests, vérifie PostgreSQL en **lecture seule**, commit uniquement les **13 fichiers candidats E-METER-1E1** et la présente note ; push normal sur `work/energy-mvp01`, suivi de la vérification explicite du SHA distant.
- Le document non suivi `docs/energy/REFERENTIEL-REV2-EFFICACITE-PARTICIPATIVE.md` et tous les autres chantiers sont exclus du commit. Ne jamais utiliser `git clean`, `reset --hard` ni `push --force`.
- Pour poursuivre : conserver les contrats Core, droits par propriétaire/site et migration versionnée ; ne pas ouvrir un autre lot avant vérification GitHub.
