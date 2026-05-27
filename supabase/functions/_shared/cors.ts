// Shared CORS headers for Edge Functions. The frontend at *.vercel.app and
// localhost:5173 calls these directly via supabase.functions.invoke().
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
