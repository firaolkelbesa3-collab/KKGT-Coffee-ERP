// Entity automation handler: fires on OutputReport create.
// Sends the output report summary and an additional high-reject alert when reject_pct > 25.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

async function sendTelegram(text) {
  try {
    const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const chatId = Deno.env.get('TELEGRAM_CHAT_ID');
    if (!token || !chatId) return;
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    });
    if (!res.ok) console.error(`Telegram ${res.status}: ${await res.text().catch(() => '')}`);
  } catch (e) {
    console.error('Telegram send failed (swallowed):', e.message);
  }
}

const fmtNum = (n) => (n == null || isNaN(n)) ? '0' : Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    const event = payload?.event || {};
    let report = payload?.data;

    if (payload?.payload_too_large && event.entity_id) {
      const base44 = createClientFromRequest(req);
      report = await base44.asServiceRole.entities.OutputReport.get(event.entity_id);
    }
    if (!report) return Response.json({ ok: true });

    const time = new Date().toISOString().slice(11, 16) + ' UTC';
    const rejectPct = Number(report.reject_pct ?? 0);

    const msg =
`📊 KKGT — Output Report Saved
─────────────────
Date: ${report.date || '-'}
Coffee Type: ${report.coffee_type || '-'}
Total KG Processed: ${fmtNum(report.total_kg_processed)} KG
Export: ${fmtNum(report.export_bags)} bags — ${fmtNum(report.export_kg)} KG
Reject: ${fmtNum(report.reject_bags)} bags — ${fmtNum(report.reject_kg)} KG
Waste: ${fmtNum(report.waste_kg)} KG
Reject Rate: ${fmtNum(rejectPct)}%
Registrar: ${report.registrar_name || '-'}
─────────────────
🕐 ${time}`;
    await sendTelegram(msg);

    if (rejectPct > 25) {
      const alert =
`⚠️ KKGT — High Reject Rate Alert
─────────────────
Date: ${report.date || '-'}
Coffee Type: ${report.coffee_type || '-'}
Reject Rate: ${fmtNum(rejectPct)}% ⚠️
Reject KG: ${fmtNum(report.reject_kg)} KG
Action: Check processing quality
─────────────────
🕐 ${time}`;
      await sendTelegram(alert);
    }

    return Response.json({ ok: true });
  } catch (error) {
    console.error('telegramOnOutputReport error (swallowed):', error.message);
    return Response.json({ ok: true });
  }
});