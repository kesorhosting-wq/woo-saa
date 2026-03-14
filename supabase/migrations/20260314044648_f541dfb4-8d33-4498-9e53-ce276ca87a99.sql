-- Remove duplicate/legacy paid triggers first
DROP TRIGGER IF EXISTS process_topup_on_paid ON public.topup_orders;
DROP TRIGGER IF EXISTS on_order_status_paid ON public.topup_orders;

-- Rebuild trigger function: queue fulfillment only after paid, without forcing processing
CREATE OR REPLACE FUNCTION public.trigger_process_topup_on_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  g2bulk_enabled boolean := false;
  request_id bigint;
BEGIN
  IF NEW.status = 'paid' AND COALESCE(OLD.status, '') <> 'paid' THEN
    -- If package is not linked, keep order paid for manual action
    IF NEW.g2bulk_product_id IS NULL THEN
      UPDATE public.topup_orders
      SET status_message = 'Paid. No G2Bulk product linked; waiting manual processing.'
      WHERE id = NEW.id;
      RETURN NEW;
    END IF;

    -- Respect API enable flag; do not auto-send if disabled
    SELECT COALESCE(ac.is_enabled, false)
    INTO g2bulk_enabled
    FROM public.api_configurations ac
    WHERE ac.api_name = 'g2bulk'
    LIMIT 1;

    IF NOT g2bulk_enabled THEN
      UPDATE public.topup_orders
      SET status_message = 'Paid. G2Bulk is disabled, order not auto-sent.'
      WHERE id = NEW.id;
      RETURN NEW;
    END IF;

    -- Queue fulfillment request; processing state is handled by process-topup lock flow
    SELECT net.http_post(
      url := 'https://fkvddhkyqsztjiiyfknn.supabase.co/functions/v1/process-topup',
      body := jsonb_build_object(
        'action', 'fulfill',
        'orderId', NEW.id::text
      ),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZrdmRkaGt5cXN6dGppaXlma25uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAwMjkyMjksImV4cCI6MjA4NTYwNTIyOX0.mIHzCELtE5dnN909Pr3Ean2eYZq959CooIuRb7Ujh-w'
      )
    ) INTO request_id;

    UPDATE public.topup_orders
    SET status_message = 'Paid. Auto-send queued.'
    WHERE id = NEW.id;
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    UPDATE public.topup_orders
    SET status_message = CONCAT('Paid. Auto-send queue failed: ', LEFT(SQLERRM, 160))
    WHERE id = NEW.id;
    RETURN NEW;
END;
$$;

-- Single paid-status trigger (after status update)
CREATE TRIGGER on_order_status_paid
AFTER UPDATE OF status ON public.topup_orders
FOR EACH ROW
EXECUTE FUNCTION public.trigger_process_topup_on_paid();