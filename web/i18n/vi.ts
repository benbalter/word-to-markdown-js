import type { UIStrings } from './types';

// Vietnamese (Tiếng Việt).
// Machine-translated first pass — flagged for native review before launch.
// Google Docs menu labels follow the localized Vietnamese UI (Tệp → Tải xuống).
export const vi: UIStrings = {
  eyebrow: 'Miễn phí · Mã nguồn mở · 100% trong trình duyệt',
  tagline:
    'Chuyển đổi tệp Word (.docx) sang Markdown gọn gàng — hoàn toàn trong trình duyệt của bạn. Tệp của bạn không bao giờ được tải lên.',

  flowFromAlt: 'Tài liệu Word',
  flowToAlt: 'Tệp Markdown',

  dropzoneTitle: 'Thả tệp .docx của bạn vào đây',
  dropzoneBrowsePrefix: 'hoặc ',
  dropzoneBrowseLink: 'nhấp để chọn tệp',
  googleDocHint: 'Google Doc? Tệp → Tải xuống → Microsoft Word (.docx)',
  convertSectionAria: 'Chuyển đổi tài liệu',

  convertedLabel: 'Đã chuyển đổi',
  copyButton: 'Sao chép Markdown',
  downloadButton: 'Tải .md',
  panelMarkdown: 'Markdown',
  panelPreview: 'Xem trước',

  steps: [
    { t: 'Tải lên', d: 'Kéo tệp .docx vào, hoặc nhấp để chọn.' },
    {
      t: 'Chuyển đổi',
      d: 'Chuyển đổi ngay trong trình duyệt — không máy chủ, không chờ đợi.',
    },
    { t: 'Sao chép hoặc lưu', d: 'Sao chép Markdown, hoặc tải tệp .md.' },
  ],

  faqHeading: 'Câu hỏi thường gặp',
  faqs: [
    {
      q: 'Làm cách nào để chuyển đổi tài liệu Word sang Markdown?',
      a: 'Kéo tệp .docx vào trang (hoặc nhấp để chọn). Word to Markdown chuyển đổi ngay trong trình duyệt của bạn và hiển thị Markdown tức thì — sao chép hoặc tải xuống tệp .md.',
    },
    {
      q: 'Word to Markdown có miễn phí không?',
      a: 'Có. Hoàn toàn miễn phí và mã nguồn mở — không cần đăng ký, không giới hạn dung lượng tệp, và không quảng cáo.',
    },
    {
      q: 'Tài liệu của tôi có được tải lên máy chủ không?',
      a: 'Không. Việc chuyển đổi diễn ra hoàn toàn trong trình duyệt của bạn bằng JavaScript. Tệp của bạn không bao giờ rời khỏi thiết bị và không bao giờ được tải lên, lưu trữ hay ghi lại.',
    },
    {
      q: 'Làm cách nào để chuyển đổi Google Doc sang Markdown?',
      a: 'Trong Google Docs, chọn Tệp → Tải xuống → Microsoft Word (.docx), rồi thả tệp .docx đó vào Word to Markdown.',
    },
    {
      q: 'Những định dạng nào được giữ lại?',
      a: 'Tiêu đề, chữ in đậm và in nghiêng, danh sách có thứ tự và lồng nhau, bảng, liên kết, và mã được chuyển thành Markdown gọn gàng theo chuẩn GitHub.',
    },
  ],

  footer: {
    feedback: 'Phản hồi',
    source: 'Mã nguồn',
    donate: 'Ủng hộ',
    terms: 'Điều khoản',
    privacy: 'Quyền riêng tư',
  },
  footerTagline:
    'Chuyển đổi trong trình duyệt của bạn · không có gì được tải lên',
  homeAria: 'Word to Markdown — trang chủ',

  metaTitle: 'Word to Markdown — Chuyển .docx sang Markdown miễn phí',
  metaDescription:
    'Chuyển đổi Word (.docx) và Google Docs sang Markdown chuẩn GitHub — miễn phí, mã nguồn mở, hoàn toàn trong trình duyệt của bạn.',
  schemaDescription:
    'Công cụ miễn phí, mã nguồn mở giúp chuyển đổi Word (.docx) và Google Docs sang Markdown chuẩn GitHub gọn gàng, hoàn toàn trong trình duyệt của bạn.',
  schemaFeatureList: [
    'Chuyển Word (.docx) sang Markdown',
    'Chuyển Google Docs sang Markdown',
    'Kết quả Markdown chuẩn GitHub',
    '100% phía máy khách — không có gì được tải lên',
  ],

  errorGeneric:
    'Đã xảy ra lỗi không mong muốn khi chuyển đổi tài liệu. Vui lòng thử lại.',
  dismiss: 'Đóng',
};
