# ADR-009 — API de lecture pour la supervision ministérielle mondiale (A4b)

Date : 13 novembre 2026. Statut : **route de recette à sources indisponibles par défaut**. Ce lot ne constitue ni une homologation officielle, ni un annuaire institutionnel, ni un tableau de bord opérationnel.

## Responsabilités

- Le Core conserve identité, rattachements, tenant et permissions. Une permission dédiée `VIEW_MINISTRY_WORLDWIDE` doit être **créée et attribuée explicitement par un processus habilité** avant tout accès. Le lot A4b ne la crée ni ne l'attribue.
- Le type `MINISTERE` de l'organisation racine est relu dans PostgreSQL et le code de tenant est contrôlé. La session provient exclusivement de `exigerSession`. Une permission organisationnelle sur le seul poste demandeur est requise. Ni le lien de tutelle, ni une autorisation sur une unité, ni le rôle affiché dans l'UI ne suffisent.
- Le module `ministry-worldwide-http.js` orchestre les vérifications avant de demander un lot au fournisseur serveur. Le navigateur **ne peut pas** fournir lui-même le catalogue, les relations, les rapports ou la liste des références autorisées.
- `ministry-worldwide-source-contract.js` valide la forme, la période, la racine, les révisions de provenance et refuse une organisation non atteignable dans le graphe approuvé depuis cette racine. Il ne prétend pas vérifier une signature ou une approbation administrative : l'authenticité des données est la responsabilité du fournisseur institutionnel, **non développé dans A4b**.
- `ministry-worldwide-reporting.js` (A4a) reste propriétaire de l'agrégation. L'API ne développe ni SQL inter-tenant ni nouveau moteur de reporting. Les champs arbitraires et dossiers privés sont écartés par sa projection minimale.
- Le fournisseur `chargerLotNonConfigure` est le seul raccordé dans le serveur à ce stade. Même avec permission explicite, il répond **HTTP 503 SOURCES_NON_CONFIGUREES** plutôt que produire des données de démonstration.

## Route de recette

`GET /api/ministry-worldwide/:organisationId?tenant=SN&periode=YYYY-MM`

Activable **uniquement** lorsque `PGDATABASE=sateer_test` et `SATEER_ENABLE_MINISTRY_WORLDWIDE_READ=1` ; fermée par défaut, protégée par `exigerSession`, `private, no-store`. Pas de POST/PATCH/DELETE. Aucun appel à un site officiel ni import d'annuaire n'est effectué.

Séquence des contrôles : session → paramètres → organisation MINISTERE dans le tenant → autorisation Core de portée ORGANISATION → fournisseur approuvé → cohérence du lot et ancrage du réseau → composition agrégée → projection API. Un fournisseur absent ou invalide donne une erreur neutre, sans détail SQL.

## Préconditions avant un usage réel

1. Institution responsable du référentiel mondial identifiée, annuaire validé et référencé avec version, date et contrôle d'authenticité indépendamment du champ `provenance`.
2. Périmètres de visibilité ministériels approuvés et auditables (qui voit quels postes, quels pays, quelles données et pour quelle durée).
3. Pipeline de reporting du moteur commun avec métriques calculées par le poste propriétaire, approbation, provenance vérifiable, période, schéma versionné et révocation.
4. Gestion des anomalies, des rapports tardifs et des postes non raccordés sans jamais les compter comme zéro activité.
5. Recette multi-tenant, homologation et gestion des accès sur le périmètre du Ministère. Pas de reprise de données nominatives.

## Tests et limites

`node scripts/test-ministry-worldwide-http.js` exerce les contrats de transport, de RBAC et de provenance **sans vrai compte ministériel** ; puis non-régression A4a, A3d/PostgreSQL et P3.1. Le lot ne prouve pas encore la disponibilité ni la validité d'une source ministérielle réelle.
