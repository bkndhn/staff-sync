import { describe, it, expect } from 'vitest';
import { generatePettyCashPdfDoc } from '../utils/pettyCashExport';

// Real jsPDF run (no mocks): a sheet with receipt photos must get photo pages appended.
const JPG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAA8ACgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDkKKKK8U/TAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAP/9k=';

const sheet = (photos: number): any => ({
  id: 'TEST_FLEX_PDF', location: 'Godown', date: '2026-10-22', template_type: 'godown', received_amount: 5000,
  staff_meals: [{ staff_id: 'TEST_FLEX_PDF_01', staff_name: 'TEST FLEX PDF 01', designation: 'Helper', staff_type: 'part-time', attendance_status: 'F', amount: 130 }], transport_logistics: [],
  expenses: Array.from({ length: photos }, (_, i) => ({ label: `Tea ${i + 1}`, amount: 1250, voucher_image: JPG })),
});

describe('petty cash PDF receipt photos', () => {
  it('adds one page per two receipt photos', () => {
    const base = generatePettyCashPdfDoc(sheet(0)).getNumberOfPages();
    expect(generatePettyCashPdfDoc(sheet(1)).getNumberOfPages()).toBe(base + 1);
    expect(generatePettyCashPdfDoc(sheet(3)).getNumberOfPages()).toBe(base + 2);
  });
  it('captions each photo with Rs. amount and never the rupee glyph', () => {
    const out = generatePettyCashPdfDoc(sheet(2)).output();
    expect(out).toContain('Receipt 1: Tea 1');
    expect(out).toContain('Rs. 1,250');
    expect(out).not.toContain('(photo could not be added)');
    expect(out).not.toContain('₹');
  });
});
