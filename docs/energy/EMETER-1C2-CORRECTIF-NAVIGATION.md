# SUNU COURANT — Contre-recette E-METER-1C2 — Correctif local de navigation NAV-R1

## État

**Correctif candidat non validé sur le Mac, non commité, non poussé.** Point de départ et de contrôle immuable : `Senergy-Invest/SATEER`, `work/energy-mvp01`, SHA `959e084d493e62b3a0f99c40b4033c48faf003f4`. La clôture technique 1C2 existante n'est pas remise en cause ; l'ergonomie de navigation doit être vérifiée avant une validation fonctionnelle complète.

## Défaut observé par l'utilisateur

Les entêtes avaient des liens parents figés : Contrôles → Rectifications, Rectifications → Factures, Factures → Relevés. Le libellé « ← Mes factures » rendait possible une descente puis un retour vers une autre page que celle réellement visitée. La liste qualité « Voir les versions » n'ouvrait pas la version document visée.

## Modifications ciblées

- `energie-controles.js` : lorsque `source=DOCUMENTS` est demandé via l'URL, initialiser le bon onglet. La ligne « Voir les versions » transmet uniquement tenant, provenance autorisée `controles`, UUID du site et UUID de la déclaration racine.
- `energie-rectifications.js` : si `from=controles`, retour explicite vers les contrôles DOCUMENTS et sélection initiale de la déclaration si elle est présente sur la page autorisée. Sinon retour par défaut vers les factures. Lien explicite « Consulter mes factures » qui indique qu'on y va, en conservant la provenance et, si connue, la sélection.
- `energie-factures.js` : si `from=rectifications`, l'en-tête devient « ← Rectifications » ; sinon conserve « ← Mes compteurs ». Le retour vers Rectifications rétablit `from=controles` uniquement si c'était la provenance antérieure.
- Les trois HTML changent seulement le paramètre de cache JS ; une des pages propose un lien « Consulter mes factures » explicite.
- `scripts/test-energy-nav.js` : six tests simulant le DOM avec réponses API entièrement fictives, navigation, sélection et refus d'une origine arbitraire.

Pas d'ajout API, d'authentification, de permissions, de calcul, de SQL, de migration, d'opération sur les justificatifs, ni de changement de serveur. La sécurité reste appliquée par les contrôles Core et les API existantes. Les paramètres d'URL `from`, `site`, `document` ne donnent aucun droit ; `from` appartient à un ensemble fermé et les identifiants doivent être des UUID valides.

## Vérification avant publication

1. Installer uniquement les 6 fichiers UI et le test/document depuis le ZIP après vérification du SHA Git (local et distant) et des empreintes Git des six versions précédentes.
2. Exécuter les 6 tests de navigation, 272 tests E-METER et 101 tests C4C ; aucun besoin de migration.
3. En navigateur sur `3493` avec des données fictives de la contre-recette, suivre **Contrôles (DOCUMENTS) → Voir les versions → Rectifications (document ciblé) → Consulter mes factures → retour Rectifications → retour Contrôles (DOCUMENTS)**, sans perte du site.
4. Vérifier la navigation directe Rectifications → Mes factures → Retour Rectifications, ainsi que le contenu des deux recharges fictives et les signaux.
5. Conserver une preuve visuelle des étapes de navigation et des signaux ; ne pas conclure « validé » par des questions OUI seules.
6. **Commit et push distincts seulement après validation humaine des preuves visuelles**, avec SHA distant indépendant, sans force-push.

Limite : la sélection ciblée opère sur la première page de 50 déclarations autorisées ; si le document n'est pas dans cette page, l'interface l'indique sans le charger en contournant la pagination ou l'autorisation.

## Addendum NAV-R2 — bilan de tests portable

NAV-R1 a été annulé à tort sur le Mac : ses 6 tests étaient PASS mais le lanceur attendait uniquement le format `# pass 6`, tandis que Node utilisait `ℹ pass 6`. NAV-R2 reconnaît les deux formats sur **toutes** les suites, conserve la restauration sur échec réel et inclut des tests de son propre parseur. Le HTML est versionné `nav-r2`. Aucune migration, aucune modification de données et aucun commit/push automatique. Statut : candidat local jusqu’à recette humaine documentée.
