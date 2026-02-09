
-- Add quantity column to packages table (default 1 = single purchase)
ALTER TABLE public.packages ADD COLUMN quantity integer NOT NULL DEFAULT 1;

-- Add quantity column to special_packages table
ALTER TABLE public.special_packages ADD COLUMN quantity integer NOT NULL DEFAULT 1;
