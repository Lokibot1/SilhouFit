import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AuthSplit } from "../../components/auth/AuthSplit";
import { LoginForm } from "../../components/auth/LoginForm";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { useMetaDescription } from "../../hooks/useMetaDescription";
import { peekLoginNotice, takeLoginNotice } from "../../service/loginNotice";

const META_DESCRIPTION =
  "Sign in to KRAL to open your saved fit profile, pick up AR fitting where you left off and shop boutiques online with one secure KRAL account on any device.";

export function LoginPage() {
  useDocumentTitle("Sign in — KRAL");
  useMetaDescription(META_DESCRIPTION);

  const params = useSearchParams()[0];
  // Kept for this visit; the one-shot notice is cleared so a reload or a later sign-out does not repeat it.
  const [notice] = useState(peekLoginNotice);
  useEffect(() => {
    takeLoginNotice();
  }, []);

  return (
    <AuthSplit>
      <LoginForm nextParam={params.get("next")} archived={params.get("archived") === "1"} notice={notice} />
    </AuthSplit>
  );
}
