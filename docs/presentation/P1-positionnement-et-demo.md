# SATEER — P1 : plateforme d'abord, expériences ensuite, Energy spécialisée

## Objectif

Préparer la présentation commune de **Mon Consulat (Bordeaux)**, **Mon Ambassade** et **Diaspora**, puis mettre en cohérence :
- la page publique générale SATEER `/` ;
- l'accueil privé « Mon SATEER » `/index.html`.

**Décision éditoriale :** SATEER est la plateforme transversale. SATEER Energy / Sunu Courant appartient aux domaines spécialisés en préparation et ne pilote plus le discours d'ouverture.

## Provenance et précontrôles

Base attendue `work/diaspora-mvp` SHA `51e388fe0c215419a50387cb2a4a76c1b9ea7791`.
Branche de livraison autonome `work/presentation-v1`; aucune modification volontaire sur `work/bordeaux-pilot` et `work/ambassade-mvp`.

Anomalie de traçabilité du dépôt au 15 novembre 2026 : `server.js` sert `/` à partir de `public/accueil-sateer.html`, **absent du tree GitHub**, alors que `accueil-sateer.css` et `.js` y figurent. Une version locale non suivie peut exister ; l'installateur en conserve une copie privée hors ZIP. La nouvelle page publique est désormais versionnée. Aucun fichier déjà suivi n'est écrasé dans le worktree de présentation autrement que les deux points d'extension contrôlés `public/index.html` et `public/app.js`.

## Architecture d'information publique

1. **SATEER, plateforme transversale :** identité, organisations, permissions, communication, workflows, notifications.
2. **Expériences pilotes :** Mon Consulat, Mon Ambassade, Diaspora ; présentation honnête de leur maturité **recette fictive**.
3. **Utilité par acteur :** citoyens, agents et institutions, associations et territoires.
4. **SATEER Energy** : domaine spécialisé, sans fonctionnalité publique annoncée comme déjà active.
5. **Précision essentielle :** des capacités communes ne signifient pas un transfert automatique inter-organisations de messages, dossiers ou identités.

## Regroupement Mon SATEER

- **Institutions & services publics** : les cartes Consulat et Ambassade existantes avec contrôles d'appartenance, et Ministère uniquement si rattaché. Les cartes verrouillées restent informatives et sans lien.
- **Communautés & territoires** : cartes Diaspora déjà exposées dans les tenants issus du contexte de session, **sans nouveau droit**. Une zone vide reste explicite.
- **Services spécialisés · À découvrir** : SATEER Energy, simple fiche statique « en préparation », **sans lien d'activation**.
- **Mes fonctions professionnelles** : section séparée et inchangée ; aucun regroupement ne transforme une appartenance en permission.
- **Notifications/identité** : restent transversales et inchangées.

Le regroupement est **présentationnel**. Il ne crée ni `tenant`, ni groupe RBAC, ni registre d'activation, ni API, ni table, ni donnée personnelle. Aucun canal de publication, consentement ou quota n'est modifié.

## Déroulé conseillé de la présentation institutionnelle (20 minutes)

| Temps | Profil | Preuve à montrer | Réserve |
|---|---|---|---|
| 0–3 min | Page publique | SATEER plateforme : socle, expériences, périmètres | Energy reste secondaire |
| 3–10 min | Citoyen, agent, Vice-Consul, Consul Bordeaux | Information, démarche, orientation, traitement et supervision | Données fictives ; e-mail réel non intégré |
| 10–14 min | Ambassade | Informations/qualification/demandes, réseau institutionnel fictif | Aucune tutelle officielle ou transfert interpostes |
| 14–18 min | SOURCE, Bureau, citoyen Diaspora | Association vérifiée, création, zone Bordeaux, soumission, approbation, consultation | Limite de 3 notifications/24 h et accord commercial séparé |
| 18–20 min | Tous | Synthèse des responsabilités, points communs et bénéfices attendus | Ne pas présenter des simulations comme des impacts mesurés |

## Preuves confirmées / travaux à confirmer

| Sujet | Statut |
|---|---|
| Diaspora D3 création → zone → Bureau → fil | Recette synthétique validée, SHA `51e388f...` |
| Notification D2A MANUAL absente | Plafond 3/24 h atteint dans la recette D3 ; aucune remise à zéro |
| Mon Consulat Bordeaux workflows | Fonctionnalités et tests documentés P335BK/P335BY |
| Mon Ambassade, demandes et qualification | Fonctionnalités et tests documentés A8/A9 |
| Réseau Ambassade–Consulat–associations | Relations fictives, sans convention officielle |
| Synchronisation réelle d'une publication Consulat → Ambassade → Diaspora | **Non prouvée : ne pas jouer une fausse synchronisation** |
| Transfert réel de dossiers entre institutions | **Non livré** |
| Boîte e-mail institutionnelle IMAP/OAuth/SMTP | **Non reliée** |
| Mesures d'impact (délais gagnés, taux de satisfaction, budget) | **À mesurer, aucune valeur à inventer** |

## Critères d'acceptation P1 (site et regroupement)

1. `/` HTTP 200 depuis une branche Git vérifiée ; visibilité correcte en desktop/mobile ; aucune erreur bloquante ou lien cassé.
2. Page publique présente d'abord le caractère **transversal**, ensuite les pilotes, enfin Energy comme **en préparation**.
3. `/index.html` garde identité, notifications, fonctions professionnelles, et regroupe les institutions et la communauté sans casser leurs liens.
4. Comptes de recette : citoyen Diaspora voit sa carte communautaire ; profil Bordeaux voit Mon Consulat selon son contexte ; profil Ambassade voit ses cartes selon le Core. Des cartes verrouillées n'ouvrent aucun lien.
5. Aucune migration ni mutation de données; `server.js`, Consulat, Ambassade, Diaspora, Energy et les droits restent inchangés.
6. Tests : sécurité statique `npm test`, contrats P1 et contrats Diaspora/Ambassade ; validation visuelle humaine explicite.
7. Commit ciblé, push non forcé sur la **nouvelle branche de présentation**, SHA distant confirmé. Le branchement dans la version définitive et la synchronisation opérationnelle restent des décisions distinctes.

## Ensuite : démonstration transversale P2

En lecture seule d'abord, vérifier la disponibilité des trois pilotes et inventorier profils, tenants, règles et transitions réellement partageables. Si une vraie démonstration de synchronisation inter-organisations est souhaitée, préparer une fixture commune autorisée, explicitement non institutionnelle, et les contrats inter-organisations ; ne pas copier des droits ni forcer des relations. Faire ensuite une répétition avec un script oral et des captures de secours.
