// Entity automation handler: fires on PurchaseRecord create + update.
// - On create: send "New Purchase Registered"
// - On update: detect new payments in payment_history and send "Payment Recorded";
//              also send "Supplier Fully Paid" when balance hits 0.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const TG_URL = () => `https://api.telegram.org/bot${Deno.env.get('TELEGRAM_BOT_TOKEN')}/sendMessage`;
const CHAT_ID = () => Deno.env.get('TELEGRAM_CHAT_ID');

async function sendTelegram(text) {
  try {
    const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
    const chatId = CHAT_ID();
    if (!token || !chatId) {
      console.error('Telegram credentials missing');
      return;
    }
    const res = await fetch(TG_URL(), {
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

function fmtNum(n) {
  if (n == null || isNaN(n)) return '0';
  return Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function nowStamp() {
  const d = new Date();
  const date = d.toISOString().slice(0, 10);
  const time = d.toISOString().slice(11, 16) + ' UTC';
  return { date, time };
}

function parsePayments(json) {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    const event = payload?.event || {};
    const data = payload?.data;
    const oldData = payload?.old_data;

    let purchase = data;
    if (payload?.payload_too_large && event.entity_id) {
      const base44 = createClientFromRequest(req);
      purchase = await base44.asServiceRole.entities.PurchaseRecord.get(event.entity_id);
    }
    if (!purchase) return Response.json({ ok: true });

    const { date, time } = nowStamp();

    if (event.type === 'create') {
      const msg =
`🏭 KKGT — New Purchase Registered
─────────────────
Supplier: ${purchase.supplier_name || '-'}
Code: ${purchase.coffee_code || '-'}
Dispatch KG: ${fmtNum(purchase.net_dispatch_weight_kg)} KG
Unit Price: ${fmtNum(purchase.unit_price_etb_per_feresula)} ETB/Feresula
Grand Total: ${fmtNum(purchase.grand_total_etb)} ETB
Registered by: ${purchase.created_by || '-'}
─────────────────
🕐 ${date} ${time}`;
      await sendTelegram(msg);
      return Response.json({ ok: true });
    }

    if (event.type === 'update') {
      const oldPayments = parsePayments(oldData?.payment_history);
      const newPayments = parsePayments(purchase.payment_history);

      // Detect newly added payments (by length growth — payment_no is monotonic)
      if (newPayments.length > oldPayments.length) {
        const addedPayments = newPayments.slice(oldPayments.length);
        for (const p of addedPayments) {
          const msg =
`💰 KKGT — Payment Recorded
─────────────────
Supplier: ${purchase.supplier_name || '-'}
Code: ${purchase.coffee_code || '-'}
Amount Paid: ${fmtNum(p.amount_etb)} ETB
Bank: ${p.bank_name || '-'} | Branch: ${p.branch_account || '-'}
CPV Ref: ${p.cpv_reference || '-'}
Type: ${p.payment_type || '-'}
Balance Remaining: ${fmtNum(purchase.balance_etb)} ETB
─────────────────
🕐 ${date} ${time}`;
          await sendTelegram(msg);
        }
      }

      // Fully paid: balance reached 0 (was non-zero before)
      const oldBalance = Number(oldData?.balance_etb ?? 0);
      const newBalance = Number(purchase.balance_etb ?? 0);
      if (Math.abs(newBalance) <= 0.01 && Math.abs(oldBalance) > 0.01) {
        const msg =
`✅ KKGT — Supplier Fully Paid
─────────────────
Supplier: ${purchase.supplier_name || '-'}
Total Amount Settled: ${fmtNum(purchase.grand_total_etb)} ETB
All payments complete ✅
─────────────────
🕐 ${date} ${time}`;
        await sendTelegram(msg);
      }
    }

    return Response.json({ ok: true });
  } catch (error) {
    console.error('telegramOnPurchase error (swallowed):', error.message);
    return Response.json({ ok: true });
  }
});