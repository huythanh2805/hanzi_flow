"use client";
import Link from "next/link";
import type { RefObject } from "react";
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
  ArrowUpRight,
  Leaf,
  LogOut,
} from "lucide-react";
import { Brand } from "./brand";
import { useLearning } from "./provider";
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
    href: "/practice",
    label: "Luyện tập",
    icon: Sparkles,
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
    href: "/decks",
    label: "Bộ từ của tôi",
    icon: FolderHeart,
  },
  {
    href: "/roadmap#analytics",
    label: "Thống kê",
    icon: ChartNoAxesCombined,
    later: true,
  },
  { href: "/settings", label: "Cài đặt", icon: Settings2 },
];

export const navigationGroups = [
  { title: "KHÁM PHÁ", items: main },
  { title: "HỌC MỖI NGÀY", items: learn },
  { title: "GÓC CỦA BẠN", items: personal },
];

export function AppSidebar({
  sidebarRef,
  pathname,
  mobile,
  open,
  onClose,
}: {
  sidebarRef: RefObject<HTMLElement | null>;
  pathname: string;
  mobile: boolean;
  open: boolean;
  onClose: () => void;
}) {
  const { bootstrap, notify } = useLearning();
  return (
    <aside
      ref={sidebarRef}
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
          onClick={() => onClose()}
        >
          <Brand />
        </Link>
        <button
          className="sidebar-collapse"
          aria-label="Đóng menu"
          onClick={() => onClose()}
        >
          <PanelLeftClose size={17} />
        </button>
      </div>
      <div className="sidebar-scroll">
        {navigationGroups.map((group) => (
          <div className="nav-group" key={group.title}>
            <p className="nav-label">{group.title}</p>
            <nav aria-label={group.title}>
              {group.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => onClose()}
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
  );
}
