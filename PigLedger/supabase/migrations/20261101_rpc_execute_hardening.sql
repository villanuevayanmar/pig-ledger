-- Production security follow-up: remove anonymous execution from the legacy stock-out RPC.
-- The function also checks auth.uid() and farm write access internally; this
-- revocation makes its intended signed-in-only contract explicit at the ACL layer.
revoke execute on function public.record_feed_stock_out(
  uuid, uuid, uuid, date, text, numeric, numeric, text
) from public, anon;

grant execute on function public.record_feed_stock_out(
  uuid, uuid, uuid, date, text, numeric, numeric, text
) to authenticated, service_role;
