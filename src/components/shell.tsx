"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  House,
  BookOpen,
  Layers3,
  Shapes,
  PanelsTopLeft,
  Sparkles,
  CalendarCheck2,
  FolderHeart,
  ChartNoAxesCombined,
  Settings2,
  PanelLeftClose,
  Menu,
  Moon,
  Sun,
  ArrowUpRight,
  X,
  Leaf,
  LogOut,
  Cloud,
  HardDrive,
} from "lucide-react";
import { Brand } from "./brand";
import { useLearning } from "./provider";
import { Button } from "./ui/button";
import { logout } from "@/app/actions";
const main = [
  { href: "/dashboard", label: "Tổng quan", icon: House },
  { href: "/vocabulary", label: "Thư viện từ vựng", icon: BookOpen },
  { href: "/bands", label: "HSK Bands", icon: Layers3 },
  { href: "/topics", label: "Chủ đề", icon: Shapes },
];
const learn = [
  { href: "/flashcards", label: "Flashcards", icon: PanelsTopLeft },
  {
    href: "/roadmap#practice",
    label: "Luyện tập",
    icon: Sparkles,
    later: true,
  },
  {
    href: "/roadmap#review",
    label: "Ôn tập hằng ngày",
    icon: CalendarCheck2,
    later: true,
  },
];
const personal = [
  {
    href: "/roadmap#decks",
    label: "Bộ từ của tôi",
    icon: FolderHeart,
    later: true,
  },
  {
    href: "/roadmap#analytics",
    label: "Thống kê",
    icon: ChartNoAxesCombined,
    later: true,
  },
  { href: "/settings", label: "Cài đặt", icon: Settings2 },
];
function subscribeMobile(callback: () => void) {
  const query = window.matchMedia("(max-width: 760px)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { bootstrap, preferences, updatePreferences, notify } = useLearning();
  const [open, setOpen] = useState(false);
  const sidebar = useRef<HTMLElement>(null);
  const mobile = useSyncExternalStore(
    subscribeMobile,
    () => window.matchMedia("(max-width: 760px)").matches,
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
  const all = [...main, ...learn, ...personal];
  const title =
    all.find((v) => pathname.startsWith(v.href.split("#")[0]))?.label ??
    "Hành trình học tập";
  return (
    <div className="app-layout">
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
      <aside
        ref={sidebar}
        inert={mobile && !open}
        role={mobile ? "dialog" : undefined}
        aria-modal={mobile && open ? true : undefined}
        aria-label="Điều hướng chính"
        className={`sidebar ${open ? "sidebar-open" : ""}`}
      >
        <div className="sidebar-brand">
          <Link
            href="/dashboard"
            aria-label="HanziFlow - Tổng quan"
            onClick={() => setOpen(false)}
          >
            <Brand />
          </Link>
          <button
            className="sidebar-collapse"
            aria-label="Đóng menu"
            onClick={() => setOpen(false)}
          >
            <PanelLeftClose size={17} />
          </button>
        </div>
        <div className="sidebar-scroll">
          {[
            { title: "KHÁM PHÁ", items: main },
            { title: "HỌC MỖI NGÀY", items: learn },
            { title: "GÓC CỦA BẠN", items: personal },
          ].map((group) => (
            <div className="nav-group" key={group.title}>
              <p className="nav-label">{group.title}</p>
              <nav aria-label={group.title}>
                {group.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={`nav-item ${pathname === item.href || pathname.startsWith(item.href + "/") ? "active" : ""}`}
                    aria-current={pathname === item.href ? "page" : undefined}
                  >
                    <item.icon size={18} />
                    <span>{item.label}</span>
                    {"later" in item && item.later === true && (
                      <span className="nav-soon">Sắp có</span>
                    )}
                  </Link>
                ))}
              </nav>
            </div>
          ))}
          <div className="sidebar-note">
            <span className="note-leaf">
              <Leaf size={21} />
            </span>
            <p>
              Chậm một chút.
              <br />
              <strong>Nhớ lâu hơn.</strong>
            </p>
            <span>
              Hành trình ngàn dặm bắt đầu
              <br />
              từ một từ mới.
            </span>
            <span className="note-glyph" aria-hidden="true">
              学
            </span>
          </div>
        </div>
        <div className="sidebar-footer">
          <span className="avatar">
            {bootstrap.user?.name.slice(0, 1).toUpperCase() ?? "学"}
          </span>
          <div>
            <strong>{bootstrap.user?.name ?? "Người học mới"}</strong>
            <span>
              {bootstrap.mode === "cloud"
                ? "Tài khoản cá nhân"
                : "Khám phá HanziFlow"}
            </span>
          </div>
          {bootstrap.mode === "cloud" ? (
            <button
              aria-label="Đăng xuất"
              onClick={async () => {
                try {
                  await logout();
                } catch (error) {
                  if (
                    error instanceof Error &&
                    error.message.includes("NEXT_REDIRECT")
                  )
                    throw error;
                  notify("Không thể đăng xuất. Hãy thử lại.", true);
                }
              }}
            >
              <LogOut size={17} />
            </button>
          ) : (
            <Link href="/login" aria-label="Đăng nhập">
              <ArrowUpRight size={17} />
            </Link>
          )}
        </div>
      </aside>
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
