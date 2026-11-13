# Architecture SATEER — état du dépôt

## Doctrine

La cible est **Core générique → capacités transversales → moteurs spécialisés isolables → expériences configurables**. Les expériences assemblent des capacités et configurations ; elles ne donnent pas au Core des règles particulières à une organisation.

Le dépôt est aujourd’hui un monolithe Node.js/Express et PostgreSQL. Ce choix est adapté à ce stade. Cette note décrit ce qui est visible dans le code ; elle ne transforme pas les modules cibles en capacités prétendument opérationnelles.

## Core et capacités transversales présentes

- **HTTP et sessions** : `server.js`, `auth-http.js`, `auth-database.js`. La personne de l’appelant est issue de la session vérifiée.
- **Organisations, personnes, rôles et permissions** : `services-database.js`, `auth-authorization.js`, `database/001_initial_schema.sql`, `database/003_multitenancy.sql`, migrations 015–027 et 029–030. Les permissions effectives et rattachements configurent les accès.
- **Persistance** : `database.js` expose un pool PostgreSQL commun et `services-database.js` regroupe encore de nombreuses requêtes métier et Core.
- **Interfaces** : `public/` contient les expériences citoyen, agent, secrétariat et direction ; les écrans ne remplacent pas les contrôles API.

## Capacités et moteurs présents ou partiels

| Capacité | État dans le code | Frontières et limites visibles |
|---|---|---|
| Publications et canaux | Routes et services dans `server.js`, `communication-targets.js`, `communication-targets-router.js`, `communication-channels-router.js`; migrations 004, 028, 035. | Le ciblage interorganisationnel est distinct des canaux. Les abonnements sont enregistrés, mais aucun mécanisme de notification de canal n’est raccordé. Les canaux non publics ne sont pas pris en charge par le routeur actuel. |
| Workflow et routage | Routes métier dans `server.js`, règles organisationnelles dans `pilot-routing-rules.js`, données dans `services-database.js`; migrations 010–021, 026, 032. | Le routage réutilise les capacités et listes de destination configurées. P7 l’appelle directement. L’ingestion d’e-mails n’existe pas. |
| Notifications | Table de migration 012, écritures métier dans `services-database.js`, lecture/rendu dans `server.js` et `public/consulat.js`. | Persistance et présentation existent ; pas de moteur autonome ni de transport e-mail/push identifié. Les préférences de canal ne déclenchent pas de notification. |
| Identité et coffre | `identity-http.js`, `identity-documents-http.js`, `identity-verifications-http.js`, `private-files-http.js`, modules crypto et migrations 029–032. | Composants pilotes protégés par des gardes `sateer_test`. Le coffre stocke des fichiers chiffrés hors webroot ; une clé protégée et des répertoires privés préexistants sont requis. Aucune vérification officielle n’est réalisée. |
| Démarches guidées P7 | `pilot-procedures-http.js`, `public/p7-citizen-ui.js`, `public/p7-office-files.js`, migration 033. | Catalogue configurable par organisation et transmission consentie de documents existent dans le code. Le routeur orchestre lui-même catalogue, demande, pièces et appel au routage ; pas de test E2E observé. Configuration Bordeaux et disponibilité hors base de test non validées. |
| Dashboards institutionnels | Routes dans `server.js`, agrégations dans `services-database.js`, interfaces `dashboard-vice-consul.*` et `dashboard-consul.*`, migrations 006, 024, 025. | API et permissions distinctes pour supervision opérationnelle et stratégique. Les données P7/e-mail ne sont pas établies comme sources intégrées. Ce composant n’est pas un moteur de monitoring énergétique. |
| Assistant | `assistant-guard.js`, `services.js`, `services-database.js`, route dans `server.js` et `public/assistant.js`. | Assistance/contextualisation et contrôles de réponse présents ; aucun fournisseur de modèle externe n’est identifié dans le chemin examiné. L’expérience ne doit pas bloquer le workflow administratif. |
| Ingestion d’e-mails | Non implémentée dans les routes ou dépendances examinées. | Pas de boîte, connecteur, dédoublonnage, ingestion de pièces ou conversion d’e-mail en demande. Voir `email-ingestion.md` pour une proposition non implémentée. |
| Engineering/Simulation, Energy, Academy, monitoring énergétique | Cibles architecturales, non identifiées comme moteurs backend dans le code suivi examiné. | Pages de présentation locales ou schémas génériques ne prouvent pas l’existence d’un moteur. Hors périmètre du pilote consulaire. |

## Contrats et dépendances

Les routeurs spécialisés devraient dépendre d’interfaces stables vers les sessions, permissions, organisations, stockage métier et audit, plutôt que d’accéder directement à l’implémentation privée d’un autre moteur. Dans l’état actuel, certains routeurs sont séparés, mais partagent le pool `database.js` et les fonctions de `services-database.js`. `pilot-procedures-http.js` importe et appelle `routeNewCitizenCase` directement. Aucun contrat versionné d’événement métier n’a été identifié.

Ne pas ajouter une couche ou un service distant par principe. Lors d’un changement ciblé, documenter le contrat et les erreurs nécessaires ; différer l’extraction tant qu’un besoin concret ne la justifie pas.

## Données canoniques et défaillances

- Les personnes, organisations, relations, rôles, demandes et permissions ont leur source de vérité dans PostgreSQL.
- Les fichiers du coffre et copies de pièces de dossier sont chiffrés sur disque ; leurs métadonnées sont en base. Un test doit traiter les deux supports ensemble et contrôler les résidus.
- Les notifications sont des enregistrements applicatifs ; elles ne prouvent pas une livraison externe.
- Plusieurs capacités partagent le même pool et le même processus HTTP. Une indisponibilité de PostgreSQL affecterait plusieurs moteurs. Le stockage documentaire introduit une dépendance locale additionnelle.

## Reprise par une équipe humaine

Les migrations et tests explicites sont de bons points d’entrée. Les principaux obstacles sont la concentration des routes dans `server.js`, des requêtes dans `services-database.js`, la coexistence d’anciens services en mémoire et du chemin PostgreSQL, et l’absence d’une documentation complète des contrats et prérequis opérationnels. Le prochain travail raisonnable est documentaire et testable par parcours ; aucune réécriture globale n’est justifiée par cet audit.

## Liens

- `data-and-security.md` : périmètres, autorisations et propriété des données.
- `email-ingestion.md` : conception de la capacité générique à venir.
- `../development/testing.md` : effets des tests et règles d’exécution.
- `../development/p7-e2e.md` : scénario P7 proposé et prérequis à valider.
