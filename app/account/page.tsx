import type { Metadata } from "next";
import AccountForm from "./AccountForm";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AccountPage() {
  return <AccountForm />;
}
