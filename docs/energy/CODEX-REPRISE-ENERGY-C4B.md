# PASSATION CODEX — SATEER Energy, état au 20 novembre 2026

**Cette note est une fiche de reprise et non une autorisation de modifier la production.** Lisez le référentiel `docs/energy/REFERENTIEL-REV2-EFFICACITE-PARTICIPATIVE.md` avant toute conception. Ne supprimez aucune migration ou fonctionnalité validée.

## 1. Branches / révisions

Branche de recette : `work/energy-mvp01`. Dernière validation attestée avant C4B : **`4d3b098dba82dc34b736687cdc271ecaa59a2209`** (C4A). GitHub a été vérifié à ce SHA le 20/11/2026.

- C1 : organisation multi-niveaux et délégation nominative (055), SHA `aab0dfe`.
- C2 : collecte d'appareils par bureau, contrôle ascendant et historique (056), SHA `91d3669`.
- C3A : catalogue de modèles privés par site (057), SHA `b6908e1`.
- C3B : qualification technique par les contributeurs (058), SHA `6571ca1`.
- C4A : 3 cartes physiques/électriques/fonctionnelles sans déduction (059), SHA `4d3b098dba82dc34b736687cdc271ecaa59a2209`.
- **C4B** : esquisses SVG (migration candidate 060) **NON validé avant retour ZIP du Mac**. Ne pas présenter C4B comme commité dans la branche de recette avant SHA distant vérifié.

## 2. Fichiers C4B

`energy/energy-sketch-domain.js`, `-store.js`, `-http.js` ; `database/060_energy_site_sketch.sql` ; `public/energie-esquisse.html/.js/.css` et son entry ; `scripts/test-energy-mvp02c4b.js`, `scripts/maintenance/test-energy-mvp02c4b-{pg,reel}.js` ; `docs/energy/MVP02C4B-EDITEUR-ESQUISSES.md` ; `server.js` et `public/energie-cartographie.html` patchés par installateur. Jamais d'insertion SQL directe dans les tables C1/C4A.

## 3. Invariants métier

Core SATEER : identités, tenants, organisation, permissions, audit. Capabilités transversales Communication/Workflows/IA/reporting séparées. Energy : moteur de consommation, inventaire, équipements, topologie et futurs calculs isolables, **sans second Core**. Deux parcours : grand public autonome simple et client accompagné après contrat signé et rôle de mission vérifiés. Les photos/plaques/OCR existants (052/053) restent privés, sources assistées non certifiantes ; l'accès technique par contrat reste un développement distinct.

Priorités après C4B : **C4C dashboards participatifs**, puis consolidation de frontières architecture Energy, puis compteurs universels multi-pays et relevés manuels/factures/IoT facultatif, sobriété avant investissement, M&V sur baseline, remplacement dynamique d'appareils/ROI, réclamations clients et parcours AEME/ANER/ASER/SENELEC/SOMELEC selon accords et habilitations. Aucun contrat institutionnel ni API de fournisseur présumé.

## 4. Règles de livraison Codex

Pas de dispersion ni patchs empilés. Un seul script Mac regroupant précontrôles, tous tests de non-régression, rollback PG sur cluster `7699611241381229531` + DB `sateer_test`, migration après consentement, E2E A/B, visuel puis commit ciblé et push GitHub normal. Vérifier explicitement `git rev-parse HEAD == git ls-remote origin ...` et état Git propre. Pas de force-push, reset/clean/stash/rebase/pull automatique. Rapport ZIP unique `~/Downloads`, `open -R` Finder. Pas de mots de passe dans les dépôts ou rapports. Code lisible/documenté, maintenable humainement sous VS Code, sans dépendance à Codex.

## 5. Action immédiate à la reprise

Demander d'abord le ZIP de résultat C4B au pilote. **Si C4B n'est pas validé sur Mac**, diagnostiquer le rapport et réparer avec un paquet R1 ciblé sans réappliquer 060. **Si C4B est validé**, vérifier le SHA distant GitHub puis développer C4C. Ne pas attaquer comptage universel ou SENELEC avant la clôture C4C et la consolidation des contrats.
