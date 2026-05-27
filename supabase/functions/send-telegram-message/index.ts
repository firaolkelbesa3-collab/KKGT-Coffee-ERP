// send-telegram-message: gateways a Telegram Bot API sendMessage call.
//
// Deployed as a Supabase Edge Function. The frontend calls this through
// supabase.functions.invoke('send-telegram-message', { body: { message } }).
//
// Failures are logged but never thrown to the client — Telegram outages must
// not block business workflows (purchase saves, payment writes, etc.).
//
// Required environment variables (set via `supabase secrets set`):
//   TELEGRAM_BOT_TOKEN — bot token from BotFather
//   TELEGRAM_CHAT_ID   — destination chat / group / channel ID
//
// Accepts both { message } (current frontend) and { text } (legacy Base44
// function signature) for backward compatibility.

import { corsHeaders } from '../_shared/cors.ts';

interface Payload {
  message?: string;
  text?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as Payload;
    const text = body.message ?? body.text;

    if (!text || typeof text !== 'string') {
      return new Response(
        JSON.stringify({ ok: false, error: 'message required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const chatId = Deno.env.get('TELEGRAM_CHAT_ID');

    if (!token || !chatId) {
      console.error('send-telegram-message: TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not set');
      return new Response(
        JSON.stringify({ ok: false, error: 'credentials missing' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error(`Telegram API ${res.status}: ${errText}`);
      return new Response(
        JSON.stringify({ ok: false, status: res.status }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({ ok: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('send-telegram-message (swallowed):', msg);
    return new Response(
      JSON.stringify({ ok: false, error: msg }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
