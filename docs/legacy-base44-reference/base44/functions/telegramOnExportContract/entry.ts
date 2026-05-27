// Entity automation handler: fires on ExportContract create.
// Sends the new export contract summary and an additional loss alert when profit is negative.

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

function nowStamp() {
  const d = new Date();
  return { date: d.toISOString().slice(0, 10), time: d.toISOString().slice(11, 16) + ' UTC' };
}

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    const event = payload?.event || {};
    let contract = payload?.data;

    if (payload?.payload_too_large && event.entity_id) {
      const base44 = createClientFromRequest(req);
      contract = await base44.asServiceRole.entities.ExportContract.get(event.entity_id);
    }
    if (!contract) return Response.json({ ok: true });

    const { date, time } = nowStamp();

    // Price per LB derived from price_per_kg_usd (1 kg = 2.20462 lb)
    const pricePerKg = Number(contract.price_per_kg_usd ?? 0);
    const pricePerLb = pricePerKg / 2.20462;
    const profitEtb = Number(contract.profit_etb ?? 0);

    const msg =
`🚢 KKGT — New Export Contract
─────────────────
Contract No: ${contract.contract_no || '-'}
Destination: ${contract.destination_country || '-'}
Coffee Type: ${contract.coffee_type || '-'}
Export KG: ${fmtNum(contract.export_kg)} KG
Price: $${fmtNum(pricePerLb)}/LB
Total USD: $${fmtNum(contract.total_export_value_usd)}
Total ETB: ${fmtNum(contract.total_export_value_etb)} ETB
Profit ETB: ${fmtNum(profitEtb)} ETB
Profit Margin: ${fmtNum(contract.profit_margin_pct)}%
─────────────────
🕐 ${date} ${time}`;
    await sendTelegram(msg);

    if (profitEtb < 0) {
      const alert =
`🔴 KKGT — Export Contract Loss Alert
─────────────────
Contract No: ${contract.contract_no || '-'}
Destination: ${contract.destination_country || '-'}
Loss Amount: ${fmtNum(profitEtb)} ETB
Review costs immediately
─────────────────
🕐 ${date} ${time}`;
      await sendTelegram(alert);
    }

    return Response.json({ ok: true });
  } catch (error) {
    console.error('telegramOnExportContract error (swallowed):', error.message);
    return Response.json({ ok: true });
  }
});