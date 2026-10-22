import { pageContext } from "../../../../src/web/page-context";
import { PageHead } from "../../ui";
import { PartForm } from "../part-form";

export default async function NewPartPage() {
  const { t } = await pageContext();
  return (
    <div>
      <PageHead title={t("part.new_title")} />
      <PartForm />
    </div>
  );
}
