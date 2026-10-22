import { notFound } from "next/navigation";
import { database } from "../../../../../src/server/db";
import { partDetail } from "../../../../../src/server/services/catalog-reads";
import { pageContext } from "../../../../../src/web/page-context";
import { PageHead } from "../../../ui";
import { PartForm } from "../../part-form";

export default async function EditPartPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = /^[0-9a-f-]{36}$/i.test(id) ? await partDetail(database(), id) : null;
  if (!detail) notFound();
  const { t } = await pageContext();
  return (
    <div>
      <PageHead title={`${t("part.edit_title")}: ${detail.part.name_en}`} />
      <PartForm part={detail.part} />
    </div>
  );
}
