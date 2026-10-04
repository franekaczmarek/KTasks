import { execFileSync } from "node:child_process";
import path from "node:path";

/** Remove all "[e2e]" issues (and their files) created during the run. */
export default function cleanup() {
  const backend = path.resolve(__dirname, "../../backend");
  const out = execFileSync(path.join(backend, ".venv/Scripts/python"), ["scripts/cleanup_test_data.py", "[e2e]", "e2e+"], {
    cwd: backend,
  });
  console.log(out.toString().trim());
}
