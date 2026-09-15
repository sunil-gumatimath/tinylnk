import type { ReactNode } from "react";
import { ClerkProvider } from "@clerk/react";
import { CLERK_ENABLED, getClerkAppearance } from "../clerk";
import { useTheme } from "../ThemeProvider";

/**
 * Mounts ClerkProvider — deliberately rendered *inside* ThemeProvider (see
 * main.tsx) so Clerk's components follow the app's dark/light theme instead of
 * always showing their default light UI. Self-hosters without a Clerk key get
 * their children unchanged.
 */
export function ClerkShell({ children }: { children: ReactNode }) {
	const { isDark } = useTheme();
	const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as
		| string
		| undefined;

	if (!CLERK_ENABLED || !publishableKey) return <>{children}</>;

	return (
		<ClerkProvider
			publishableKey={publishableKey}
			appearance={getClerkAppearance(isDark)}
		>
			{children}
		</ClerkProvider>
	);
}