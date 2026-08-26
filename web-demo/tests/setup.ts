import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Ensure each component test starts with a clean DOM. @testing-library/react's
// auto-cleanup only fires when afterEach is global, but this project runs vitest
// with globals disabled (tests import { describe, test } explicitly), so we
// register cleanup manually here via setupFiles.
afterEach(() => {
  cleanup();
});
