import { AccountList } from "../../components/accounts/list";
import { CutoverNoticeBanner } from "../../components/cutover/cutover-banner";

export default function AccountsPage() {
  return (
    <>
      <CutoverNoticeBanner routeName="Accounts" />
      <AccountList />
    </>
  );
}
