-- SATEER P6: configurable organisation-scoped rules; no email connector or AI classification.
BEGIN;
CREATE TABLE IF NOT EXISTS organisation_routing_rules (
 id BIGSERIAL PRIMARY KEY,
 tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 organisation_id INTEGER NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
 source VARCHAR(32) NOT NULL CHECK(source='MON_CONSULAT'),
 category_key VARCHAR(80) NOT NULL CHECK(length(category_key)>=3),
 destination_unit_id INTEGER NOT NULL REFERENCES organisation_units(id) ON DELETE RESTRICT,
 actif BOOLEAN NOT NULL DEFAULT TRUE,
 created_by INTEGER REFERENCES personnes(id) ON DELETE SET NULL,
 updated_by INTEGER REFERENCES personnes(id) ON DELETE SET NULL,
 created_at TIMESTAMP NOT NULL DEFAULT now(),
 updated_at TIMESTAMP NOT NULL DEFAULT now(),
 CONSTRAINT uq_organisation_routing_rules UNIQUE(organisation_id,source,category_key)
);
CREATE INDEX IF NOT EXISTS idx_organisation_routing_rules_active ON organisation_routing_rules(organisation_id,source,category_key) WHERE actif=TRUE;
CREATE TABLE IF NOT EXISTS organisation_routing_rule_audit (
 id BIGSERIAL PRIMARY KEY,
 organisation_id INTEGER NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
 tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 rule_id BIGINT REFERENCES organisation_routing_rules(id) ON DELETE SET NULL,
 action VARCHAR(32) NOT NULL CHECK(action IN ('UPSERT','DISABLE')),
 category_key VARCHAR(80) NOT NULL,
 destination_unit_id INTEGER NOT NULL,
 acteur_personne_id INTEGER REFERENCES personnes(id) ON DELETE SET NULL,
 date_action TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_organisation_routing_rule_audit_org ON organisation_routing_rule_audit(organisation_id,date_action DESC);
COMMIT;
