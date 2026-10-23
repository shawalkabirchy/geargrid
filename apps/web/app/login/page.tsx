import { connection } from "next/server";
import { redirect } from "next/navigation";
import { authMode, currentUser } from "../../src/web/auth";
import { pageContext } from "../../src/web/page-context";
import { Mark } from "../mark";
import { LoginForm } from "./login-form";

// The login page (look: DokaanBondhu spec D207): the shop's name on the indigo frame beside the form; on a phone the
// frame sits above it.

export default async function LoginPage() {
  await connection(); // the login settings are read when the page is asked for, never at build time
  const mode = authMode();
  if (mode !== "none" && (await currentUser())) redirect("/");
  const { t, settings } = await pageContext();
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="relative flex flex-col justify-between gap-10 overflow-hidden bg-frame px-6 py-8 text-white sm:px-12 lg:py-14">
        <div className="flex items-center gap-3">
          <Mark />
          <span className="text-lg font-semibold">{t("app.name")}</span>
        </div>
        <div className="relative z-10 max-w-md">
          <h1 className="text-4xl leading-tight font-bold sm:text-5xl">{settings.shopName}</h1>
          <p className="mt-3 text-lg text-frame-muted">{t("login.tagline")}</p>
        </div>
        <Mark dim className="pointer-events-none absolute -top-20 -right-20 hidden size-80 lg:block" />
      </section>
      <section className="flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-sm">
          {mode === "none" ? (
            <p role="alert" className="rounded-xl bg-amber-50 p-4 text-amber-900">
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
        </div>
      </section>
    </main>
  );
}
