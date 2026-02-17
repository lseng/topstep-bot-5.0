-- Fix entry_order_id column type: INTEGER -> BIGINT
-- TopstepX order IDs now exceed INT max (2,147,483,647)
-- e.g. orderId 2460000720 causes "value out of range for type integer"

ALTER TABLE positions ALTER COLUMN entry_order_id TYPE BIGINT;
