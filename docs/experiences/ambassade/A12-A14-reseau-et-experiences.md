# SATEER Ambassade — A12, A13 et A14 regroupés

## Périmètre livré

- **A12 Réseau de la mission** : lecture seule, source `organisation_relationships` et demandes/invitations du Core. Liste les consulats liés par `ADMINISTRATIVE_TUTELLE`, les associations directement rattachées par `COMMUNITY_MEMBER`, celles rattachées aux consulats liés, les partenariats `COOPERATION` / `COORDINATION`, et les invitations en attente. Les données exposées se limitent aux noms, types et identifiants d'organisations, sans dossier, données personnelles ni secret.
- **A13 Identité diplomatique** : refonte du fond et de la palette sur **tous les écrans Ambassade A11**, prune/bordeaux/cuivre/ivoire, y compris les Workspaces et la publication. L'activation sur les pages partagées repose toujours sur la vérification du type `AMBASSADE` et de l'organisation dans `SATEER_CONTEXT_READY`. Le Consulat conserve son thème vert.
- **A14 Mon SATEER** : les **deux expériences** `Mon Consulat` et `Mon Ambassade` sont toujours identifiables. Une carte n'est ouvrable que si la session est rattachée à une organisation du type correspondant. En absence de rattachement, une carte informative sans lien est affichée. Aucun droit n'est créé.

## Contrats et frontières

- `GET /api/ambassade-network/:organisationId?tenant=...` : disponible uniquement sur `sateer_test` avec le drapeau `SATEER_ENABLE_AMBASSADE_NETWORK=1`. Session authentifiée obligatoire. Contrôle serveur `VIEW_ORGANISATION_ANALYTICS` de portée **ORGANISATION**; vérification du vrai type `AMBASSADE` et du tenant. Aucun POST/PUT/PATCH/DELETE A12.
- Les relations doivent être actives, validées et non expirées, dans le **même tenant**. La tutelle ne confère ni la gestion des associations d'un consulat, ni la consultation de ses dossiers.
- Une « association des consulats » désigne une association reliée à un consulat réellement lié à la mission ; la **circonscription géographique n'est pas déduite** du nom. Aucun pouvoir territorial n'est présumé.
- Le service Communication partagé, les modules consulaire et les migrations sont inchangés. Aucune nouvelle table ni permission globale.
- Les relations « partenaires » sont distinctes des relations de tutelle; les simples liens `COMMUNITY_MEMBER` ne deviennent pas des conventions de partenariat.
- La vue affiche des invitations/demandes en attente **sans permettre de les accepter**. Le workflow de validation institutionnelle et de consentement reste à configurer avant de relier de vraies organisations. Il serait incorrect de prétendre que l'Ambassade peut déjà gérer librement les partenariats officiels.

## Démonstration fictive

- Dans `sateer_test` sur le cluster épinglé, le lanceur crée (ou vérifie) exclusivement dans le tenant préexistant `AMBVIS_*` : 1 consulat fictif, 2 associations fictives et 1 partenaire bancaire fictif, 4 relations synthetiques actives et 1 invitation **non envoyée**.
- Les relations sont expressément marquées `A12_FIXTURE_SYNTHETIQUE`, sans attestation ni délégation officielle. Les comptes et mots de passe existants ne sont ni recréés ni changés.
- `~/.sateer-recette/ambassade-visuelle/RESEAU_A12_MANIFESTE.json` sert de trace locale privée des IDs. Ne pas supprimer tant que la recette est en cours.
- Le serveur local sur `127.0.0.1:3410` est redémarré uniquement si son PID et son port correspondent à l'instance de recette contrôlée ; aucune interruption d'un serveur inconnu.

## Recette exigée avant validation

1. Exécuter les tests JS statiques A12–A14, A11, A1–A9, `npm test`, E2E Ambassade A7–A9, non-régression Bordeaux P6, A3d et Communication P3.1.
2. Vérifier tous les rollbacks des fixtures transactionnelles.
3. Effectuer commit local ciblé et push **sans force**, comparer explicitement le SHA distant ; photographier et recontrôler le dépôt Bordeaux.
4. Installer la fixture A12 seulement après GitHub validé ; redémarrer le serveur contrôlé et tester en HTTP : anonyme 401, citoyen 403, responsable 200.
5. Vérifier humainement l'écran « Mon SATEER », le fond de la mission, son réseau et la séparation Consulat/Ambassade sur mobile et bureau.

## Hors périmètre

Pas de gestion automatique d'organismes extérieurs, de transfert de dossiers entre consulats, de boîte mail réelle, de déploiement public, de rattachement institutionnel réel, ni de preuve qu'une autorité a officiellement approuvé les liens. Seule une convention et un workflow habilité permettront ces usages.

Toute anomalie après tests doit être enregistrée dans le rapport unique, sans faux marqueur PASS.
