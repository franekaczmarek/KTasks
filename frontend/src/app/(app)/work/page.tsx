import { Suspense } from "react";

import { WorkView } from "./work-view";

export default function WorkPage() {
  return (
    <Suspense>
      <WorkView />
    </Suspense>
  );
}
