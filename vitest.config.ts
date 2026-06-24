import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    sequence: { concurrent: false },
    env: {
      NODE_ENV: "test",
      INITIAL_ADMIN_USERNAME: "admin",
      INITIAL_ADMIN_PASSWORD: "ChangeMe123!",
      PUBLIC_HOSTNAME: "report.example.com",
      DATA_DIR: "./data-test"
    }
  }
});
