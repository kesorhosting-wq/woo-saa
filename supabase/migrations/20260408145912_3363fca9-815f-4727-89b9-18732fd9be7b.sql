
CREATE TABLE IF NOT EXISTS public.kesorapi_products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  kesorapi_product_id TEXT NOT NULL UNIQUE,
  game_name TEXT NOT NULL,
  product_name TEXT NOT NULL,
  price NUMERIC NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  fields JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.kesorapi_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read kesorapi_products" ON public.kesorapi_products
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Admin manage kesorapi_products" ON public.kesorapi_products
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
