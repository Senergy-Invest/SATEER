# SUNU COURANT — E-METER-1B1 : factures et recharges déclaratives

**Base immuable de départ** : `work/energy-mvp01` au SHA `c86169ad8f8258ee45ff2f37e6540ababb006ee8`. **Statut initial : candidat de recette ; non publié.** Cette note est rédigée avant l'exécution Mac. Seul un rapport Mac contrôlé, puis un commit ciblé et un SHA GitHub identique, autorisera la clôture de 1B1.

## 1. Pourquoi cette tranche

E-METER-1A a introduit le point de comptage, le compteur physique, ses registres et les index manuels (`061`). Nous ajoutons maintenant la **déclaration manuelle d'une facture ou recharge**. Cette donnée documentaire n'est ni une mesure de consommation, ni une validation de tarif, ni une opération financière. Le propriétaire peut enregistrer une facture sans avoir inventorié de compteur.

**Ordre figé** : E-METER-1 (1A clôturé, 1B1 présent, tranches restantes ensuite) → E-PARTICIPATION-1 → E-METER-2 photographie/OCR → E-METER-3 calculs. Ne pas anticiper l'expérience BEI ou le moteur transversal Engineering/Simulation.

## 2. Contrat canonique de la déclaration

| Champ | Convention |
|---|---|
| Nature | `FACTURE` ou `RECHARGE` ; jamais paiement exécuté par SATEER |
| Portée | Site propriétaire Core/tenant ; point et compteur **facultatifs**, mais FKs composites obligatoires si présents |
| Énergie | `ELECTRICITE`, `GAZ`, `EAU`, `CHALEUR`, `AUTRE` ; doit correspondre à l'énergie du point lié |
| Date | `dateDocument` jour ISO `YYYY-MM-DD`, non futur ; le document est déclaré, non certifié |
| Période | Facture : début et fin obligatoires, ordonnés et pas après la date du document ; recharge : période absente |
| Montant | **Chaîne décimale** max. 12 chiffres entiers, 2 décimales ; PostgreSQL `NUMERIC(14,2)` ; aucune conversion JavaScript `Number` |
| Devise | Code à trois lettres en capitales, déclaré et non certifié ; pas de taux de change |
| Références | `referenceDocument`, `referenceJustificatif` facultatives ; **simple texte, pas upload ni preuve déposée** |
| Provenance et qualification | Toujours `SAISIE_MANUELLE` et `DECLARE_A_VERIFIER` en 1B1 |
| Audit | `BillingDeclarationRecorded.v1`, append-only ; corrections/reclassements nécessitent un lot séparé versionné |

### Garde-fous contre les faux résultats

- **Ne pas faire** : `index fin - index début = consommation` ; rapprocher factures/recharges aux index pour calculer kWh, coût unitaire, économies ou fraude.
- Un reçu Woyofal ou une facture peut comprendre des taxes/frais/prélèvements/ajustements : le montant saisi n'est pas un tarif par kWh. Le code pays/opérateur et ses règles versionnées relèvent des futurs adaptateurs.
- Le raccordement facultatif à un point/compteur ne prouve pas à lui seul que le document concerne ce compteur ; une confirmation technique est à faire ultérieurement.
- **Aucun fichier justificatif n'est actuellement hébergé** : un numéro ou une référence n'est jamais affiché comme fichier joint ou justificatif vérifié. Prévoir coffre sécurisé, analyse des accès, stockage, cycle de vie, consentement et traçabilité avant ajout de pièces en 1B2.
- Aucune obligation d'IoT, facture ou même compteur pour commencer un dossier SUNU COURANT.

## 3. Architecture et API

La migration **062 additive**, uniquement `sateer_test` (cluster `7699611241381229531`), crée `energy_billing_declarations` et `energy_billing_events`, leurs index, contraintes de sites/points/compteurs et triggers d'historique immuable. Aucune modification des migrations 050–061 ni de Core.

