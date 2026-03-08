ALTER TABLE public.topup_orders ADD COLUMN IF NOT EXISTS fulfill_quantity integer DEFAULT 1;
ALTER TABLE public.preorder_orders ADD COLUMN IF NOT EXISTS fulfill_quantity integer DEFAULT 1;