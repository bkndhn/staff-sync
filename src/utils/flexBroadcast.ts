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
