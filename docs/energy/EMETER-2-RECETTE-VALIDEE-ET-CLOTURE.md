# E-METER-2 — OCR d’index : recette et clôture contrôlées

Date de la recette : 23 novembre 2026. Périmètre **strictement fictif** sur `sateer_test`, tenant `ENERGY_MVP01D_RECETTE`. Aucune certification métrologique ni exploitation en production.

## Tranche livrée

- Le titulaire de la mission E-PARTICIPATION-1 `A_FAIRE` photographie l’afficheur **accessible sans danger** ; le navigateur assainit l’image en PNG.
- Apple Vision macOS propose un index par reconnaissance locale ; aucune photo ni sortie OCR brute n’est conservée par cette tranche.
- L’utilisateur vérifie visuellement puis choisit explicitement de reprendre l’index dans le formulaire. La soumission humaine fait passer la mission à `A_REVOIR`, sans nouveau relevé canonique.
- Le coordinateur propriétaire décide ensuite de l’intégration ; le registre canonique conserve `DECLARE_A_VERIFIER` et `SAISIE_MANUELLE`. Il ne s’agit ni de mesure certifiée ni de consommation calculée.
- Les accès Core / tenant / site / C1 et les compteurs remplacés sont vérifiés côté serveur, avant et après OCR.
- Pas de migration ou de second registre ; la nouvelle API est désactivée hors recette et réutilise l’adaptateur Apple Vision existant.

## Recette R0, R1, R2 et R3

- R0 : audit read-only conforme sur macOS ; moteur local Vision disponible.
- R1 : 23/23 tests isolés, reconnaissance synthétique `12345.67 KWH`, 9 relevés historiques inchangés.
- R2 : compte A crée exactement une mission fictive ; B réussit l’OCR HTTP, valeur proposée `12345.67`, photo non persistée, aucune soumission ; validation visuelle déclarée « oui ».
- R3 initial (23 novembre 2026) : tentative arrêtée ; la mission est restée `A_FAIRE`, sans écriture du déclarant.
- R3D : B soumet volontairement `e1aba323-8370-4638-b430-77fc1f6d7437` avec l’index synthétique `12345.67 KWH` ; le coordinateur A l’intègre après revue et confirmation dans l’interface.
- PostgreSQL R3D : **10 relevés canoniques**, dont les **9 initiaux inchangés**, **16 événements E-METER**, dont les **15 initiaux inchangés**, **2 missions INTEGREE**, **7 événements E-PARTICIPATION**.
- Tests R3D : test R1 (23), EP1 (57), OCR plaques (34), E-METER-1A (55), E-METER-1E1 (33), `npm test`, Apple Vision local, vérifications PostgreSQL read-only et HTTP authentifiées A/B.
- La photo et l’OCR ne sont jamais des preuves métrologiques. Le dixième relevé vient exclusivement du circuit de validation EP1, pas de l’API OCR.

## Références et limites

- SHA de base à vérifier : `48c9fa4e953ae8b9de2a28ee8c6ef6e6373144e6` sur `work/energy-mvp01`.
- Rapport d’exécution R3D conservé sous `~/Documents/SATEER-RAPPORTS/` : `EMETER2-R3D-8arr1yia-RESULTAT.zip`.
- Commit et push normal effectués uniquement si le titulaire de l’instance saisit `AUTORISER_COMMIT_PUSH_EMETER2_R3` après les contrôles.
- Les scripts R3 externes, le fichier non suivi `REFERENTIEL-REV2-EFFICACITE-PARTICIPATIVE.md`, et les données de recette ne sont pas inclus dans le commit.
- Pour production : qualité OCR sur afficheurs divers, multi-index (heures pleines/creuses), conservation/probativité facultative des photos, support hors Mac, politiques de quotas et rétention à traiter séparément.
