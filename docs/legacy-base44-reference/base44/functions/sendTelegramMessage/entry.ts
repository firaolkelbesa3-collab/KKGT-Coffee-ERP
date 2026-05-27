// Shared Telegram messaging helper.
// Can be called via base44.functions.invoke('sendTelegramMessage', { text }) from other functions,
// or as a standalone HTTP endpoint for testing.
// Failures are logged silently and NEVER thrown — Telegram must never break business flows.

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const text = body.text;

    if (!text || typeof text !== 'string') {
      return Response.json({ ok: false, error: 'text required' }, { status: 400 });
    }

    const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const chatId = Deno.env.get('TELEGRAM_CHAT_ID');

    if (!token || !chatId) {
      console.error('Telegram credentials missing');
      return Response.json({ ok: false, error: 'credentials missing' });
    }

    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error(`Telegram API ${res.status}: ${errText}`);
      return Response.json({ ok: false, status: res.status });
    }

    return Response.json({ ok: true });
  } catch (error) {
    console.error('sendTelegramMessage error (swallowed):', error.message);
    return Response.json({ ok: false, error: error.message });
  }
});