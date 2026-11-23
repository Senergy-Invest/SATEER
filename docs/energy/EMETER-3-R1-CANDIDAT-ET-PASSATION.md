# E-METER-3 R1 — Précontrôle indicatif de mission avant intégration

## Périmètre

Candidat uniquement sur `work/energy-mvp01`, SHA base `f7a5fbd7565183c6c3fc7c81e2476dedae63583c` ; tenant fictif `ENERGY_MVP01D_RECETTE` / `sateer_test`. Pas de migration ni de données métier créées à R1.

Le coordinateur A voit un encart de précontrôle sur une mission **`A_REVOIR`**. Le compte B conserve exclusivement son formulaire de soumission, sans acquisition de droit de revue. La décision du coordinateur reste dans E-PARTICIPATION-1 ; le nouveau module n'offre **aucune route d'écriture**.

## Architecture

- `energy/energy-meter-precheck-domain.js` réutilise strictement `signauxReleve` (E-METER-1C2) et `signauxProximite` (E-METER-1C3), sans formule de consommation, tarif ni seuil de hausse.
- `energy/energy-meter-precheck-store.js` : transaction **READ ONLY** puis **ROLLBACK** ; filtre par tenant, propriétaire, statut `A_REVOIR`, mission, **même registre et même compteur**, site et propriétaire ; relève antérieure la plus récente et éventuelle lecture canonique postérieure.
- `energy/energy-meter-precheck-http.js` : une seule route privée `GET /api/energy/precontrole/v1/missions/:missionId/apercu?tenant=...` protégée par session Core, rattachement au tenant et autorisation du propriétaire SQL.
- `server.js` : route montée seulement sur `sateer_test`, avec drapeaux Energy / EP1 existants et `SATEER_ENABLE_ENERGY_EMETER3_R1=1`.
- `public/energie-missions-releves.js` : rend l'encart **avant** les boutons du coordinateur, avec `textContent` ; en cas d'indisponibilité, affiche clairement qu'un contrôle manuel est nécessaire. Aucun POST ajouté.

## Interprétation

`INDEX_EN_BAISSE` et `INDEX_INCHANGE` utilisent les règles 1C2 ; observations rapprochées à 60 secondes via 1C3. Deux précautions complémentaires sans calcul : historique canonique non strictement antérieur, compteur devenu inactif. En l'absence de référence, afficher `REFERENCE_ABSENTE` (pas un statut « conforme »). Aucune hausse d'index ne prouve une consommation normale ou anormale. Les valeurs sont déclaratives non certifiées.

**Important :** ces contrôles sont un **avis en lecture seule** et non une validation transactionnelle finale. La décision humaine conserve l'autorité ; le moteur E-PARTICIPATION existant conserve ses vérifications de droits/compteur. Un changement concurrent de l'historique peut nécessiter une nouvelle lecture du précontrôle. Le traitement de production devra définir les cas de concurrence, les quotas et la pagination à grande échelle.

## Suite R2 obligatoire

1. Préflight, régressions de qualité/EP1/E-METER2/Core, test SQL lecture seule, tests HTTP véritables A/B sur une instance isolée.
2. Vérifier en compte A le précontrôle avant décision ; en B vérifier refus de l'API A ; conserver les dix relevés et les deux missions existantes tant qu'aucune nouvelle recette n'est explicitement autorisée.
3. Une éventuelle mission fictive supplémentaire et tout commit/push requièrent des autorisations distinctes, un rapport ZIP, un SHA distant explicitement vérifié. Jamais `git reset --hard`, `git clean`, `push --force` ni modification d'Ambassade/Bordeaux/Diaspora.
