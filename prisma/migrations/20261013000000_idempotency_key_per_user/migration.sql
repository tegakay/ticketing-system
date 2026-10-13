-- Idempotency keys are client-chosen, so they are only unique per user
-- (the composite unique index below). The extra global unique index made two
-- different users sending the same key collide.
DROP INDEX "Order_idempotency_key_key";
