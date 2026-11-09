import { AccountDetail } from "../../../components/accounts/detail";
import { CutoverNoticeBanner } from "../../../components/cutover/cutover-banner";

export default async function AccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <>
      <CutoverNoticeBanner routeName="Account Details" />
      <AccountDetail accountId={id} />
    </>
  );
}
