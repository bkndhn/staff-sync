DO $$
DECLARE r jsonb := '{}'::jsonb; t uuid := '00000000-0000-0000-0000-000000000001'; s uuid := '7004e774-fe43-4a60-9885-8d00d2084a23';
  b uuid; b2 uuid; li uuid; td uuid;
  PROCEDURE_ok boolean;
BEGIN
  BEGIN
    INSERT INTO payout_batches(tenant_id,month,year,payee_count,total_amount,created_by) VALUES (t,1,1999,1,1000,'maker') RETURNING id INTO b;
    INSERT INTO payout_batch_items(tenant_id,batch_id,staff_id,month,year,net_amount,bank_account_number,ifsc_code) VALUES (t,b,s,1,1999,1000,'123456789012','HDFC0001234') RETURNING id INTO li;
    -- duplicate line, same staff/month in a second batch
    INSERT INTO payout_batches(tenant_id,month,year,payee_count,total_amount,created_by) VALUES (t,1,1999,1,1000,'maker') RETURNING id INTO b2;
    BEGIN INSERT INTO payout_batch_items(tenant_id,batch_id,staff_id,month,year,net_amount,bank_account_number,ifsc_code) VALUES (t,b2,s,1,1999,1000,'123456789012','HDFC0001234'); r:=r||'{"duplicate_blocked":false}'; EXCEPTION WHEN unique_violation THEN r:=r||'{"duplicate_blocked":true}'; END;
    BEGIN INSERT INTO payout_batch_items(tenant_id,batch_id,staff_id,month,year,net_amount,bank_account_number,ifsc_code) VALUES (t,b2,s,2,1999,10,'12AB','BAD'); r:=r||'{"bad_bank_blocked":false}'; EXCEPTION WHEN others THEN r:=r||'{"bad_bank_blocked":true}'; END;
    BEGIN UPDATE payout_batch_items SET status='Exported' WHERE id=li; r:=r||'{"export_before_approval_blocked":false}'; EXCEPTION WHEN others THEN r:=r||'{"export_before_approval_blocked":true}'; END;
    BEGIN UPDATE payout_batches SET status='Approved',approved_by='maker' WHERE id=b; r:=r||'{"self_approval_blocked":false}'; EXCEPTION WHEN others THEN r:=r||'{"self_approval_blocked":true}'; END;
    UPDATE payout_batches SET status='Approved',approved_by='checker' WHERE id=b; r:=r||'{"other_admin_can_approve":true}';
    BEGIN UPDATE payout_batches SET total_amount=99999 WHERE id=b; r:=r||'{"approved_amount_frozen":false}'; EXCEPTION WHEN others THEN r:=r||'{"approved_amount_frozen":true}'; END;
    BEGIN UPDATE payout_batch_items SET bank_account_number='999999999999' WHERE id=li; r:=r||'{"approved_bank_frozen":false}'; EXCEPTION WHEN others THEN r:=r||'{"approved_bank_frozen":true}'; END;
    UPDATE payout_batches SET status='Exported' WHERE id=b; UPDATE payout_batch_items SET status='Exported' WHERE id=li;
    r:=r||jsonb_build_object('export_left_unpaid',(SELECT status FROM payout_batch_items WHERE id=li)='Exported');
    BEGIN UPDATE payout_batches SET status='Completed' WHERE id=b; r:=r||'{"complete_with_open_lines_blocked":false}'; EXCEPTION WHEN others THEN r:=r||'{"complete_with_open_lines_blocked":true}'; END;
    BEGIN UPDATE payout_batch_items SET status='Paid',utr_ref='  ' WHERE id=li; r:=r||'{"paid_without_utr_blocked":false}'; EXCEPTION WHEN others THEN r:=r||'{"paid_without_utr_blocked":true}'; END;
    UPDATE payout_batch_items SET status='Paid',utr_ref='UTR123TEST' WHERE id=li; r:=r||'{"paid_with_utr_ok":true}';
    BEGIN UPDATE payout_batch_items SET status='Failed' WHERE id=li; r:=r||'{"paid_is_final":false}'; EXCEPTION WHEN others THEN r:=r||'{"paid_is_final":true}'; END;
    UPDATE payout_batches SET status='Completed' WHERE id=b; r:=r||'{"complete_ok":true}';
    -- tax declaration: approved then edited must go back to Submitted
    INSERT INTO tax_declarations(tenant_id,staff_id,fy,regime,items) VALUES (t,s,'1999-00','old','{"sec80c":100000}') RETURNING id INTO td;
    UPDATE tax_declarations SET status='Approved',reviewed_by='mgr' WHERE id=td;
    r:=r||jsonb_build_object('tax_approved',(SELECT status FROM tax_declarations WHERE id=td));
    UPDATE tax_declarations SET items='{"sec80c":150000}' WHERE id=td;
    r:=r||jsonb_build_object('tax_after_edit',(SELECT status FROM tax_declarations WHERE id=td),'tax_reviewer_cleared',(SELECT reviewed_by IS NULL FROM tax_declarations WHERE id=td));
    UPDATE tax_declarations SET status='Rejected',review_notes='need proof' WHERE id=td;
    UPDATE tax_declarations SET items='{"sec80c":120000}' WHERE id=td;
    r:=r||jsonb_build_object('tax_resubmit',(SELECT status FROM tax_declarations WHERE id=td));
    RAISE EXCEPTION 'qa_rollback';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'qa_rollback' THEN r:=r||jsonb_build_object('error',SQLERRM); END IF;
  WHEN others THEN r:=r||jsonb_build_object('error',SQLERRM);
  END;
  INSERT INTO audit_logs(id,tenant_id,action,details,performed_by,timestamp,metadata) VALUES (gen_random_uuid()::text,t,'qa_payout_tax_test','Rolled-back rule test','system',now(),r);
END $$;