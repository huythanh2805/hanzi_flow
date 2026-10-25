export function supabaseConfigured() {
  if (
    process.env.NODE_ENV === "development" &&
    process.env.HANZIFLOW_LOCAL_TRIAL === "1"
  )
    return false;
  return (
    !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  );
}
