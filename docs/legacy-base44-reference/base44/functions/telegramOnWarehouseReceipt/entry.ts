// Entity automation handler: fires on WarehouseReceipt create.
// Sends "Warehouse Receipt Confirmed" and a "Large Shrinkage Alert" when shrinkage > 500 KG.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

async function sendTelegram(text) {
  try {
    const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const chatId = Deno.env.get('TELEGRAM_CHAT_ID');
    if (!token || !chatId) {
      console.error('Telegram credentials missing');
      return;
    }
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    });
    if (!res.ok) {
      console.error(`Telegram ${res.status}: ${await res.text().catch(() => '')}`);
    }
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
    let receipt = payload?.data;

    if (payload?.payload_too_large && event.entity_id) {
      const base44 = createClientFromRequest(req);
      receipt = await base44.asServiceRole.entities.WarehouseReceipt.get(event.entity_id);
    }
    if (!receipt) return Response.json({ ok: true });

    // Resolve dispatch KG from the linked PurchaseRecord (more reliable than the legacy field on the receipt)
    let dispatchKg = Number(receipt.net_dispatch_weight_kg ?? 0);
    try {
      const base44 = createClientFromRequest(req);
      if (receipt.purchase_record_id) {
        const purchase = await base44.asServiceRole.entities.PurchaseRecord.get(receipt.purchase_record_id);
        if (purchase?.net_dispatch_weight_kg) dispatchKg = Number(purchase.net_dispatch_weight_kg);
      }
    } catch (e) {
      console.error('Could not load purchase for dispatch KG:', e.message);
    }

    const receivedKg = Number(receipt.warehouse_received_net_kg ?? 0);
    const shrinkage = dispatchKg - receivedKg;
    const { date, time } = nowStamp();

    const msg =
`🏭 KKGT — Warehouse Receipt Confirmed
─────────────────
Supplier: ${receipt.supplier_name || '-'}
Code: ${receipt.coffee_code || '-'}
Received KG: ${fmtNum(receivedKg)} KG
Dispatch KG: ${fmtNum(dispatchKg)} KG
Shrinkage: ${fmtNum(shrinkage)} KG
GRN Code: ${receipt.grn_code || '-'}
─────────────────
🕐 ${date} ${time}`;
    await sendTelegram(msg);

    if (shrinkage > 500) {
      const alert =
`⚠️ KKGT — Large Shrinkage Alert
─────────────────
Supplier: ${receipt.supplier_name || '-'}
Shrinkage: ${fmtNum(shrinkage)} KG
Dispatch KG: ${fmtNum(dispatchKg)} KG
Received KG: ${fmtNum(receivedKg)} KG
⚠️ Investigate immediately
─────────────────
🕐 ${date} ${time}`;
      await sendTelegram(alert);
    }

    return Response.json({ ok: true });
  } catch (error) {
    console.error('telegramOnWarehouseReceipt error (swallowed):', error.message);
    return Response.json({ ok: true });
  }
});