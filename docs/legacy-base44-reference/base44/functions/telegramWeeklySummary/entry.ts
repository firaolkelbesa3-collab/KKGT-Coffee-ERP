// Scheduled automation handler: runs every Monday at 8:00 AM (UTC via cron).
// Aggregates outstanding balances, supplier payment statuses, warehouse stock, and weekly processing.

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
    const base44 = createClientFromRequest(req);

    const [purchases, receipts, logs] = await Promise.all([
      base44.asServiceRole.entities.PurchaseRecord.list(),
      base44.asServiceRole.entities.WarehouseReceipt.list(),
      base44.asServiceRole.entities.ProcessingLog.list(),
    ]);

    let totalBalance = 0;
    let unpaid = 0;
    let partial = 0;
    let paid = 0;

    for (const p of purchases) {
      const gt = Number(p.grand_total_etb || 0);
      const payments = parsePayments(p.payment_history);
      const totalPaid = payments.reduce((s, x) => s + (parseFloat(x.amount_etb) || 0), 0);
      const balance = gt - totalPaid;
      totalBalance += balance > 0 ? balance : 0;
      if (totalPaid <= 0.01) unpaid++;
      else if (Math.abs(balance) <= 0.01) paid++;
      else partial++;
    }

    // Total warehouse stock = total received - total processed
    const totalReceived = receipts.reduce((s, r) => s + Number(r.warehouse_received_net_kg || 0), 0);
    const totalProcessed = logs.reduce((s, l) => s + Number(l.actual_weighed_kg ?? l.kg_sent ?? 0), 0);
    const totalRemaining = Math.max(0, totalReceived - totalProcessed);

    // Weekly processing = last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const weeklyProcessing = logs
      .filter((l) => (l.date || '') >= sevenDaysAgo)
      .reduce((s, l) => s + Number(l.actual_weighed_kg ?? l.kg_sent ?? 0), 0);

    // Monday date (today)
    const mondayDate = new Date().toISOString().slice(0, 10);

    const msg =
`📋 KKGT — Weekly Summary
─────────────────
Total Outstanding Balance: ${fmtNum(totalBalance)} ETB
Unpaid Suppliers: ${unpaid}
Partial Suppliers: ${partial}
Fully Paid: ${paid}
Total Warehouse Stock: ${fmtNum(totalRemaining)} KG
Total Processed This Week: ${fmtNum(weeklyProcessing)} KG
─────────────────
Week of ${mondayDate}`;
    await sendTelegram(msg);

    return Response.json({ ok: true });
  } catch (error) {
    console.error('telegramWeeklySummary error (swallowed):', error.message);
    return Response.json({ ok: true });
  }
});