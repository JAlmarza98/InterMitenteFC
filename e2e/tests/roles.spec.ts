import { test, expect } from "@playwright/test";
import { ADMIN_EMAIL, ADMIN_PASSWORD } from "../helpers/env";

test("a non-admin is bounced away from an admin-only route", async ({ page }) => {
  const email = `e2e-member-${Date.now()}@example.com`;
  const password = "supersecret1";

  // Register, then approve via the admin so we end up with a plain
  // "member" account (the default role on approval).
  await page.goto("/register");
  await page.getByLabel("Nombre").fill("Plain Member");
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
  await row.getByRole("button", { name: "Aprobar" }).click();
  await page.getByRole("button", { name: "Cerrar sesión" }).click();

  // Log back in as the now-approved member and try an admin-only route
  // directly — roleGuard should bounce them home, not just hide the link.
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL("/");

  await page.goto("/admin/users");
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: "Aprobación de usuarios" })).toHaveCount(0);
});
