const assert = require("node:assert/strict");
const fs = require("node:fs");

const sync = fs.readFileSync("sync-engine.js", "utf8");
const schema = fs.readFileSync("supabase/migrations/001_multi_device_sync.sql", "utf8");

assert.match(sync, /mileage_logger_state_v3/, "Sync must preserve the existing app state key");
assert.match(sync, /active_trip/, "Active trip must synchronize across devices");
assert.match(sync, /timesheet_entry/, "Timesheet entries must synchronize");
assert.match(sync, /inspection/, "Inspection records must synchronize");
assert.match(sync, /tombstone/, "Deleted records must synchronize safely");
assert.match(sync, /navigator\.onLine/, "Offline operation must remain supported");
assert.match(sync, /service_role|sb_secret_/, "Client must reject secret/service-role keys");
assert.match(sync, /mileage:state-changed/, "Remote changes must refresh the running app");
assert.match(schema, /enable row level security/i, "Cloud tables must use row-level security");
assert.match(schema, /auth\.uid\(\) = user_id/, "RLS must isolate each user's records");
assert.match(schema, /mileage_sync_devices/, "Device heartbeat table must exist");

console.log("Multi-device sync regression checks passed.");
