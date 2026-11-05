import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const authorization = req.headers.get("Authorization");
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const secretKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SECRET_KEY");
  if (!authorization || !url || !anonKey || !secretKey) {
    return new Response("Unauthorized", { status: 401 });
  }

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const admin = createClient(url, secretKey);
  const { error: deleteError } = await admin.auth.admin.deleteUser(data.user.id);
  if (deleteError) {
    return new Response(deleteError.message, { status: 400 });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
