import { test, expect } from "@playwright/test";
import { ADMIN_EMAIL, ADMIN_PASSWORD } from "../helpers/env";

test("register, admin approval, then login as the approved user", async ({ page }) => {
  const email = `e2e-user-${Date.now()}@example.com`;
  const password = "supersecret1";

  await page.goto("/register");
  await page.getByLabel("Nombre").fill("E2E User");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Registrarme" }).click();

  // Registration succeeded but the account is pending — trying to log in
  // now must be rejected (the UI shows a generic error either way, but the
  // real signal is that we never leave /login).
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("Email o contraseña incorrectos.")).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);

  // Log in as the admin and approve the new user.
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Contraseña").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL("/");

  await page.goto("/admin/users");
  const row = page.getByRole("row", { name: new RegExp(email) });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Aprobar" }).click();
  await expect(row.getByRole("button", { name: "Aprobar" })).toHaveCount(0);

  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL("/login");

  // Log back in as the newly approved user.
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL("/");
});
