"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  Menu,
  Moon,
  Sun,
  ArrowUpRight,
  X,
  Cloud,
  HardDrive,
} from "lucide-react";
import { useLearning } from "./provider";
import { Button } from "./ui/button";
import { AppSidebar, navigationGroups } from "./app-sidebar";
function subscribeMobile(callback: () => void) {
  const query = window.matchMedia("(max-width: 767px)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { bootstrap, preferences, updatePreferences } = useLearning();
  const [open, setOpen] = useState(false);
  const sidebar = useRef<HTMLElement>(null);
  const mobile = useSyncExternalStore(
    subscribeMobile,
    () => window.matchMedia("(max-width: 767px)").matches,
    () => false,
  );
  useEffect(() => {
    if (!open || !mobile) return;
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () =>
      Array.from(
        sidebar.current?.querySelectorAll<HTMLElement>(
          "a[href], button:not([disabled])",
        ) ?? [],
      );
    focusable()[0]?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      }
      if (event.key !== "Tab") return;
      const nodes = focusable();
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [open, mobile]);
  const all = navigationGroups.flatMap((group) => group.items);
  const title =
    all.find((v) => pathname.startsWith(v.href.split("#")[0]))?.label ??
    "Hành trình học tập";
  return (
    <div
      className={`app-layout${pathname === "/flashcards" ? " study-shell" : ""}`}
    >
      <a className="skip-link" href="#main-content">
        Đi đến nội dung
      </a>
      {open && (
        <button
          className="nav-backdrop"
          aria-label="Đóng menu"
          onClick={() => setOpen(false)}
        />
      )}
      <AppSidebar
        sidebarRef={sidebar}
        pathname={pathname}
        mobile={mobile}
        open={open}
        onClose={() => setOpen(false)}
      />
      <div className="app-column">
        <header className="topbar">
          <div className="topbar-title">
            <Button
              variant="ghost"
              size="icon"
              className="mobile-menu"
              aria-label="Mở menu"
              aria-expanded={open}
              onClick={() => setOpen(true)}
            >
              {open ? <X size={21} /> : <Menu size={21} />}
            </Button>
            <span>Không gian học tập</span>
            <span className="breadcrumb-slash">/</span>
            <strong>{title}</strong>
          </div>
          <div className="topbar-actions">
            <span className="save-indicator">
              {bootstrap.mode === "cloud" ? (
                <Cloud size={14} />
              ) : (
                <HardDrive size={14} />
              )}
              <span>
                {bootstrap.mode === "cloud"
                  ? "Đồng bộ tài khoản"
                  : "Bản thử cục bộ"}
              </span>
            </span>
            <span className="topbar-divider" />
            <Button
              variant="ghost"
              size="icon"
              aria-label={
                preferences.theme === "dark"
                  ? "Chuyển sang giao diện sáng"
                  : "Chuyển sang giao diện tối"
              }
              onClick={() => {
                const dark = document.documentElement.dataset.theme === "dark";
                void updatePreferences({
                  ...preferences,
                  theme: dark ? "light" : "dark",
                });
              }}
            >
              <Sun className="sun-icon" size={18} />
              <Moon className="moon-icon" size={18} />
            </Button>
            <Link
              href="/settings"
              className="avatar avatar-sm"
              aria-label="Cài đặt tài khoản"
            >
              {bootstrap.user?.name.slice(0, 1).toUpperCase() ?? "学"}
            </Link>
          </div>
        </header>
        {bootstrap.mode === "trial" && (
          <div className="trial-banner">
            <span className="status-dot" />
            Bạn đang dùng bản thử. Tiến độ chỉ lưu trên trình duyệt này.
            <Link href="/setup">
              Kết nối tài khoản <ArrowUpRight size={13} />
            </Link>
          </div>
        )}
        <main id="main-content" className="main-content">
          {children}
        </main>
        <footer className="app-footer">
          <span>Học từng chút. Tiến xa hơn.</span>
          <Link href="/sources">
            HSK 3.0 · Chuẩn năng lực 2021 <ArrowUpRight size={12} />
          </Link>
        </footer>
      </div>
    </div>
  );
}
