-- 1. Add public_id to wallet_expenses
ALTER TABLE public.wallet_expenses ADD COLUMN IF NOT EXISTS public_id TEXT;

-- 2. Migrate existing circles (ordered by created_at)
WITH ordered_circles AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) as rn
  FROM public.circles
)
UPDATE public.circles c
SET public_id = 'C' || LPAD(oc.rn::TEXT, 6, '0')
FROM ordered_circles oc
WHERE c.id = oc.id;

-- 3. Migrate existing plans (ordered by created_at)
WITH ordered_plans AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) as rn
  FROM public.plans
)
UPDATE public.plans p
SET public_id = 'P' || LPAD(op.rn::TEXT, 6, '0')
FROM ordered_plans op
WHERE p.id = op.id;

-- 4. Migrate existing wallet_expenses (ordered by created_at)
WITH ordered_expenses AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) as rn
  FROM public.wallet_expenses
)
UPDATE public.wallet_expenses we
SET public_id = 'W' || LPAD(oe.rn::TEXT, 6, '0')
FROM ordered_expenses oe
WHERE we.id = oe.id;

-- 5. Add unique constraints
ALTER TABLE public.circles DROP CONSTRAINT IF EXISTS circles_public_id_key;
ALTER TABLE public.circles ADD CONSTRAINT circles_public_id_key UNIQUE (public_id);

ALTER TABLE public.plans DROP CONSTRAINT IF EXISTS plans_public_id_key;
ALTER TABLE public.plans ADD CONSTRAINT plans_public_id_key UNIQUE (public_id);

ALTER TABLE public.wallet_expenses DROP CONSTRAINT IF EXISTS wallet_expenses_public_id_key;
ALTER TABLE public.wallet_expenses ADD CONSTRAINT wallet_expenses_public_id_key UNIQUE (public_id);

-- 6. Make public_id columns not null
ALTER TABLE public.circles ALTER COLUMN public_id SET NOT NULL;
ALTER TABLE public.plans ALTER COLUMN public_id SET NOT NULL;
ALTER TABLE public.wallet_expenses ALTER COLUMN public_id SET NOT NULL;

-- 7. BEFORE INSERT trigger for circles
CREATE OR REPLACE FUNCTION generate_circle_public_id()
RETURNS TRIGGER AS $$
DECLARE
  max_id INT;
  next_id INT;
BEGIN
  IF NEW.public_id IS NULL OR NEW.public_id = '' OR NEW.public_id LIKE 'c_%' OR NEW.public_id LIKE '__temp__%' THEN
    SELECT COALESCE(MAX(SUBSTRING(public_id FROM '^C([0-9]+)$')::INT), 0)
    INTO max_id
    FROM public.circles
    WHERE public_id ~ '^C[0-9]{6}$';

    next_id := max_id + 1;
    NEW.public_id := 'C' || LPAD(next_id::TEXT, 6, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_circles_public_id ON public.circles;
CREATE TRIGGER trg_circles_public_id
BEFORE INSERT ON public.circles
FOR EACH ROW
EXECUTE FUNCTION generate_circle_public_id();

-- 8. BEFORE INSERT trigger for plans
CREATE OR REPLACE FUNCTION generate_plan_public_id()
RETURNS TRIGGER AS $$
DECLARE
  max_id INT;
  next_id INT;
BEGIN
  IF NEW.public_id IS NULL OR NEW.public_id = '' OR NEW.public_id LIKE 'P_%' OR NEW.public_id LIKE '__temp__%' THEN
    SELECT COALESCE(MAX(SUBSTRING(public_id FROM '^P([0-9]+)$')::INT), 0)
    INTO max_id
    FROM public.plans
    WHERE public_id ~ '^P[0-9]{6}$';

    next_id := max_id + 1;
    NEW.public_id := 'P' || LPAD(next_id::TEXT, 6, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_plans_public_id ON public.plans;
CREATE TRIGGER trg_plans_public_id
BEFORE INSERT ON public.plans
FOR EACH ROW
EXECUTE FUNCTION generate_plan_public_id();

-- 9. BEFORE INSERT trigger for wallet_expenses
CREATE OR REPLACE FUNCTION generate_wallet_expense_public_id()
RETURNS TRIGGER AS $$
DECLARE
  max_id INT;
  next_id INT;
BEGIN
  IF NEW.public_id IS NULL OR NEW.public_id = '' THEN
    SELECT COALESCE(MAX(SUBSTRING(public_id FROM '^W([0-9]+)$')::INT), 0)
    INTO max_id
    FROM public.wallet_expenses
    WHERE public_id ~ '^W[0-9]{6}$';

    next_id := max_id + 1;
    NEW.public_id := 'W' || LPAD(next_id::TEXT, 6, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_wallet_expenses_public_id ON public.wallet_expenses;
CREATE TRIGGER trg_wallet_expenses_public_id
BEFORE INSERT ON public.wallet_expenses
FOR EACH ROW
EXECUTE FUNCTION generate_wallet_expense_public_id();
