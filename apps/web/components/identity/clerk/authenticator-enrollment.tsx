"use client";

import { useEffect, useState, type ReactNode } from "react";
import { toDataURL } from "qrcode";

export function AuthenticatorEnrollment({
  secret,
  uri,
}: {
  secret: string;
  uri: string | null;
}): ReactNode {
  const [image, setImage] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    let current = true;
    async function prepare() {
      try {
        if (!uri || uri.length > 2048) throw new Error();
        const address = new URL(uri);
        if (
          address.protocol !== "otpauth:" ||
          address.hostname !== "totp" ||
          address.searchParams.get("secret") !== secret
        )
          throw new Error();
        const value = await toDataURL(uri, {
          width: 200,
          margin: 2,
          errorCorrectionLevel: "M",
        });
        if (current) setImage(value);
      } catch {
        if (current) setUnavailable(true);
      }
    }
    void prepare();
    return () => {
      current = false;
    };
  }, [secret, uri]);
  return (
    <div className="enrollment">
      <p className="privacy-label">
        Private setup · Do not share this QR code or key.
      </p>
      {image ? (
        <img
          className="qr-code"
          src={image}
          alt="Scan this private setup QR code with your authenticator app"
          width={200}
          height={200}
        />
      ) : (
        <p role="status">
          {unavailable
            ? "QR setup is unavailable. Use the private manual setup key below."
            : "Preparing your private QR code…"}
        </p>
      )}
      <details>
        <summary>Enter a setup key instead</summary>
        <p>
          Choose manual setup in your authenticator app. Add The Family Fund App
          and enter this key.
        </p>
        <code className="setup-secret">{secret}</code>
      </details>
    </div>
  );
}
