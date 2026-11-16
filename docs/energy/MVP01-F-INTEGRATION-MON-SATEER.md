# SATEER Energy — MVP01-F — Intégration dans Mon SATEER

**Statut à compléter après tests réels et validation visuelle.** Base attendue : `work/energy-mvp01`, commit `89c3d31ba45bf49648ea465874bc949583fa673b`.

## Problème observé

L'accueil P1 affichait une carte statique « Energy en préparation » pour tous les comptes, même les deux profils de recette dont l'API Energy était déjà autorisée. La logique de découverte Diaspora proposait en outre l'expérience dans tout tenant rattaché, y compris le tenant réservé à Energy.

## Contrat livré par MVP01-F

- Conserver une carte Energy informative et non cliquable **par défaut**.
- Pour chaque tenant issu du **contexte authentifié Core** uniquement, demander `GET /api/energy/cases?tenant=...` ; c'est le contrôle d'accès existant, qui vérifie session, tenant autorisé par variable d'environnement et rattachement réel. Aucun droit nouveau, endpoint supplémentaire ni activation depuis un nom d'organisation.
- Seule la réponse `200` avec `statut=ENERGY_CASES_PERSONNELS` active la carte et le lien vers `/sunu-courant.html?tenant=...`.
- Ne pas proposer le tenant ainsi autorisé comme un accès Diaspora ; préserver la découverte Diaspora sur tous les **autres** tenants historiques.
- Le serveur Node déjà démarré peut servir les fichiers statiques modifiés sans redémarrage. En cas d'indisponibilité Energy, la carte reste verrouillée ; aucune session ni donnée n'est copiée.

## Portée

Deux fichiers P1 modifiés **uniquement dans le worktree Energy** (`public/index.html`, `public/app.js`), un test `scripts/test-energy-mvp01-home.js`, cette note. Pas de migration, changement de RBAC ou modification d'une autre branche.

## Recette et livraison

Avant commit : `npm test`, contrats P1, Ambassade, Diaspora, Energy et test de l'accueil. Vérifier sur `http://localhost:3472/index.html` avec le compte fictif Energy A : carte SUNU Courant active, Diaspora absente pour ce tenant, lien fonctionnement du formulaire et dossier retrouvé. Vérifier compte B : carte active mais dossiers A absents. Tout compte d'un autre tenant sans accès Energy doit conserver la carte non active.

Valider au clavier `VALIDER_VISUEL_ENERGY_MVP01_F` **uniquement** après ces contrôles. Commit limité aux quatre fichiers et push normal ; vérifier SHA distant. Mettre à jour le pointeur de reprise Codex lors du prochain lot de documentation ou comme complément si nécessaire. Cette tranche ne prétend pas avoir implémenté un diagnostic énergétique, une étude solaire, un monitoring ou une mise en production.
