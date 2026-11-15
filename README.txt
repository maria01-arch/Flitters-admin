FLITTERS ADMIN: Batch 2 (strikes + help requests) + Phase 0 fixes
Copy these files into the SAME paths in your admin project (replace). Nothing else.
After deploying: Team -> Roles -> tick the new permissions for the roles that need them:
  strikes.issue, strikes.review, tickets.view, tickets.reply
(Owner roles with all access (*) already have them.)
Database: run 03_account_health_help.sql in Supabase first.
