import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const purchases = await base44.asServiceRole.entities.PurchaseRecord.list('-purchase_date', 500);
    const users = await base44.asServiceRole.entities.User.list();
    const supervisors = users.filter(u => u.role === 'admin' || u.role === 'supervisor');

    // Find outstanding (unpaid/partial) purchases
    const outstanding = purchases.filter(p => {
      const gt = parseFloat(p.grand_total_etb) || 0;
      if (gt === 0) return false;
      let paid = 0;
      try {
        const payments = JSON.parse(p.payment_history || '[]');
        paid = payments.reduce((s, pay) => s + (parseFloat(pay.amount_etb) || 0), 0);
      } catch {}
      return paid < gt - 1;
    });

    if (outstanding.length === 0) {
      return Response.json({ message: 'No outstanding balances.' });
    }

    const totalBalance = outstanding.reduce((s, p) => {
      const gt = parseFloat(p.grand_total_etb) || 0;
      let paid = 0;
      try {
        const payments = JSON.parse(p.payment_history || '[]');
        paid = payments.reduce((acc, pay) => acc + (parseFloat(pay.amount_etb) || 0), 0);
      } catch {}
      return s + (gt - paid);
    }, 0);

    // Oldest unpaid
    const oldest = [...outstanding].sort((a, b) => (a.purchase_date || '') < (b.purchase_date || '') ? -1 : 1)[0];

    const message = `${outstanding.length} supplier${outstanding.length > 1 ? 's' : ''} have outstanding balances totalling ${totalBalance.toLocaleString()} ETB. Oldest unpaid: ${oldest.supplier_name} since ${oldest.purchase_date || '—'}.`;

    await Promise.all(
      supervisors.map(u =>
        base44.asServiceRole.entities.Notification.create({
          recipient_email: u.email,
          type: 'weekly_payment_summary',
          title: `📋 Weekly Payment Summary`,
          message,
          link_path: '/purchase-registration',
          link_label: 'View Purchases',
          severity: 'info',
          is_read: false,
        }).catch(() => {})
      )
    );

    return Response.json({ sent: supervisors.length, outstanding: outstanding.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});