"use client";
import { useState } from "react";
import { Check, Cloud, Globe2, Monitor, Moon, Save, Sun } from "lucide-react";
import { PageHeading } from "./common";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { useLearning } from "./provider";
import { bands, type Preferences } from "@/lib/domain/types";
import Link from "next/link";
export function Settings() {
  const { bootstrap, preferences, updatePreferences, ready } = useLearning();
  const [draft, setDraft] = useState<Preferences | null>(null);
  const [saving, setSaving] = useState(false);
  const values = draft ?? preferences;
  function change(patch: Partial<Preferences>) {
    setDraft({ ...values, ...patch });
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (await updatePreferences(values)) setDraft(null);
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="page-enter settings-page">
      <PageHeading
        eyebrow="THEO CÁCH CỦA BẠN"
        title="Một nhịp học phù hợp."
        description="Điều chỉnh mục tiêu và không gian học để cảm thấy thoải mái mỗi ngày."
      />
      <form onSubmit={save}>
        <Card className="settings-section">
          <div className="settings-section-heading">
            <span className="settings-icon">
              <Globe2 size={21} />
            </span>
            <div>
              <h2>Thói quen học tập</h2>
              <p>Bắt đầu nhỏ. Duy trì đều.</p>
            </div>
          </div>
          <div className="setting-row">
            <div>
              <label htmlFor="dailyGoal">Số từ mới mỗi ngày</label>
              <p>Một mục tiêu vừa sức giúp bạn đi xa hơn.</p>
            </div>
            <div className="segmented-control">
              {[10, 15, 20, 25, 30].map((goal) => (
                <button
                  key={goal}
                  type="button"
                  aria-pressed={values.dailyGoal === goal}
                  className={values.dailyGoal === goal ? "selected" : ""}
                  onClick={() => change({ dailyGoal: goal })}
                >
                  {goal}
                </button>
              ))}
            </div>
          </div>
          <div className="setting-row">
            <div>
              <label htmlFor="lessonSize">Số từ trong mỗi nhóm học</label>
              <p>Đổi cách chia nhóm không làm mất tiến độ.</p>
            </div>
            <select
              id="lessonSize"
              value={values.lessonSize}
              onChange={(e) =>
                change({
                  lessonSize: Number(
                    e.target.value,
                  ) as Preferences["lessonSize"],
                })
              }
            >
              {[10, 15, 20, 25, 30].map((s) => (
                <option key={s} value={s}>
                  {s} từ / nhóm
                </option>
              ))}
            </select>
          </div>
          <div className="setting-row">
            <div>
              <label htmlFor="preferredBand">HSK Band ưu tiên</label>
              <p>Dùng cho buổi học từ trang tổng quan.</p>
            </div>
            <select
              id="preferredBand"
              value={values.preferredBand}
              onChange={(e) => change({ preferredBand: e.target.value })}
            >
              {bands.map((b) => (
                <option key={b} value={b}>
                  Band {b}
                </option>
              ))}
            </select>
          </div>
          <div className="setting-row setting-topics">
            <div>
              <span className="setting-label">Chủ đề yêu thích</span>
              <p>Lưu lựa chọn cho kế hoạch học ở Phase 2.</p>
            </div>
            <div className="settings-topic-chips">
              {bootstrap.topics.map((t) => (
                <button
                  type="button"
                  aria-pressed={values.preferredTopics.includes(t.id)}
                  key={t.id}
                  className={`filter-chip ${values.preferredTopics.includes(t.id) ? "selected" : ""}`}
                  onClick={() =>
                    change({
                      preferredTopics: values.preferredTopics.includes(t.id)
                        ? values.preferredTopics.filter((id) => id !== t.id)
                        : [...values.preferredTopics, t.id],
                    })
                  }
                >
                  {values.preferredTopics.includes(t.id) && <Check size={12} />}{" "}
                  {t.name}
                </button>
              ))}
            </div>
          </div>
        </Card>
        <Card className="settings-section">
          <div className="settings-section-heading">
            <span className="settings-icon">
              <Monitor size={21} />
            </span>
            <div>
              <h2>Ngôn ngữ & giao diện</h2>
              <p>Không gian giúp bạn tập trung.</p>
            </div>
          </div>
          <div className="setting-row">
            <div>
              <label htmlFor="language">Ngôn ngữ nghĩa</label>
              <p>Chỉ hiển thị bản dịch đã có nguồn.</p>
            </div>
            <select
              id="language"
              value={values.language}
              onChange={(e) =>
                change({ language: e.target.value as Preferences["language"] })
              }
            >
              <option value="vi">Tiếng Việt</option>
              <option value="en">English</option>
            </select>
          </div>
          <div className="setting-row">
            <div>
              <span className="setting-label">
                Hiển thị pinyin trong thư viện
              </span>
              <p>Bạn luôn có thể xem pinyin trong chi tiết từ.</p>
            </div>
            <button
              className={`switch ${values.showPinyin ? "checked" : ""}`}
              type="button"
              role="switch"
              aria-label="Hiển thị pinyin"
              aria-checked={values.showPinyin}
              onClick={() => change({ showPinyin: !values.showPinyin })}
            >
              <span />
            </button>
          </div>
          <div className="setting-row">
            <div>
              <label htmlFor="speechRate">Tốc độ phát âm</label>
              <p>Sử dụng giọng tiếng Trung trên thiết bị.</p>
            </div>
            <select
              id="speechRate"
              value={values.speechRate}
              onChange={(e) => change({ speechRate: Number(e.target.value) })}
            >
              <option value="0.65">Chậm · 0.65×</option>
              <option value="0.85">Vừa phải · 0.85×</option>
              <option value="1">Bình thường · 1×</option>
              <option value="1.2">Nhanh · 1.2×</option>
            </select>
          </div>
          <div className="setting-row">
            <div>
              <span className="setting-label">Giao diện</span>
              <p>Chọn một sắc thái cho buổi học.</p>
            </div>
            <div className="theme-selector">
              {[
                { id: "light", label: "Sáng", icon: Sun },
                { id: "dark", label: "Tối", icon: Moon },
                { id: "system", label: "Hệ thống", icon: Monitor },
              ].map((t) => (
                <button
                  type="button"
                  aria-pressed={values.theme === t.id}
                  key={t.id}
                  className={values.theme === t.id ? "selected" : ""}
                  onClick={() =>
                    change({ theme: t.id as Preferences["theme"] })
                  }
                >
                  <t.icon size={17} />
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div className="setting-row">
            <div>
              <label htmlFor="timeZone">Múi giờ</label>
              <p>Tính ngày học theo giờ của bạn.</p>
            </div>
            <input
              id="timeZone"
              value={values.timeZone}
              onChange={(e) => change({ timeZone: e.target.value })}
              placeholder="Asia/Bangkok"
              maxLength={80}
            />
          </div>
        </Card>
        <Card className="settings-section">
          <div className="settings-section-heading">
            <span className="settings-icon">
              <Cloud size={21} />
            </span>
            <div>
              <h2>Tài khoản & dữ liệu</h2>
              <p>
                {bootstrap.mode === "cloud"
                  ? "Tiến độ học được lưu trong tài khoản Supabase."
                  : "Bản thử đang lưu dữ liệu trong trình duyệt này."}
              </p>
            </div>
          </div>
          <div className="setting-row">
            <div>
              <span className="setting-label">
                {bootstrap.user?.email ?? "Bạn chưa đăng nhập"}
              </span>
              <p>
                {bootstrap.mode === "cloud"
                  ? "Cùng tài khoản, cùng tiến độ trên các thiết bị."
                  : "Dữ liệu bản thử độc lập với tài khoản cloud."}
              </p>
            </div>
            {bootstrap.mode === "trial" && (
              <Button asChild variant="outline">
                <Link href="/setup">Thiết lập tài khoản</Link>
              </Button>
            )}
          </div>
        </Card>
        <div className="settings-save">
          <p>Thay đổi được áp dụng sau khi lưu.</p>
          <Button type="submit" disabled={saving || !ready}>
            <Save size={16} />
            {saving ? "Đang lưu…" : "Lưu cài đặt"}
          </Button>
        </div>
      </form>
    </div>
  );
}
