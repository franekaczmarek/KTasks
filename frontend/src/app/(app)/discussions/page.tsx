import { Suspense } from "react";

import { DiscussionsView } from "./discussions-view";

export default function DiscussionsPage() {
  return (
    <Suspense>
      <DiscussionsView />
    </Suspense>
  );
}
