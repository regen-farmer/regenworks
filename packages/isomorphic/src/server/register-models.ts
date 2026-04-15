// Side-effect imports that register Mongoose models. Previously lived at the
// top of `__root.tsx` (SSR executed them on every server render); now that
// `__root.tsx` lives in `@rw/frontend` (pure client) these must be loaded from
// a server-only entry point instead. Import this file early in any server-side
// code path that needs any model registered.

import "@rw/db/schemas/activity.ts";
import "@rw/db/schemas/animal.ts";
import "@rw/db/schemas/area.ts";
import "@rw/db/schemas/asset.ts";
import "@rw/db/schemas/budget.ts";
import "@rw/db/schemas/farmflow.ts";
import "@rw/db/schemas/flow.ts";
import "@rw/db/schemas/layer.ts";
import "@rw/db/schemas/log.ts";
import "@rw/db/schemas/note.ts";
import "@rw/db/schemas/nursery.ts";
import "@rw/db/schemas/nurseryproduct.ts";
import "@rw/db/schemas/parcel.ts";
import "@rw/db/schemas/posting.ts";
import "@rw/db/schemas/practice.ts";
import "@rw/db/schemas/project.ts";
import "@rw/db/schemas/rateLimiterIP.ts";
import "@rw/db/schemas/rotation.ts";
import "@rw/db/schemas/row.ts";
import "@rw/db/schemas/saptest.ts";
import "@rw/db/schemas/sequence.ts";
import "@rw/db/schemas/soiltest.ts";
import "@rw/db/schemas/species.ts";
import "@rw/db/schemas/system.ts";
import "@rw/db/schemas/systemflow.ts";
import "@rw/db/schemas/user.ts";
import "@rw/db/schemas/variety.ts";
import "@rw/db/schemas/well.ts";
