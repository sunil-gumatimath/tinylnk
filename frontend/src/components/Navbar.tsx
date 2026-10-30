import { useState, useEffect } from "react";
import { Github, Menu, Moon, Sun, X } from "lucide-react";
import { SignInButton, UserButton } from "@clerk/react";
import { Spin } from "antd";
import { CLERK_ENABLED } from "../clerk";
import { Logo } from "./Logo";

interface NavbarProps {
  isDark: boolean;
  onToggleTheme: () => void;
  isSignedIn?: boolean;
  authLoading?: boolean;
}

export function Navbar({
  isDark,
  onToggleTheme,
  isSignedIn = false,
  authLoading = false,
}: NavbarProps) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header className={`app-header ${scrolled ? "scrolled" : ""}`}>
      <div className="header-inner">
        {/* Brand / Logo */}
        <a href="/" className="navbar-brand-group" aria-label="tinylnk home">
          <Logo size="md" showBadge />
        </a>

        {/* Center Nav Links */}
        <nav className="navbar-nav-links" aria-label="Page sections">
          <a href="#shorten-form" className="navbar-nav-link">Create</a>
          <a href="#dashboard" className="navbar-nav-link">Dashboard</a>
          <a href="#features" className="navbar-nav-link">Capabilities</a>
        </nav>

        {/* Right side actions */}
        <div className="navbar-actions">
          <div className="navbar-tool-group">
            <a
              href="https://github.com/sunil-gumatimath/tinylnk"
              target="_blank"
              rel="noopener noreferrer"
              className="navbar-icon-btn"
              aria-label="GitHub Repository"
              title="GitHub Repository"
            >
              <Github size={16} />
            </a>
            <button
              type="button"
              className="navbar-icon-btn"
              onClick={onToggleTheme}
              aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
              title={isDark ? "Switch to light theme" : "Switch to dark theme"}
            >
              {isDark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>

          {/* CTA / Auth */}
          {authLoading ? (
            <div className="navbar-auth-spinner">
              <Spin size="small" />
            </div>
          ) : isSignedIn ? (
            <div className="navbar-auth-user">
              <UserButton />
            </div>
          ) : CLERK_ENABLED ? (
            <SignInButton mode="modal">
              <button type="button" className="navbar-cta-btn">
                Sign In
              </button>
            </SignInButton>
          ) : (
            <a href="#shorten-form" className="navbar-cta-btn">
              Get Started
            </a>
          )}

          {/* Mobile hamburger toggle */}
          <button
            type="button"
            className="navbar-mobile-toggle"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="navbar-mobile-drawer">
          <a
            href="#shorten-form"
            onClick={() => setMobileMenuOpen(false)}
          >
            Create
          </a>
          <a
            href="#dashboard"
            onClick={() => setMobileMenuOpen(false)}
          >
            Dashboard
          </a>
          <a
            href="#features"
            onClick={() => setMobileMenuOpen(false)}
          >
            Capabilities
          </a>

          <div className="navbar-mobile-tools">
            <a
              href="https://github.com/sunil-gumatimath/tinylnk"
              target="_blank"
              rel="noopener noreferrer"
              className="navbar-icon-btn"
              aria-label="GitHub Repository"
            >
              <Github size={18} />
            </a>
            <button
              type="button"
              className="navbar-icon-btn"
              onClick={() => {
                onToggleTheme();
                setMobileMenuOpen(false);
              }}
              aria-label="Toggle theme"
            >
              {isDark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>

          {!isSignedIn && (
            CLERK_ENABLED ? (
              <SignInButton mode="modal">
                <button
                  type="button"
                  className="navbar-cta-btn navbar-cta-btn--mobile"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Sign In
                </button>
              </SignInButton>
            ) : (
              <a
                href="#shorten-form"
                className="navbar-cta-btn navbar-cta-btn--mobile"
                onClick={() => setMobileMenuOpen(false)}
              >
                Get Started
              </a>
            )
          )}
        </div>
      )}
    </header>
  );
}
