// The catalogue's search rules live with the server (supabase/functions/server/searchCore.tsx), so the public
// catalogue, the server's search and the search test all use the same code.
export * from '../../supabase/functions/server/searchCore.tsx';
