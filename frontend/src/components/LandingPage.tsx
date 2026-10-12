import { Activity, ArrowRight, ChevronRight, Network, PlayCircle, ShieldCheck } from 'lucide-react';
import { Language, setLanguage, useLanguage } from '../i18n';

type WorkspaceView = 'incidents' | 'machines' | 'graph' | 'lessons';

export function LandingPage({ onOpen }: { onOpen: (view: WorkspaceView) => void }) {
  const language = useLanguage();
  const en = language === 'en';
  const copy = en ? {
    eyebrow: 'DENSO · INCIDENT INTELLIGENCE',
    title: 'See disruptions early. Coordinate the next move with confidence.',
    intro: 'A focused operational workspace for tracing production incidents, understanding their impact, and keeping every response visible to the team.',
    start: 'Open incident workspace', graph: 'Explore the knowledge graph',
    how: 'A simple operational flow',
    steps: [
      ['1. Detect', 'Review the live production context and identify the origin of an incident.'],
      ['2. Understand', 'Trace propagation through equipment, process steps, batches, and responsible teams.'],
      ['3. Respond', 'Assign work, record evidence, and turn validated lessons into better guidance.'],
    ],
    featureTitle: 'One shared picture of an incident',
    features: [
      ['Production topology', 'Connect equipment, process steps, batches, and departments in one clear view.'],
      ['Impact simulation', 'Model how a disruption propagates before deciding what to contain.'],
      ['Human-led response', 'Keep decisions, technician reports, and expert review in a single workflow.'],
    ],
    demo: 'Demo environment', demoText: 'Uses synthetic data only. No connection can control physical equipment.',
    footer: 'Built for fast, informed production response.', language: 'Language',
  } : {
    eyebrow: 'DENSO · ĐIỀU PHỐI SỰ CỐ',
    title: 'Nhận diện gián đoạn sớm. Phối hợp xử lý với quyết định rõ ràng.',
    intro: 'Không gian vận hành tập trung để theo dõi sự cố sản xuất, hiểu phạm vi ảnh hưởng và giúp cả đội cùng xử lý theo một bức tranh chung.',
    start: 'Mở không gian điều phối', graph: 'Khám phá knowledge graph',
    how: 'Luồng vận hành đơn giản',
    steps: [
      ['1. Phát hiện', 'Xem bối cảnh dây chuyền và xác định điểm phát sinh sự cố.'],
      ['2. Hiểu tác động', 'Theo dõi lan truyền qua thiết bị, công đoạn, lô hàng và bộ phận phụ trách.'],
      ['3. Phản hồi', 'Phân công, ghi nhận bằng chứng và biến bài học đã duyệt thành hướng dẫn tốt hơn.'],
    ],
    featureTitle: 'Một bức tranh chung cho mỗi sự cố',
    features: [
      ['Topology sản xuất', 'Kết nối thiết bị, công đoạn, lô hàng và bộ phận trong một khung nhìn rõ ràng.'],
      ['Mô phỏng ảnh hưởng', 'Xem sự cố có thể lan truyền thế nào trước khi quyết định khoanh vùng.'],
      ['Con người dẫn dắt', 'Lưu quyết định, báo cáo kỹ thuật và phần duyệt chuyên gia trong cùng một luồng xử lý.'],
    ],
    demo: 'Môi trường demo', demoText: 'Chỉ sử dụng dữ liệu giả lập. Không có kết nối điều khiển tới thiết bị thật.',
    footer: 'Thiết kế để đội sản xuất phản hồi nhanh và có căn cứ.', language: 'Ngôn ngữ',
  };
  const icons = [Network, Activity, ShieldCheck];

  return <main className="landing-page">
    <header className="landing-nav">
      <div className="landing-brand"><strong>DENSO</strong><small>Crafting the Core</small></div>
      <div className="landing-language"><small>{copy.language}</small><select value={language} onChange={e => setLanguage(e.target.value as Language)} aria-label="Language"><option value="vi">Tiếng Việt</option><option value="en">English</option></select></div>
    </header>

    <section className="landing-hero">
      <div className="hero-copy">
        <p className="landing-eyebrow">{copy.eyebrow}</p>
        <h1>{copy.title}</h1>
        <p>{copy.intro}</p>
        <div className="hero-actions">
          <button className="landing-primary" onClick={() => onOpen('incidents')}><PlayCircle size={18} />{copy.start}<ArrowRight size={17} /></button>
          <button className="landing-secondary" onClick={() => onOpen('graph')}>{copy.graph}<ChevronRight size={17} /></button>
        </div>
      </div>
      <div className="hero-system-card" aria-label={copy.featureTitle}>
        <div className="system-kicker"><span />{en ? 'LIVE OPERATIONAL CONTEXT' : 'BỐI CẢNH VẬN HÀNH TRỰC TIẾP'}</div>
        <div className="system-path"><b>01</b><i /><b>02</b><i /><b>03</b><i /><b>04</b></div>
        <div className="system-caption"><strong>{en ? 'Signal → decision → learning' : 'Tín hiệu → quyết định → bài học'}</strong><span>{en ? 'From one incident to a coordinated response.' : 'Từ một sự cố đến phản hồi phối hợp.'}</span></div>
      </div>
    </section>

    <section className="landing-section landing-steps"><div className="section-intro"><p>{copy.how}</p><h2>{en ? 'From signal to a documented response.' : 'Từ tín hiệu đến phản hồi được ghi nhận.'}</h2></div><div className="steps-grid">{copy.steps.map(([title, description]) => { const [number, ...words] = title.split(' '); return <article key={title}><span>{number}</span><h3>{words.join(' ')}</h3><p>{description}</p></article>; })}</div></section>

    <section className="landing-section landing-features"><div className="section-intro"><p>{en ? 'WHAT THE SYSTEM HELPS YOU SEE' : 'HỆ THỐNG GIÚP BẠN NHÌN THẤY'}</p><h2>{copy.featureTitle}</h2></div><div className="feature-grid">{copy.features.map(([title, description], index) => { const Icon = icons[index]; return <article key={title}><Icon size={22} /><h3>{title}</h3><p>{description}</p></article>; })}</div></section>

    <aside className="landing-demo"><ShieldCheck size={22} /><div><strong>{copy.demo}</strong><p>{copy.demoText}</p></div><button onClick={() => onOpen('incidents')}>{copy.start}<ArrowRight size={16} /></button></aside>
    <footer className="landing-footer"><span>DENSO</span><p>{copy.footer}</p></footer>
  </main>;
}
