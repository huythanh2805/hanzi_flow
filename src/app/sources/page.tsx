import { PublicDocument } from "@/components/public-document";
export const metadata = { title: "Nguồn dữ liệu & giấy phép" };
export default function SourcesPage() {
  return (
    <PublicDocument>
      <p className="eyebrow">MINH BẠCH TỪ NỀN TẢNG</p>
      <h1>Mỗi mục từ đều có một nguồn.</h1>
      <p>
        HanziFlow giữ nguyên định danh của dữ liệu gốc, và hiển thị rõ khi nội
        dung chưa có sẵn.
      </p>
      <section className="card">
        <h2>Bộ từ vựng HSK 3.0</h2>
        <p>
          <a
            href="https://github.com/ayman-ezz/hsk-3.0-word-list"
            target="_blank"
            rel="noreferrer"
          >
            HSK 3.0 word list by HSK University (hskuniversity.com)
          </a>
          . Bản 1.0.1, commit{" "}
          <code>8c79c71915c25a80e5e68aacec940449b36060d8</code>.
        </p>
        <p>
          Biên soạn theo giấy phép{" "}
          <a
            href="https://creativecommons.org/licenses/by/4.0/"
            target="_blank"
            rel="noreferrer"
          >
            CC BY 4.0
          </a>
          . Thông báo MIT của nguồn gốc được giữ trong{" "}
          <code>data/source/NOTICE</code>: © 2023 Ivan Krasilnikov; © 2021
          Shawky; © 2021 Pleco Inc.
        </p>
        <p>
          11.092 mục từ, 10.946 cách viết khác nhau. Số mục mới theo Band: 500 /
          772 / 973 / 1.000 / 1.071 / 1.140 / 5.636. Một cách viết có thể xuất
          hiện ở nhiều Band hoặc có nhiều cách đọc, nên các mục từ khác mã được
          giữ riêng.
        </p>
        <p>
          Thay đổi khi nhập: bổ sung số thứ tự từ mã nguồn để tạo nhóm học; giữ
          nguyên các trường gốc. Dữ liệu bổ sung được lưu riêng và không mang
          danh nghĩa của HSK University.
        </p>
      </section>
      <section className="card">
        <h2>Chuẩn năng lực 2021 ≠ đề cương thi 2025</h2>
        <p>
          Band trong ứng dụng dựa trên <strong>GF 0025-2021</strong>. Không dùng
          những Band này như cam kết về cấp độ trong đề cương thi HSK công bố
          năm 2025. Hai bộ có cách phân cấp khác nhau.
        </p>
      </section>
      <section className="card">
        <h2>Nghĩa, ví dụ và phân loại chủ đề</h2>
        <p>
          Nguồn HSK chỉ có mã, Band, chữ Hán, pinyin và bản in gốc. Không có
          nghĩa, ví dụ, tập tin âm thanh hay chủ đề.
        </p>
        <p>
          Có 7 mục từ có nghĩa/chủ đề được chép từ nội dung thiết kế do chủ dự
          án cung cấp (ảnh 06 và 07). Đây là nội dung tham chiếu của dự án,
          không phải trích từ một từ điển đã được cấp phép. Chúng được ghi nguồn
          riêng. Band và pinyin vẫn theo dữ liệu HSK, ngay cả khi ảnh mẫu khác.
        </p>
        <p>
          Nghĩa tiếng Anh được bổ sung từ{" "}
          <a href="https://www.mdbg.net/chinese/dictionary?page=cc-cedict">
            CC-CEDICT / MDBG
          </a>{" "}
          (CC BY-SA 4.0), ghép theo chữ Hán và pinyin có dấu. Nghĩa tiếng Việt
          có nguồn từ{" "}
          <a href="https://kaikki.org/viwiktionary/rawdata.html">
            Wiktionary tiếng Việt / Kaikki
          </a>{" "}
          (CC BY-SA 4.0); từng mục có liên kết tới trang gốc và lịch sử tác giả.
          Những trường hợp trùng cách viết/cách đọc cần duyệt riêng được giữ
          trong báo cáo.
        </p>
        <p>
          Câu ví dụ từ <a href="https://tatoeba.org/en/downloads">Tatoeba</a>,
          CC BY 2.0 France hoặc CC0 theo từng câu. Tác giả câu gốc và bản dịch
          được ghi tại ví dụ. Chữ phồn thể được chuyển sang giản thể bằng
          OpenCC, bản gốc vẫn được lưu. Mỗi câu được tách từ và đối chiếu danh
          sách GF 0025-2021: từ hỗ trợ không vượt Band của từ đang học; từ chưa
          xác định hoặc cách đọc không rõ bị loại. Đây là kiểm tra từ vựng, chưa
          phải chứng nhận cấp ngữ pháp hay duyệt của giáo viên.
        </p>
        <p>
          Theo yêu cầu của chủ dự án, phần thiếu bản dịch dùng OPUS-MT / Argos
          chạy cục bộ khi chuẩn bị dữ liệu. Bản dịch máy có nhãn “chưa duyệt”,
          lưu đầu vào và phiên bản mô hình. Từ chưa có nghĩa từ điển được ghi là
          bản dịch máy của chữ Hán, cần đối chiếu cách đọc/nghĩa. Ứng dụng học
          không gọi dịch vụ AI khi sử dụng.
        </p>
        <p>
          Phân loại vào 20 chủ đề do HanziFlow biên soạn theo yêu cầu của chủ dự
          án, dựa trên chữ Hán và nghĩa từ điển. Các liên kết từ thiết kế mẫu
          được giữ nguyên; một mục từ có thể thuộc nhiều chủ đề. Đây là nhóm học
          của ứng dụng, không phải phân loại chủ đề chính thức của HSK. Các từ
          chưa khớp rõ ràng được để chờ phân loại thay vì gán ngẫu nhiên.
        </p>
        <p>
          <a href="/api/content-export">
            Tải dữ liệu bổ sung cùng nguồn và attribution (JSON)
          </a>
          . Dữ liệu CC BY-SA và các bản dịch phái sinh giữ giấy phép CC BY-SA
          4.0; câu Tatoeba giữ giấy phép của từng bản gốc. Giấy phép nội dung
          tách biệt với mã ứng dụng.{" "}
          <a href="https://creativecommons.org/licenses/by-sa/4.0/">
            CC BY-SA 4.0
          </a>{" "}
          ·{" "}
          <a href="https://creativecommons.org/licenses/by/2.0/fr/">
            CC BY 2.0 France
          </a>{" "}
          · <a href="https://creativecommons.org/publicdomain/zero/1.0/">CC0</a>
          .
        </p>
      </section>
      <section className="card">
        <h2>Phát âm & tiến độ</h2>
        <p>
          Phát âm sử dụng Speech Synthesis của trình duyệt và giọng tiếng Trung
          cài trên thiết bị; chất lượng và khả năng hỗ trợ tùy trình duyệt. Một
          số hệ thống có thể dùng dịch vụ giọng nói của hệ điều hành. HanziFlow
          không tích hợp dịch vụ AI trả phí.
        </p>
        <p>
          “Đang học” là tiến độ của một mục từ ở mọi lộ trình. “Thành thạo” cần
          tiêu chí kết quả ôn tập; nút đánh dấu đã học không tự cấp trạng thái
          này. Lịch ôn FSRS thuộc Phase 2.
        </p>
      </section>
    </PublicDocument>
  );
}
