import { test, expect } from "@playwright/test";
import { ADMIN_EMAIL, ADMIN_PASSWORD } from "../helpers/env";

test("admin rejects a pending user, who then still cannot log in", async ({ page }) => {
  const email = `e2e-rejected-${Date.now()}@example.com`;
  const password = "supersecret1";

  await page.goto("/register");
  await page.getByLabel("Nombre").fill("Rejected Person");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Registrarme" }).click();

  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Contraseña").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL("/");

  await page.goto("/admin/users");
  const row = page.getByRole("row", { name: new RegExp(email) });
  await row.getByRole("button", { name: "Rechazar" }).click();
  await expect(row.getByRole("button", { name: "Rechazar" })).toHaveCount(0);

  await page.getByRole("button", { name: "Cerrar sesión" }).click();

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("Email o contraseña incorrectos.")).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});
