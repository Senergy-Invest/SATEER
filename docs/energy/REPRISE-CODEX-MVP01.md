# SATEER Energy — transmission de reprise après MVP01

## Base de vérité

- Dépôt : `Senergy-Invest/SATEER` ; branche Energy isolée `work/energy-mvp01`.
- Historique validé : REV3 sur `f4fd5d8eb62bd3398fcb06a7ad387920cd6ebbb3` ; MVP01 sur le premier commit de cette branche après REV3. **Lire le SHA réel du HEAD distant : ne pas inférer un SHA depuis ce document.**
- Référentiel actif : `docs/energy/INDEX-ACTIF-REV3.md` et `REFERENTIEL-REV3-VALIDE.md`; roadmap et frontières dans `ROADMAP-MVP-REV3.md`, `MATRICE-MOTEURS-REV3.md`.
- Livré : `energy/energy-case-domain.js`, `energy/energy-case-http.js`, `energy/energy-case-store.js`, `database/050_energy_cases.sql`, `public/sunu-courant.{html,js,css}`, route conditionnelle dans `server.js`.
- Tests conservés : `scripts/test-energy-mvp01.js` et `scripts/maintenance/test-energy-mvp01-{b-pg-http,c-core-auth}.js`, `test-energy-mvp01d-reel.js`, `preparer-energy-mvp01d-recette.js`.

## Etat et garanties

MVP01 est un pilote technique de **création/lecture de dossier énergétique privé**, sans dimensionnement, intelligence artificielle, diagnostic médical, dossier financier, droit institutionnel ni transmission externe. Pour reproduire un test de recette, ne jamais utiliser les données de Bordeaux, Ambassade ou Diaspora. Les identifiants de recette sont uniquement privés sur le Mac : ne pas afficher ni collecter les secrets dans des rapports, prompts ou commits.

## Suite autorisée

**MVP02 : inventaire participatif**, puis **MVP02A : passeport numérique universel des équipements** ; conserver les contrats d'isolement et les futures interfaces Data Quality, BEI, Learning, Monitoring, Maintenance et Invest, sans implémentation anticipée non testée.

Une livraison = une tranche verticale utilisable, tests métier et négatifs, documentation mise à jour, rapport ZIP consolidé, commit ciblé, push normal et comparaison locale/distante du SHA. Ne pas réécrire les versions validées REV3/MVP01, ne pas modifier les worktrees historiques et ne jamais faire de force-push.
