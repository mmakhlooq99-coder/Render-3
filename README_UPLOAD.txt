OUTCOME DROPDOWN + FEEDBACK BOX
Options: Resigned | Prospect | Using Another MID | Sijil Close or Deleted

Upload these 7 files into the "src" folder on GitHub (same folder as server.js), replacing the old ones:
  db.js, queries.js, api.js, app-rm.js, app-admin.js, app-explore.js, explore-api.js

Your data is safe: db.js only ADDS one new empty column (feedback_category) to the merchants table.
Nothing is deleted or rewritten; existing feedback, merchants, users and snapshots stay as they are.
Render's disk (/var/data) is not touched by a redeploy.
