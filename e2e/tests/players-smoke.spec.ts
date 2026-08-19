import { test, expect } from "@playwright/test";
import { ADMIN_EMAIL, ADMIN_PASSWORD } from "../helpers/env";

test.beforeEach(async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Contraseña").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL("/");
});

test("admin creates a player and sees it in the squad list", async ({ page }) => {
  const firstName = "Leo";
  const lastName = `Playwright-${Date.now()}`;

  await page.goto("/players");
  await page.getByRole("button", { name: "Añadir jugador" }).click();

  await page.getByLabel("Nombre").fill(firstName);
  await page.getByLabel("Apellidos").fill(lastName);
  await page.getByLabel("Dorsal").fill("9");
  await page.getByRole("button", { name: "Guardar" }).click();

  await expect(page.getByRole("cell", { name: `${firstName} ${lastName}`, exact: true })).toBeVisible();
});

test("admin edits a player and deactivates them", async ({ page }) => {
  const firstName = "Sergio";
  const lastName = `Playwright-${Date.now()}`;

  await page.goto("/players");
  await page.getByRole("button", { name: "Añadir jugador" }).click();
  await page.getByLabel("Nombre").fill(firstName);
  await page.getByLabel("Apellidos").fill(lastName);
  await page.getByRole("button", { name: "Guardar" }).click();

  const row = page.getByRole("row", { name: new RegExp(`${firstName} ${lastName}`) });
  await expect(row).toBeVisible();

  await row.getByRole("button", { name: "Editar" }).click();
  await page.getByLabel("Dorsal").fill("4");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(row.getByRole("cell", { name: "4", exact: true })).toBeVisible();

  // Deactivating reloads the (active-only, by default) list, so the row
  // disappears immediately rather than flipping to an "Inactivo" chip.
  await row.getByRole("switch", { name: `Desactivar a ${firstName} ${lastName}` }).click();
  await expect(page.getByRole("cell", { name: `${firstName} ${lastName}`, exact: true })).toHaveCount(0);

  // It's still there when inactive players are shown.
  await page.getByRole("button", { name: "Mostrar inactivos" }).click();
  await expect(page.getByRole("cell", { name: `${firstName} ${lastName}`, exact: true })).toBeVisible();
});
