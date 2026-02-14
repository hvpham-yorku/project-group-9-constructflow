import "@testing-library/jest-dom";
import { vi } from "vitest";

// Mock Firebase Auth
vi.mock("./firebase", () => ({
  auth: {
    currentUser: null,
  },
}));
