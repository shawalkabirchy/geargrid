import { connection } from "next/server";
import { redirect } from "next/navigation";
import { authMode, currentUser } from "../../src/web/auth";
import { pageContext } from "../../src/web/page-context";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  await connection(); // the login settings are read when the page is asked for, never at build time
  const mode = authMode();
  if (mode !== "none" && (await currentUser())) redirect("/");
  const { t, settings } = await pageContext();
  return (
    <main className="mx-auto mt-16 max-w-sm px-4">
      <h1 className="text-2xl font-bold text-brand-ink">{settings.shopName}</h1>
      <p className="mb-6 text-stone-600">{t("app.name")}</p>
      {mode === "none" ? (
        <p role="alert" className="rounded-lg bg-amber-50 p-4 text-amber-900">
          {t("login.not_set_up")}
        </p>
      ) : (
        <LoginForm
          labels={{
            title: t("login.title"),
            email: t("login.email"),
            password: t("login.password"),
            submit: t("login.submit"),
            failed: t("login.failed"),
            too_many: t("login.too_many"),
          }}
        />
      )}
    </main>
  );
}
