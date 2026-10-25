import { DeletionReceiptPage } from "../../../components/privacy/deletion-status";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ id?: string | string[] }>;
}) {
  const query = await searchParams;
  const id = typeof query.id === "string" ? query.id : null;
  return <DeletionReceiptPage key={id ?? "unavailable"} id={id} />;
}