Modules Node séparés : `energy-billing-domain.js` (validation pure), `energy-billing-store.js` (SQL, transactions, autorisations propriétaire, idempotence), `energy-billing-http.js` (session Core/tenant/Origin). Aucun second Auth ni moteur scientifique. **Routes uniquement si** `SATEER_ENABLE_ENERGY_METER_1B1=1`, `SATEER_ENABLE_ENERGY_METER_1A=1`, prérequis MVP01/02 et `PGDATABASE=sateer_test` :

- `GET /api/energy/facturation/v1/sites?tenant=...`
- `GET /api/energy/facturation/v1/sites/:siteId/declarations?tenant=...&offset=0`
- `POST /api/energy/facturation/v1/sites/:siteId/declarations?tenant=...`

Chaque `POST` impose `Origin` exact, `Idempotency-Key` UUID, liste blanche de champs, session valide et site propre. Le propriétaire est le seul habilité en 1B1 ; les contributions collaboratives attendent **E-PARTICIPATION-1**. Lectures paginées 50 lignes, sans total prétendu exhaustif ; droits revérifiés avant toute requête. Aucune identité transmise par le navigateur n'est acceptée comme autorité.

Interface de recette `http://localhost:3489/energie-factures.html?tenant=ENERGY_MVP01D_RECETTE`, accessible depuis E-METER-1A si l'API de 1B1 est activée. Formats affichés sans HTML injecté. Le panneau autorise un site sans point, un point sans compteur ou un compteur explicitement lié ; formulaire et historique restent privés.

## 4. Tests et protocole de validation

1. Précontrôles `work/energy-mvp01` au SHA précité, GitHub `ls-remote` identique, index Git propre, aucune divergence des sources. Document REV2 non suivi laissé intact et exclu.
2. Régression syntaxique, 58 tests métier/API de préparation, 55 tests E-METER-1A et 101 tests C4C ; 17 campagnes incluant Core, Bordeaux, Ambassade et Diaspora.
3. Migration 062 en transaction intégralement annulée (`dryrun`), vérification de l'identité DB + cluster, de la FK composite, des montants décimaux, du caractère append-only, d'une recharge sans compteur et du rollback de fixtures.
4. **Autorisation séparée de migration** avant toute installation persistante sur `sateer_test`. `verify` après l'application, aucun jeu fictif de migration conservé.
5. Instance de recette locale au port 3489, protections HTTP A/B et refus de fausses identités/montants/justificatifs uploadés ; vérifications visuelles de facture, recharge sans compteur, montant/devise/période/historique et isolation A/B.
6. **Autorisation séparée de publication Git** : commit ciblé sur les fichiers du lot, push normal sans force, SHA distant comparé au SHA local, ZIP de preuves ouvert dans Finder.

### Limites à transmettre

- Justificatifs : références textuelles seulement ; **aucun fichier, PDF, photo ou reçu stocké**, aucun import OCR.
- Pas de contrôle tarifaire/Woyofal, dédoublonnage métier avancé, remboursement, TVA, rapprochement facture/index, calcul d'économie ou révision de facture.
- L'historique append-only interdit la correction silencieuse ; un futur workflow de rectification doit produire une nouvelle version et un lien d'annulation, sans effacer l'historique.
- Pas de tests grand volume démontrés ; voir les risques R1 de `docs/energy/EARCH-A1-A2-DECISIONS-ET-PASSATION.md`.
- Ne pas présenter le document d'E-METER-1A, dont l'intitulé peut conserver son statut prérecette, comme preuve négative : les rapports Git et les SHA publiés établissent la clôture de 1A.

## 5. Reprise humaine / Codex

Lire cette note, `docs/energy/EMETER-1A-POINTS-COMPTEURS-REGISTRES-RELEVES.md`, `docs/energy/EARCH-A1-A2-DECISIONS-ET-PASSATION.md`, la Roadmap REV3, puis `database/061...` et `062...`, les trois modules 1A et les trois modules 1B1. Les tests `scripts/test-energy-emeter1b1.js` et `scripts/maintenance/{emeter1b1-pg-migration,test-energy-emeter1b1-http}.js` sont exécutables de façon autonome avec les dépendances standard du dépôt. Pas de nouvel outil IA requis pour la maintenance.
