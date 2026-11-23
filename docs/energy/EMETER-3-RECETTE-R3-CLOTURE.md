# SATEER Energy — E-METER-3 : précontrôle avant revue, clôture R3

Date UTC : 2026-11-23T18:27:52Z. Référence de base : `f7a5fbd7565183c6c3fc7c81e2476dedae63583c` sur `work/energy-mvp01`.
Recette strictement **fictive** : `sateer_test`, tenant `ENERGY_MVP01D_RECETTE`. Aucun usage en production ni certification métrologique.

## Fonction livrée

- Précontrôle GET en lecture seule d'une mission `A_REVOIR`, visible uniquement au coordinateur propriétaire authentifié. Contrôle serveur Core, tenant et périmètre précis.
- Comparaison avec les relevés canoniques du **même compteur et registre**, aux dates pertinentes, grâce aux règles existantes 1C2/1C3. Signaux indicatifs, sans consommation calculée.
- Encart avant les boutons métier dans `energie-missions-releves.html`. Le coordinateur demeure libre de sa décision ; le précontrôle ne modifie jamais les données canoniques.
- La décision est exécutée par le circuit existant E-PARTICIPATION-1, sans duplication des API de mutation ni création de tables.

## Preuves de recette

- R0B : audit PostgreSQL READ ONLY conforme et règles existantes validées.
- R1 : 23 tests du nouveau précontrôle + régressions, empreintes PG inchangées.
- R2C : deux comptes fictifs A/B ; A voit `INDEX_EN_BAISSE` en HTTP et dans l'interface, B reçoit HTTP 404, anonyme 401, tenant étranger 403.
- R2C : mission `c7866dc6-a6b0-4b18-976b-515bd48ff80f` créée une seule fois par A puis soumise par B avec l'index fictif `1.00 KWH`, sans relevé canonique supplémentaire.
- R3 : A a **refusé lui-même** cette mission après consultation de l'alerte ; mission `REFUSEE`, événement `MeterMissionRefused.v1`, et deux anciennes missions `INTEGREE` intactes.
- R3 : **10 relevés canoniques** et **16 événements E-METER** inchangés ; **3 missions EP1** (2 intégrées, 1 refusée) ; **10 événements EP1**, dont un seul nouvel événement de refus.
- Vérifications HTTP R3 : A voit l'aperçu avant refus, B ne peut pas décider, l'aperçu n'est plus accessible après refus ; autres rejets 401/403.
- Suite de tests : nouveau module R1, 1C2, 1C3, EP1, OCR, 1A, 1E1 et `npm test`.

## Gouvernance et limites

Le signal n'est ni une preuve d'erreur ni une instruction de refus automatique : remettre un compteur à zéro, le remplacer, ou corriger une saisie exige un examen humain. R3 a choisi le refus **uniquement pour la donnée synthétique volontairement incohérente**, pas comme règle générale.

La traçabilité EP1 enregistre le refus, mais l'écran actuel ne demande pas de motif de refus détaillé ; ce besoin peut faire l'objet d'un jalon ultérieur distinct. Gestion des fuseaux/dates, volumes, preuves photo, multi-index, droits institutionnels et OCR multi-plateforme sont hors de cette recette.

Pas de migration et aucun changement Bordeaux/Ambassade/Diaspora. Les scripts de recette et les identifiants fictifs privés restent hors du dépôt. Le fichier non suivi `docs/energy/REFERENTIEL-REV2-EFFICACITE-PARTICIPATIVE.md` est préservé.

Le commit et son SHA GitHub distant vérifié sont inscrits dans le rapport de clôture R3 (`~/Documents/SATEER-RAPPORTS/`).
