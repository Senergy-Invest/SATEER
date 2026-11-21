# SATEER Energy — E-METER-1B2 : justificatifs privés de recette

**Base Git figée :** `work/energy-mvp01`, `133c0b97e1e17381ecd981b9f836f1a05ab9b3cd` (E-METER-1B1 publié). **Statut initial : candidat non installé, non publié.** Le statut réel n'est établi que par le rapport Mac et le SHA GitHub contrôlé.

## 1. Place dans le plan figé

C4C → E-ARCH → E-METER-1A → E-METER-1B1 → **E-METER-1B2** → autres tranches d'E-METER-1 → E-PARTICIPATION-1 → E-METER-2 (photo/OCR de relevés) → E-METER-3 (calculs). Aucune équation de consommation, de coût ou d'économie en 1B2. Pas de duplicata du Core, des habilitations ni de la Communication.

## 2. Audit des capacités existantes

- `private-files-http.js` et `private-files-crypto.js` : coffre citoyen de démonstration. Il gère les justificatifs d'identité personnels et ne peut pas recevoir des pièces énergétiques reliées à un site sous le même schéma d'autorisations.
- `energy/equipment-photo-vault.js` : stockage chiffré AES-256-GCM d'images d'équipements, sous-clé isolée et répertoire privé. La tranche 1B2 réutilise sa **convention de stockage privé, le chargeur de clé maître Core, la dérivation HKDF et la validation PNG** ; elle ne détourne pas des photos d'équipement ni n'invente un second coffre universel.
- Adaptateur spécialisé `energy/energy-billing-evidence-vault.js` : sous-clé dérivée **distincte**, AAD tenant/owner/site/facture/fichier/mime, IV aléatoire et intégrité GCM. Répertoire `$HOME/.sateer-energy-private/sateer_test/billing-evidence` en mode 0700, blobs en 0600. Aucun fichier public ni URL statique.
- Attention : le moteur documentaire générique et sa gouvernance globale ne sont **pas encore industrialisés**. Cette tranche n'affirme pas leur existence et ne constitue pas un nouveau système de partage documentaire global.

## 3. Contrat métier

- Pièce exclusivement associée à **une déclaration** `energy_billing_declarations` existante (062), dans un site possédé par la session Core. Source : octets de PDF ou PNG, maximum **5 Mio**, maximum **5 fichiers par déclaration** ; aucune pièce obligatoire pour utiliser SUNU COURANT.
- Métadonnées 063 : UUID, portée composite site/tenant/propriétaire/déclaration, nom nettoyé, MIME déterminé par octets, taille, SHA-256, auteur, date, provenance `SAISIE_MANUELLE`, statut `DECLARE_A_VERIFIER`, historique append-only.
- `POST /api/energy/justificatifs/v1/sites/:siteId/declarations/:declarationId/fichiers?tenant=...` : binaire `application/octet-stream`, `Origin` exact, clé UUID d'idempotence, session Core ; sauvegarde chiffrée et INSERT transactionnel. En cas de rollback, nettoyage du fichier écrit ; un réessai idempotent avec le même contenu ne duplique pas la pièce.
- `GET .../fichiers` : liste des preuves déjà enregistrées, propriétaire uniquement.
- `GET .../fichiers/:fileId/telecharger` : propriétaire uniquement, déchiffrement GCM, vérification taille et SHA-256, téléchargement **attachment** avec nom généré ; aucun rendu PDF inline par SATEER.
- Le lien de pièce ne certifie ni la facture, ni le fournisseur, ni un montant, ni le compteur associé. Aucun montant ou kWh calculé, aucun OCR/PDF parsing, aucun partage automatique à une institution.

## 4. Limites de sécurité et de production

**Usage strictement en recette avec documents fictifs** : le PDF est conservé comme blob non interprété. La détection de signature/EOF n'est **pas** une analyse antivirus, une neutralisation de scripts PDF ni une preuve que le fichier est sûr à ouvrir. Ne jamais fournir de données bancaires, numéro de recharge secret, justificatifs réels sensibles, photo de personne ou document d'identité dans les tests.

**Blocages avant production réelle** : politique de durée de conservation et suppression opposable, droit à l'effacement lorsque applicable, gestion des orphelins disque/SQL et sauvegardes chiffrées, rotation des clés, quota par site et audit de volumétrie, analyse de sécurité des fichiers, contraintes de stockage et de restauration, contrôle de l'authentification et des permissions, consentement et gouvernance documentaire. Le lot 1B2 ne possède **pas** d'API de suppression : les fichiers fictifs restent dans le coffre local de recette tant qu'une purge contrôlée n'est pas définie. Ce n'est pas une fonctionnalité prête pour le public.

## 5. Garde-fous de la recette et Git

- Migration **063 additive** uniquement sur `sateer_test`, cluster `7699611241381229531`, transaction dryrun puis accord humain distinct ; aucune mutation de 050–062. Fixtures de tests SQL entièrement annulées.
- Tests du lot, tests 1A/1B1/C4C et **17 régressions**, tests HTTP sessions A/B, origine et fichier interdit ; recette visuelle obligatoire des uploads et téléchargements sur PDF/PNG **fictifs**.
- Contrôler branche, SHA, origine, sources exactes, non-suivis autorisés (REV2 local hors lot), dossier privé et absence de fichier public. Interdire commit/push avant autorisation explicite et validation. Commit ciblé uniquement fichiers 1B2, push normal, comparaison SHA GitHub distant, rapport ZIP ouvert dans Finder.
- Un test d'arrêt doit produire un ZIP même sans dépôt local. Jamais force-push ; ne rien présumer d'un partenaire officiel.

## 6. Passation Codex / VS Code

Consulter ce document, `EMETER-1B1-FACTURES-RECHARGES-DECLARATIVES.md`, `EARCH-A1-A2-DECISIONS-ET-PASSATION.md`, les modules `energy/energy-billing-{domain,store,http}.js`, puis les sources 1B2 et les tests. Les futurs lots de qualité/import/remplacement de compteur restent indépendants ; **Engineering/Simulation ne doit pas être recodé dans SUNU COURANT**.
