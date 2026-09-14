import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    sequence: { concurrent: false },
    env: {
      NODE_ENV: "test",
      INITIAL_ADMIN_USERNAME: "admin",
      INITIAL_ADMIN_PASSWORD: "ChangeMe123!",
      PUBLIC_BASE_URL: "https://report.example.com",
      PUBLIC_HOSTNAME: "report.example.com",
      SMTP_HOST: "",
      DATA_DIR: "./data-test"
    }
  }
});
