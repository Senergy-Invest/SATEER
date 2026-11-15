# SATEER Diaspora — UX1 : recette visuelle, séparation des profils et identité autonome

## Périmètre

Suivi direct de D2B-C1 (`8fe7f746527c693f4ae7e00b0bcc154315f24875`). Aucun changement de base, migration, session, RBAC, service HTTP, notification ou politique commerciale. Aucun fichier Bordeaux, Ambassade, Consulat ou Energy modifié. Ce lot ne clôture pas une validation humaine visuelle par un test statique.

## Constats issus des quatre écrans de recette

1. Le fil citoyen affichait les communications sponsorisées au milieu des informations générales. Leur accès public reste légal dans le contrat MVP, mais une séparation visuelle est nécessaire.
2. L'accord commercial pouvait être activé et révoqué ; le message d'opération ne constituait pas un état permanent clair.
3. Bordeaux apparaissait avec « Suivre cette zone » alors qu'elle était déjà suivie, et les outils de ciblage professionnel étaient mélangés aux préférences personnelles.
4. La page SOURCE avec une unique organisation présentait « Sélectionne une organisation » en attendant un choix de menu ; les actions Source/Bureau étaient invisibles tant que l'organisation n'était pas sélectionnée.
5. La couleur dominante institutionnelle bleu-vert était trop proche des expériences Consulat et Ambassade.

## Modifications produit

- `public/diaspora-theme.css` : thème **propre à l'expérience Diaspora**, variables limitées à `body.diaspora-experience` ; violet profond `#523785`, terracotta `#D36C45` (accent), ivoire `#F8F3E9`, vert `#187C70`. Pour les boutons terracotta, la nuance accessible est `#A7492A`. Focus visible, dispositions mobiles, contraste.
- Tous les écrans Diaspora chargent la même feuille **après** les styles locaux. Aucun style global n'est changé.
- Le fil général sépare visuellement informations institutionnelles et sponsorisées, sans modifier les droits de lecture existants. L'identité de la source reste visible ; pas de sponsor tiers.
- Consentement : état courant visible en permanence « notifications commerciales autorisées/désactivées », avec messages distincts pour une activation ou révocation réussie.
- Abonnements : nombre de thèmes et d'associations activés et libellés de cases accessibles.
- Zones citoyennes : « Déjà suivi » est désactivé pour une zone active. La recherche n'est plus implicitement préremplie avec Bordeaux : le référentiel territorial reste générique.
- Zone d'une publication : **page professionnelle distincte** `/diaspora-zones-professionnelles.html?tenant=...&organisation=...`. Les routes existantes `/api/organisations/:id/diaspora/source-publications` et `.../geo-target/:publicationId` continuent d'appliquer les permissions du Core et le verrouillage après soumission.
- Espace professionnel : si le contexte authentifié ne contient qu'une organisation, celle-ci est présélectionnée et ses permissions sont vérifiées ; le lien de ciblage est masqué jusqu'à l'autorisation effective de liste source.

## Contrats de sécurité et compatibilité

- Les identités proviennent de la session ; aucun ID de citoyen, de compte ou de rôle dans l'URL.
- Aucun consentement commercial créé lors d'un changement de thème ou de zone.
- Aucun ciblage d'une publication déjà soumise.
- Aucune liste nominative des abonnés fournie à la source.
- La séparation de l'UI ne donne aucun droit supplémentaire ; les contrôles SQL et API existants restent les seuls arbitres.
- Aucune requête métier `POST` ou `PUT` pendant la campagne de recette automatique ; seuls les login synthétiques et les `GET` sont exercés.

## Recette visuelle humaine requise

Ouvrir la prévisualisation sur le port réservé par l'exécuteur. **Ne pas confondre succès des tests automatiques et approbation visuelle.**

- **CITOYEN** : distinguer fil général et sponsorisé ; vérifier état commercial permanent, activation/révocation puis rafraîchissement ; Bordeaux « Déjà suivi » si actif ; absence de commandes professionnelles dans « Mes zones » ; abonnements de thèmes lisibles.
- **SOURCE** : avec l'unique association du compte, l'organisation se sélectionne automatiquement ; publications affichées après contrôle ; marquage sponsorisé uniquement avant soumission ; page de ciblage accessible et ciblage verrouillé pour les publications soumises.
- **BUREAU** : l'organisation SATEER est préselectionnée si elle est seule ; vérifier file de revue, affichage source/sponsor/zone/catégorie et champ motif de rejet, sans action destructrice sur les fixtures existantes.
- Vérifier bureau et écran étroit (mobile / largeur 375 px) : boutons utilisables, contraste, pas de débordement horizontal.

Le test manuel nécessite une validation **explicite** dans le Terminal avant le commit/push. Le paquet produit un diagnostic unique et un lien Finder. Les identifiants privés restent sur le Mac et ne doivent jamais être envoyés au support.
