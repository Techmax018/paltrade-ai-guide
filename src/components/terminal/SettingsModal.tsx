import { useEffect, useState } from "react";
import { X, KeyRound, ShieldCheck } from "lucide-react";
import type { AccountType } from "@/lib/derivApi";

export interface SettingsValues {
  appId: string;
  token: string;
  accountType: AccountType;
}

export function SettingsModal({
  open,
  values,
  onClose,
  onSave,
}: {
  open: boolean;
  values: SettingsValues;
  onClose: () => void;
  onSave: (v: SettingsValues) => void;
}) {
  const [appId, setAppId] = useState(values.appId);
  const [token, setToken] = useState(values.token);
  const [accountType, setAccountType] = useState<AccountType>(values.accountType);

  // Sync from props each time the modal opens so stale state is never shown
  useEffect(() => {
    if (open) {
      setAppId(values.appId);
      setToken(values.token);
      setAccountType(values.accountType);
    }
  }, [open, values.appId, values.token, values.accountType]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/80 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="w-full max-w-lg rounded-t-2xl border border-border bg-card/90 p-6 shadow-card backdrop-blur sm:rounded-2xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold">API & Account Settings</h2>
            <p className="mt-1 text-xs text-muted-foreground">Deriv WebSocket credentials for this session.</p>
          </div>
          <button onClick={onClose} aria-label="Close settings" className="rounded-md p-1 text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Deriv App ID</span>
            <input
              value={appId}
              onChange={(e) => setAppId(e.target.value)}
              placeholder="e.g. 1089"
              className="mt-1.5 w-full rounded-md bg-input px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Deriv API Token</span>
            <div className="relative mt-1.5">
              <KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Read + Trade scoped token"
                className="w-full rounded-md bg-input py-2 pl-9 pr-3 font-mono text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </label>

          <div>
            <span className="text-xs font-medium text-muted-foreground">Account type</span>
            <div className="mt-1.5 grid grid-cols-2 gap-2 rounded-lg bg-input p-1">
              {(["demo", "real"] as AccountType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setAccountType(t)}
                  className={`rounded-md px-3 py-2 text-sm font-semibold capitalize transition-colors ${
                    accountType === t ? "bg-signal/20 text-signal" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t} account
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-border bg-background/40 p-3 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-profit" />
            <span>Credentials stay in this browser session only and are never sent to PalTrade servers.</span>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm hover:bg-background">
            Cancel
          </button>
          <button
            onClick={() => onSave({ appId, token, accountType })}
            className="rounded-md bg-signal px-4 py-2 text-sm font-semibold text-background hover:opacity-90"
          >
            Save & Connect
          </button>
        </div>
      </div>
    </div>
  );
}
