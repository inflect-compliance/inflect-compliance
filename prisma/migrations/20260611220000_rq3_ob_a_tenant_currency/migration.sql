-- RQ3-OB-A — one currency voice per tenant. Default € matches the
-- canonical formatter's existing default, so no display changes for
-- existing tenants until they opt into another symbol.
ALTER TABLE "Tenant" ADD COLUMN "currencySymbol" TEXT NOT NULL DEFAULT '€';
