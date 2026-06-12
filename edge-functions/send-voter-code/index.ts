// ============================================================================
// send-voter-code — Supabase Edge Function (EMAIL STAGE)
// ----------------------------------------------------------------------------
// STATUS: provided for the email stage. NOT yet wired into the app and NOT
// tested on my side (it needs YOUR Resend account + verified domain + API key).
// Deploy + test this only when we reach the email stage.
//
// What it does: sends one voter their unique code via Resend.
//
// SETUP (you do these — I can't):
//   1. Create a Resend account at https://resend.com.
//   2. Add + verify your sending domain (e.g. mail.nihmathullah.com) in Resend,
//      OR use Resend's onboarding test address while developing.
//   3. Create an API key in Resend (starts with "re_").
//   4. Put the key in Supabase as a secret (NOT in code):
//        supabase secrets set RESEND_API_KEY=re_xxxxxxxx
//        supabase secrets set RESEND_FROM="Live Ballot <noreply@mail.nihmathullah.com>"
//   5. Deploy:
//        supabase functions deploy send-voter-code
//
// The app/admin calls this function with { to, code, electionTitle }. We'll wire
// it to the auto_email_codes toggle and the "resend code" button in a later stage.
// ============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const RESEND_FROM = Deno.env.get("RESEND_FROM") ?? "Live Ballot <onboarding@resend.dev>";

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: "RESEND_API_KEY not configured" }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const { to, code, electionTitle } = await req.json();
    if (!to || !code) {
      return new Response(JSON.stringify({ error: "to and code are required" }), {
        status: 400, headers: { "Content-Type": "application/json" },
      });
    }

    const subject = `Your voting code for ${electionTitle ?? "the election"}`;
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto">
        <h2 style="margin-bottom:4px">${electionTitle ?? "Election"}</h2>
        <p>Here is your personal one-time voting code:</p>
        <p style="font-size:28px;letter-spacing:4px;font-weight:bold;
                  font-family:'Courier New',monospace;background:#f4f4f4;
                  padding:16px;border-radius:8px;text-align:center">${code}</p>
        <p>Use it once on the voting page. Do not share it — it can only be used by one
           person, for one vote.</p>
        <p style="color:#888;font-size:12px">Sent by Live Ballot · NWS Digital Services</p>
      </div>`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: RESEND_FROM, to: [to], subject, html }),
    });

    const data = await res.json();
    if (!res.ok) {
      return new Response(JSON.stringify({ error: "Resend failed", detail: data }), {
        status: 502, headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ ok: true, id: data.id }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
