-- SATEER P3.3.3B — Ajout de deux droits institutionnels au catalogue.
-- Aucun role, relation, compte ni experience n'est active par ce SQL.
-- A executer uniquement sur sateer_test apres garde du cluster.
BEGIN;

INSERT INTO public.permissions (code, nom, description, actif)
VALUES
  ('VIEW_ORGANISATION_EXPERIENCES',
   'Consulter les experiences de l organisation',
   'Consulter le registre des experiences pour une organisation explicitement autorisee.', TRUE),
  ('MANAGE_ORGANISATION_EXPERIENCES',
   'Gerer les experiences de l organisation',
   'Activer ou desactiver une experience pour une organisation explicitement autorisee.', TRUE)
ON CONFLICT (code) DO NOTHING;

COMMIT;
