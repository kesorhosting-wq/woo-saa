SELECT cron.unschedule('process-preorders-every-minute');

SELECT cron.schedule(
  'process-preorders-every-5-min',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://fkvddhkyqsztjiiyfknn.supabase.co/functions/v1/process-topup',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZrdmRkaGt5cXN6dGppaXlma25uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAwMjkyMjksImV4cCI6MjA4NTYwNTIyOX0.mIHzCELtE5dnN909Pr3Ean2eYZq959CooIuRb7Ujh-w"}'::jsonb,
    body := '{"action": "process_preorders"}'::jsonb
  ) AS request_id;
  $$
);