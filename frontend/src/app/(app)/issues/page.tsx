import { Suspense } from "react";

import { IssuesView } from "./issues-view";

export default function IssuesPage() {
  return (
    <Suspense>
      <IssuesView />
    </Suspense>
  );
}
