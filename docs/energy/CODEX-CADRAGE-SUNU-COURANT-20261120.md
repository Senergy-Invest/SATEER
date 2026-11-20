# SATEER Energy / SUNU Courant — passation Codex et garde-fous C4B (20 novembre 2026)

**État source vérifié :** branche `work/energy-mvp01`, SHA `4d3b098dba82dc34b736687cdc271ecaa59a2209` (C4A clôturé). Cette branche `work/energy-c4b-cadrage-20261120` sert exclusivement à sauvegarder le cadrage et la passation. Elle **ne valide pas** le code C4B et ne remplace pas la branche de recette.

## MVP validés

- C1 `aab0dfe`: hiérarchie des lieux et délégations nominatives, migration 055.
- C2 `91d3669`: collecte par bureau et validations ascendantes, migration 056.
- C3A `b6908e1`: catalogue technique privé des modèles, migration 057.
- C3B `6571ca1`: qualification collaborative, migration 058.
- C4A `4d3b098dba82dc34b736687cdc271ecaa59a2209`: carte physique/électrique/fonctionnelle, migration 059, tests réels et SHA GitHub contrôlés.
- C4B **candidat non validé**: esquisse SVG et positions indépendantes, migration additive 060, recette prévue sur port 3483. Attendre le rapport Mac avant de le déclarer terminé.
- Après C4B : C4C tableaux de bord hiérarchiques et de qualité de données, sans annoncer d'économies mesurées sans base probante.

## Vision métier figée

1. **Simplicité et accès public.** Découverte autonome : aucun compteur connecté, capteur, photo, facture, contrat ni schéma électrique imposé ; déclaration par saisie progressive. Parcours approfondi seulement après contrat signé, mission et droits SATEER réellement vérifiés.
2. **Prédiagnostic participatif.** Gestionnaire, électriciens, responsables de bâtiments et occupants se répartissent les espaces et relevés quotidiens ; remontée hiérarchique, historique, contrôle qualité et consentements. Les équipements/lieux et acteurs ne sont pas dupliqués.
3. **Instrumenter progressivement.** Relevés manuels/factures d'abord ; compteur ou capteur central facultatif, puis sous-comptage ciblé là où il améliore réellement l'information. Un capteur central ne mesure pas les économies locales de chaque bâtiment.
4. **Efficacité avant investissement.** Sensibilisation, comportement, réglages et suppression de consommations inutiles, puis mesures et vérification sur référence documentée ; ensuite comparer rénovations/remplacements de climatiseurs, compresseurs, éclairages, pompes : coûts complets, kWh, euros/FCFA, retour sur investissement, hypothèses et incertitudes.
5. **Trois cartes distinctes.** Lieux (C1), réseau électrique (C4A), usages et machines (051/C2). Un compteur peut mesurer plusieurs bâtiments et un bâtiment recevoir plusieurs alimentations. Une position d'esquisse ne prouve aucun raccordement. Les relations sont déclarées à vérifier par des personnes compétentes.
6. **Photos d'équipement et plaques.** Passeport privé et OCR existants (052/053) ; extraction assistée puis vérification humaine, distinction entre valeur proposée, lue/confirmée et mesurée. Ne jamais copier ou exploiter automatiquement les photos dans un dossier contractuel ou une IA.
7. **Compteurs universels et multi-pays.** Sénégal, Mauritanie et région ouest-africaine : prépayé (dont Woyofal), postpayé, traditionnel, numérique, intelligent, hybride, hors réseau, sans compteur. Séparer point de comptage, appareil compteur, installation datée, relevé, contrat fournisseur et version tarifaire ; ne pas coder en dur Woyofal ni un fabricant.
8. **Institutions et service client.** Parcours AEME (efficacité), ANER (renouvelables), ASER (électrification rurale), SENELEC et SOMELEC (factures, assistance, plaintes, qualité de service) sous habilitation et convention, jamais partenariat présumé ni réception officielle fictive.
9. **Architecture maintenable et isolable.** Core SATEER minimal (identité, tenants, droits, audit) ; capacités Communication, Workflows, Reporting, IA en service ; moteur spécialisé Energy isolable à terme. Pas de second Core ni de code dépendant obligatoirement de Codex.
10. **Financement séparé.** Études, prédiagnostics, maintenance, monitoring et dossiers techniques dans Energy ; intermédiation financière éventuelle dans SATEER Invest, jamais couplée par défaut.

## C4B : critères de recette et reprise

L'éditeur doit permettre de placer des éléments C1/C4A/051 sur trois vues SVG, de sauvegarder leurs positions versionnées (060), de créer un lieu via **API C1** après confirmation, un compteur/tableau via **API C4A** après confirmation, sans donner de permissions automatiquement. Les traits affichés proviennent des relations C4A existantes, pas d'une inférence géométrique. Un plan local facultatif ne doit pas être téléversé. Session Core, propriétaire Energy, Origin stricte, clefs d'idempotence, FK composites, audit append-only, refus des accès latéraux.

**Séquence Codex :** lire le rapport ZIP C4B → contrôler migrations, tests, Core A/B et visuel → vérifier SHA local et distant GitHub sur `work/energy-mvp01` → seulement ensuite développer C4C. Sur Mac, un script regroupé, rollback PG sur `sateer_test` cluster `7699611241381229531`, validation avant migration persistante et avant commit, push normal sans force, SHA distant vérifié, rapport unique sous Downloads et ouverture Finder (`open -R`). Pas de reset/clean/stash/pull/rebase automatique. Toute évolution doit être lisible, documentée et maintenable sous VS Code par une équipe humaine.

**Référentiel complet :** le document REV2 de 20/11/2026 doit être copié dans `docs/energy/REFERENTIEL-REV2-EFFICACITE-PARTICIPATIVE.md` lors de l'installation du lot C4B validé ; il détaille les contrats de comptage, trajectoires institutionnelles et moteurs futurs.