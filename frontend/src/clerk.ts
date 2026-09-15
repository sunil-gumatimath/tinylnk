import { useAuth as useClerkAuth } from "@clerk/react";

/** True when a Clerk publishable key is configured at build time. */
export const CLERK_ENABLED = Boolean(
	import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

/**
 * Clerk's own UI (Sign In modal, user popover, UserButton) does not inherit the
 * app's AntD theme, so it has to be told. Values mirror the light/dark palettes
 * in `theme.ts` / `index.css`; `@clerk/themes` is intentionally not a dependency.
 */
export function getClerkAppearance(isDark: boolean) {
	return {
		variables: {
			colorPrimary: "#1d4ed8",
			colorBackground: isDark ? "#1e293b" : "#fffdf8",
			colorText: isDark ? "#e2e8f0" : "#14213d",
			colorTextSecondary: isDark ? "#94a3b8" : "#5b6475",
			colorInputBackground: isDark ? "#1e293b" : "#fffdf8",
			colorInputText: isDark ? "#e2e8f0" : "#14213d",
			colorNeutral: isDark ? "#e2e8f0" : "#14213d",
			colorDanger: "#dc2626",
			colorSuccess: "#059669",
			colorWarning: "#d97706",
			fontFamily: "'Manrope', 'Segoe UI', sans-serif",
			borderRadius: "14px",
		},
	};
}

export interface AppAuth {
	isSignedIn: boolean | undefined;
	getToken: () => Promise<string | null>;
}

/**
 * Clerk's useAuth when available, otherwise a signed-out stub.
 * Lets the app boot and run without Clerk configured.
 */
export function useAppAuth(): AppAuth {
	if (!CLERK_ENABLED) {
		return { isSignedIn: false, getToken: async () => null };
	}
	try {
		// CLERK_ENABLED is a build-time constant, so this call order is
		// stable across renders despite the early return above.
		// eslint-disable-next-line react-hooks/rules-of-hooks
		const { isSignedIn, getToken } = useClerkAuth();
		return {
			isSignedIn,
			getToken: async () => (await getToken()) ?? null,
		};
	} catch {
		return { isSignedIn: false, getToken: async () => null };
	}
}