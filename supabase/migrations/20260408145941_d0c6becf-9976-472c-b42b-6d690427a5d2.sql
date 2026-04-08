
ALTER TABLE public.kesorapi_products ADD COLUMN IF NOT EXISTS kesorapi_type_id TEXT;
ALTER TABLE public.kesorapi_products ADD COLUMN IF NOT EXISTS denomination TEXT;
ALTER TABLE public.kesorapi_products ADD COLUMN IF NOT EXISTS currency TEXT;

ALTER TABLE public.topup_orders ADD COLUMN IF NOT EXISTS kesorapi_product_id TEXT;
ALTER TABLE public.topup_orders ADD COLUMN IF NOT EXISTS kesorapi_order_id TEXT;

ALTER TABLE public.packages ADD COLUMN IF NOT EXISTS kesorapi_product_id TEXT;
ALTER TABLE public.special_packages ADD COLUMN IF NOT EXISTS kesorapi_product_id TEXT;
