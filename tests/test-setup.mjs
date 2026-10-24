// TEST-ONLY bootstrap, loaded via `node --import`:
//   - registers the "@/" alias loader above
// Run configuration lives in package.json's "test" script:
//   node --env-file-if-exists=.env.local --conditions=react-server \
//        --import ./tests/test-setup.mjs --test tests/
//
// The `react-server` condition is what lets tests import the server-only
// modules (the server-only package exports an empty file under that
// condition). It changes NOTHING about the running application — the app
// itself never runs with this flag outside `npm test`.
import { register } from "node:module";

register(new URL("./alias-loader.mjs", import.meta.url));
