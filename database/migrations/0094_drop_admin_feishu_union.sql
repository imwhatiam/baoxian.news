-- Sign-in is password-only; no federated identity column is read.
ALTER TABLE admin_users DROP COLUMN IF EXISTS feishu_union_id;
