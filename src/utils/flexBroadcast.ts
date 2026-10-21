export function buildShiftBroadcast(o: { location: string; shift: string; count: number; rate?: number; day: string }): string {
  const lines = [
    `*Flex staff needed — ${o.day}*`,
    `Branch: ${o.location}`,
    `Shift: ${o.shift}`,
    `People needed: ${o.count}`,
  ];
  if (o.rate) lines.push(`Pay: Rs. ${o.rate} per shift`);
  lines.push('', 'Reply YES with your name to take a spot.');
  return lines.join('\n');
}

/** WhatsApp payment receipt for a single flex shift. */
export function buildSettlementReceipt(o: {
  name: string; date: string; location: string; shift?: string;
  inTime?: string; outTime?: string; amount: number; method: string; receiptNo: string;
}): string {
  const lines = [
    `*Payment receipt — ${o.receiptNo}*`,
    `Name: ${o.name}`,
    `Date: ${o.date}`,
    `Branch: ${o.location}`,
  ];
  if (o.shift) lines.push(`Shift: ${o.shift}`);
  if (o.inTime || o.outTime) lines.push(`IN ${o.inTime || '--'} · OUT ${o.outTime || '--'}`);
  lines.push(`*Paid: Rs. ${Math.round(o.amount).toLocaleString('en-IN')}* (${o.method})`, '', 'Thank you for working with us.');
  return lines.join('\n');
}
