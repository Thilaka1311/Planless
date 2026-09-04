-- Refactor plans table: remove category/subcategory columns, add discovery_item_id column and foreign key reference
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS discovery_item_id UUID REFERENCES public.discovery_items(id) ON DELETE SET NULL;

-- Migrate existing plans data to reference the matching discovery_items rows based on enums
UPDATE public.plans
SET discovery_item_id = 'c8451f37-08bc-443a-ac4e-fa2c5b76d985'
WHERE category = 'SPORTS' AND subcategory = 'FOOTBALL';

UPDATE public.plans
SET discovery_item_id = '6bfd330f-d36e-42a3-b336-375c1c428c4c'
WHERE category = 'MOVIES';

UPDATE public.plans
SET discovery_item_id = 'b193c9af-705f-4f03-a6f9-f50c0a7a2f0f'
WHERE category = 'DINING';

-- Drop the old category and subcategory columns
ALTER TABLE public.plans DROP COLUMN IF EXISTS category;
ALTER TABLE public.plans DROP COLUMN IF EXISTS subcategory;
