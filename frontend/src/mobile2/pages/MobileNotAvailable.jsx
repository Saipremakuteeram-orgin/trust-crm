import { useLocation } from "react-router-dom";
import MobileShell from "../MobileShell";
import DeepLinkCard from "../components/DeepLinkCard";
import { getDeepLinkHref } from "../components/MobileNotAvailable";

export default function MobileNotAvailable() {
  const { pathname } = useLocation();
  const href = getDeepLinkHref(pathname);
  return (
    <MobileShell title="Not available" showBack>
      <div className="px-4 pt-6">
        <DeepLinkCard href={href} reason="This screen is designed for a larger screen. Open the desktop version to continue." />
      </div>
    </MobileShell>
  );
}
