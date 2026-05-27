// Entity automation handler: fires on ProcessingLog create.
// Computes remaining stock for the supplier (warehouse received - all processing) and sends:
//  - Low stock warning (< 500 KG and > 0)
//  - Stock empty (= 0 or negative)

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
    let log = payload?.data;

    if (payload?.payload_too_large && event.entity_id) {
      const base44 = createClientFromRequest(req);
      log = await base44.asServiceRole.entities.ProcessingLog.get(event.entity_id);
    }
    if (!log?.supplier_name) return Response.json({ ok: true });

    const base44 = createClientFromRequest(req);

    // Sum warehouse received for this supplier
    const receipts = await base44.asServiceRole.entities.WarehouseReceipt.filter({ supplier_name: log.supplier_name });
    const totalReceived = receipts.reduce((s, r) => s + Number(r.warehouse_received_net_kg || 0), 0);

    // Sum processing for this supplier (use actual_weighed_kg with fallback to kg_sent)
    const logs = await base44.asServiceRole.entities.ProcessingLog.filter({ supplier_name: log.supplier_name });
    const totalProcessed = logs.reduce((s, l) => s + Number(l.actual_weighed_kg ?? l.kg_sent ?? 0), 0);

    const remaining = totalReceived - totalProcessed;
    const coffeeType = log.coffee_type || receipts[0]?.coffee_type || '-';
    const { date, time } = nowStamp();

    if (remaining <= 0) {
      const msg =
`🔴 KKGT — Stock Empty
─────────────────
Supplier: ${log.supplier_name}
Coffee Type: ${coffeeType}
All stock has been processed
─────────────────
🕐 ${date} ${time}`;
      await sendTelegram(msg);
    } else if (remaining < 500) {
      const msg =
`⚠️ KKGT — Low Stock Warning
─────────────────
Supplier: ${log.supplier_name}
Coffee Type: ${coffeeType}
Remaining Stock: ${fmtNum(remaining)} KG
Action needed: Process remaining stock soon
─────────────────
🕐 ${date} ${time}`;
      await sendTelegram(msg);
    }

    return Response.json({ ok: true });
  } catch (error) {
    console.error('telegramOnProcessing error (swallowed):', error.message);
    return Response.json({ ok: true });
  }
});