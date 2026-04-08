
CREATE TABLE IF NOT EXISTS public.preorder_games (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.preorder_packages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id UUID NOT NULL REFERENCES public.preorder_games(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  amount TEXT NOT NULL,
  price NUMERIC NOT NULL DEFAULT 0,
  icon TEXT,
  kesorapi_product_id TEXT,
  kesorapi_type_id TEXT,
  quantity INTEGER DEFAULT 1,
  scheduled_fulfill_at TIMESTAMPTZ,
  sort_order INTEGER DEFAULT 0,
  label TEXT,
  label_bg_color TEXT,
  label_text_color TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.preorder_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  game_name TEXT NOT NULL,
  package_name TEXT NOT NULL,
  player_id TEXT NOT NULL,
  server_id TEXT,
  player_name TEXT,
  amount NUMERIC NOT NULL,
  status TEXT DEFAULT 'pending',
  status_message TEXT,
  payment_method TEXT,
  user_id UUID,
  kesorapi_product_id TEXT,
  kesorapi_order_id TEXT,
  scheduled_fulfill_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.preorder_games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.preorder_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.preorder_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read preorder_games" ON public.preorder_games FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admin manage preorder_games" ON public.preorder_games FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Public read preorder_packages" ON public.preorder_packages FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admin manage preorder_packages" ON public.preorder_packages FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Public read preorder_orders" ON public.preorder_orders FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Auth insert preorder_orders" ON public.preorder_orders FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admin manage preorder_orders" ON public.preorder_orders FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
