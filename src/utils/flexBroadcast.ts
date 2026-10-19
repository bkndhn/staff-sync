export function buildShiftBroadcast(o: { location: string; shift: string; count: number; rate?: number; day: string }): string {
  return [
    `*Flex staff needed — ${o.day}*`,
    `Branch: ${o.location}`,
    `Shift: ${o.shift}`,
    `People needed: ${o.count}`,
    o.rate ? `Pay: Rs. ${o.rate} per shift` : '',
    '',
    'Reply YES with your name to take a spot.',
  ].filter((l, i, a) => l !== '' || (i > 0 && a[i - 1] !== '')).join('\n');
}
