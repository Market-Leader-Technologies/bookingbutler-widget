import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { resetForTests } from "../src/core/loader";

afterEach(() => {
  cleanup();
  resetForTests();
});
