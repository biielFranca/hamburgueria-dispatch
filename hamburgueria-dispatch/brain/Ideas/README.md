# Ideas

Product ideas, technical opportunities, experiments, future improvements, and concepts not yet finalized.

## Rules
- One main idea per file when possible.
- Link to related plans, tasks, and decisions.
- Promote mature ideas into project or plan notes.

## Current Ideas

### Mobile Companion App for Drivers
Allow drivers to receive dispatch notifications and update delivery status from their phones. Would feed GPS location back to the dispatch map. Requires separate React Native or PWA build.

### Multi-Store Support
Currently each deployment serves one store. A SaaS model would allow one Supabase project to serve multiple stores with full isolation. Key change: all RLS policies already use `store_id` — the DB schema supports this.

### Automated Dispatch (No Operator Approval)
For simple stores with few orders, the system could auto-accept suggestions without operator review. Add a store setting toggle for "auto-dispatch mode" with configurable rules (min driver confidence, max order age, etc.).

### Delivery ETA Tracking
Show customers estimated delivery time based on real routing data. Currently ETAs come from platforms — could augment with Route Engine data for own-logistics orders.
