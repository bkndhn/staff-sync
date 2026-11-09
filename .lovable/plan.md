# Payout test mode

## Goal
Let an admin run a payout batch marked "Test", including trying Paid with and without a UTR, without touching real salary records or sending staff alerts. Real batches keep working exactly as they do now.

## What the admin sees
- A "Test batch" switch when creating a batch, off by default.
- Test batches show a clear TEST badge, and the bank file name gets a `TEST_` prefix with a "TEST - DO NOT UPLOAD" note inside.
- Marking a test line Paid:
  - With no UTR, it is refused with the same message real batches give.
  - With a UTR, the line shows Paid (test). No salary is marked paid, no payslip or alert goes out, and nothing shows in the staff portal.
- Test lines don't count toward the "already in another batch this month" check, so a test never blocks a real payout. Real lines still block each other.
- Admins can delete a test batch once they're done.

## Production stays the same
- Real batches go through the same steps, approval rules and alerts as today.
- The test switch can only be set when a batch is created. A test batch can't become a real one later, and a real one can't become a test.

## How results will be reported
- **Observed:** database checks on a throwaway test batch (blank UTR refused, UTR accepted, no salary record written, no alert sent, real duplicate rule still in force), plus automated tests of the rules.
- **Unverified until you click through:** the screen steps (switch, badge, buttons). I can't sign in to your app, so I'll give you a short click-through.

## Technical details
- Migration: add `is_test boolean not null default false` to `payout_batches` and `payout_batch_items`. A guard trigger blocks changes to `is_test` after insert, copies it from the batch onto each item, and the unique active index becomes `(staff_id, month, year) WHERE active AND NOT is_test`. Test batches can be deleted in any status; real ones keep current rules.
- Add `is_test` to the create list in writableFields.ts. data-api blocks updates to it.
- `payoutBatchService.confirmLine`: skip `markAsPaidAndNotify` when `batch.is_test`. `create` passes `isTest`. Add a `deleteTestBatch` that only works on test batches.
- `payoutBatch.ts`: pure helper `shouldNotifyOnPaid(batch)` returns `!is_test`, plus unit tests (test batch never notifies, UTR still required, test lines don't block real duplicates).
- PayoutBatchPanel: switch, badge, file name prefix, delete button for test batches.
- Rollback-safe DO-block check for the database rules, then deploy data-api.

## "Other required features"
This plan doesn't cover those yet. Tell me which features you mean (for example, the launch checklist you uploaded: 404 page, privacy and terms pages, sitemap) and I'll plan them next.
