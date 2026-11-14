# A8 — Entrée citoyenne Mon Ambassade et qualification préalable

Base Git attendue : `work/ambassade-mvp` SHA `cd457ecd609fb5660a8d94894131f7f6957fe3f9` (A7 validé).

## Décision métier

Une **question d'information** à propos d'un passeport n'est pas une demande de constitution de dossier. L'**intention est qualifiée avant le thème**. Pour `MON_AMBASSADE`, aucune règle P6 de catégorie `MON_CONSULAT` ne doit être réutilisée, même si la catégorie est identique (`PASSEPORT`, `ETAT_CIVIL`, etc.). Tant qu'il n'existe pas de règles Ambassade autorisées et validées, la demande reste `NOUVELLE` et sans destination, avec statut `QUALIFICATION_MANUELLE_REQUISE` renvoyé au citoyen. Cette absence de routage automatique est volontaire et sûre.

## Parcours raccordé

Depuis `Mon Ambassade`, le lien `Déposer une demande` ouvre le formulaire partagé `demande.html` dans le **tenant et l'organisation de la session**, avec source `MON_AMBASSADE`. L'API `/api/demandes` vérifie la session, l'appartenance et **le type AMBASSADE réel côté serveur**, avant de créer la demande dans la table canonique. Le formulaire commun conserve les autres parcours historiques. Il n'ouvre aucun accès à un autre consulat ni ne crée un rôle.

La file non orientée est consultable par le personnel déjà habilité via `Unit Workspace` ; l'orientation **manuelle**, la prise en charge, la réponse au citoyen, l'historique et les notifications continuent à utiliser Workflow et le Core, sans doublon de moteur.

## Recette groupée

Un scénario E2E supplémentaire est branché dans la **transaction unique du harnais P6**, après A7, seulement lorsque `SATEER_P6_AMBASSADE_TEST=1`. Il vérifie une vraie session citoyenne, une organisation fictive de type `AMBASSADE`, l'absence d'orientation malgré le mot PASSEPORT, les refus 401/403/422, la qualification par un compte habilité, le routage manuel, la prise en charge, la réponse et le détail consultable par son auteur. La campagne relance ensuite P6 historique, A3d, P3.1 et les contrôles statiques. Le rollback et la vérification depuis une nouvelle connexion restent propriétaires du harnais P6.

## Limites

Ce n'est **pas** une IA de classification, pas une boîte e-mail réelle et pas une délivrance de pièces. L'orientation reste humaine. L'accès citoyen est actuellement limité aux utilisateurs déjà rattachés à l'organisation Ambassade par le Core ; l'inscription du public externe à une ambassade est un chantier distinct. Aucun transfert inter-postes, aucune relation de tutelle, aucune permission officielle, aucune migration ou modification de Bordeaux n'est réalisé. Les données de recette sont synthétiques et annulées.

Le journal A7 contient un avertissement `pg` sur des requêtes parallèles d'un adaptateur de synthèse dans une transaction unique. Ce n'est pas un échec des tests, mais le harnais doit évoluer avant pg@9. Le présent lot ne met pas à jour pg et n'assimile pas cet avertissement à un succès de compatibilité pg@9.
