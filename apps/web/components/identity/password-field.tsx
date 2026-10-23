"use client";

import { useId, useState, type ReactNode } from "react";

interface PasswordFieldProps {
  label: string;
  hint: string;
  value: string;
  onChange(value: string): void;
  disabled: boolean;
  autoComplete: "current-password" | "new-password";
  minLength: number;
}

export function PasswordField({
  label,
  hint,
  value,
  onChange,
  disabled,
  autoComplete,
  minLength,
}: PasswordFieldProps): ReactNode {
  const id = useId();
  const [visible, setVisible] = useState(false);
  return (
    <div className="password-field">
      <label htmlFor={id}>{label}</label>
      <div className="password-input">
        <input
          id={id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          minLength={minLength}
          maxLength={128}
          disabled={disabled}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-describedby={`${id}-hint`}
        />
        <button
          type="button"
          className="password-toggle"
          disabled={disabled}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          aria-controls={id}
          onClick={() => setVisible((shown) => !shown)}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
            <circle cx="12" cy="12" r="3" />
            {visible && <path d="m3 3 18 18" />}
          </svg>
        </button>
      </div>
      <span className="field-hint" id={`${id}-hint`}>
        {hint}
      </span>
    </div>
  );
}
