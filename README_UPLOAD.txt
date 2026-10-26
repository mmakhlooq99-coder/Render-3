ALL UPDATES IN ONE PACKAGE (replaces the earlier zips)
Upload ALL 13 .js files into the "src" folder on GitHub (same folder as server.js), replacing old ones:
  NEW:     duplicates-api.js, app-duplicates.js
  CHANGED: app-tracking.js, server.js, pages.js, layout.js, db.js, queries.js, api.js, app-rm.js, app-admin.js, app-explore.js, explore-api.js

What you get:
  - Outcome dropdown + feedback box (Resigned / Prospect / Using Another MID / Sijil Close or Deleted / Call back / No Response)
  - Outcome filter + search (RM page and Admin > All Merchants)
  - Explore & Download Feedback page (CSV includes Outcome)
  - Admin > Duplicate MIDs: find duplicates, see every detail (name, contacts, rate, feedback),
    delete one copy, keep-suggested per MID, or clean all (backup CSV downloads first)

Data safety: the only database change is ONE new empty column (feedback_category). Nothing is deleted on deploy.
Duplicates are only deleted when an admin clicks Delete / Clean and confirms.

AUTO-DELETE ON UPLOAD (new):
  Whenever you upload a weekly list or a Tracking snapshot, repeated MIDs inside that file are removed automatically.
  The most complete copy is kept (tracking: the highest value). The upload result tells you how many were removed.
  Rows with no MID are never removed. Older, already-saved data is not touched (use Admin > Duplicate MIDs for that).
