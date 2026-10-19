import React from 'react';
import { useI18n } from '../../i18n';
import heroImage from '../../assets/images/hero_road_sealing_1791786356470.webp';
import heroImageSmall from '../../assets/images/hero_road_sealing_1791786356470-sm.webp';
import heroImagePortrait from '../../assets/images/hero_road_sealing_1791786356470-portrait.webp';
import { CountUp } from '../common/Motion';

/**
 * 首屏底边是一道路面裂缝。页面加载时：照片缓缓推近定格 → 灌缝枪头（发光圆点）沿裂缝走一遍，
 * 身后留下天蓝色密封胶 → 标题依次浮现。数据栏进入视口时数字滚动到位。
 * 裂缝路径在 1440×60 的坐标里绘制，用 slice 适配宽度，移动端只取中段，不会被拉伸变形。
 */
const CRACK =
  'M0 30 L48 40 L85 29 L154 22 L186 37 L248 23 L299 32 L330 39 L390 25 L420 23 L475 29 L507 26 L540 32 L595 22 L659 23 L701 34 L769 32 L800 32 L865 29 L896 26 L926 32 L962 27 L1016 24 L1078 23 L1142 27 L1205 37 L1276 25 L1310 32 L1374 34 L1414 28 L1440 32';

export const HeroSection: React.FC = () => {
  const { d } = useI18n();

  const stats = [
    { value: <CountUp to={2670} />, unit: d.hero.stats.capitalUnit, label: d.hero.stats.capital },
    { value: <CountUp to={500} suffix="+" />, unit: d.hero.stats.stockUnit, label: d.hero.stats.stock },
    { value: <CountUp to={13} />, unit: d.hero.stats.patents, label: d.hero.stats.patentsDesc },
    { value: '7×24', unit: d.hero.stats.response, label: d.hero.stats.responseDesc }
  ];

  return (
    <section id="home" className="bg-white">
      <div className="relative min-h-[600px] h-[86svh] max-h-[780px] overflow-hidden bg-night">
        {/* Phones get a portrait crop of the photo (a third of the bytes, nothing visible is lost). */}
        <picture>
          <source media="(max-width: 640px)" srcSet={heroImagePortrait} width={480} height={768} />
          <img
            src={heroImage}
            srcSet={`${heroImageSmall} 800w, ${heroImage} 1376w`}
            sizes="100vw"
            width={1376}
            height={768}
            decoding="async"
            alt="施工人员在高速公路上使用灌缝设备处理路面裂缝"
            className="hero-photo absolute inset-0 w-full h-full object-cover object-center sm:object-[62%_center]"
            loading="eager"
            fetchPriority="high"
            referrerPolicy="no-referrer"
          />
        </picture>
        <div
          className="absolute inset-0 bg-[linear-gradient(0deg,rgb(15_37_54/0.92)_0%,rgb(15_37_54/0.55)_55%,rgb(15_37_54/0.2)_100%)] md:bg-[linear-gradient(90deg,rgb(15_37_54/0.9)_0%,rgb(15_37_54/0.62)_42%,rgb(15_37_54/0)_78%)] rtl:md:bg-[linear-gradient(270deg,rgb(15_37_54/0.9)_0%,rgb(15_37_54/0.62)_42%,rgb(15_37_54/0)_78%)]"
          aria-hidden="true"
        />

        <div className="relative h-full page-wrap flex flex-col justify-end pb-24 md:pb-28">
          <div className="max-w-[780px] text-white">
            <h1 className="font-bold leading-[1.12] tracking-[-0.01em] text-[clamp(1.875rem,0.9rem+4vw,4.25rem)]">
              <span className="block hero-rise" style={{ '--i': 0 } as React.CSSProperties}>
                {d.hero.titleMain}
              </span>
              <span className="block hero-rise" style={{ '--i': 1 } as React.CSSProperties}>
                {d.hero.titleSub}
              </span>
            </h1>
            <p
              className="hero-rise mt-5 text-base sm:text-lg leading-relaxed text-white/85 max-w-[36em]"
              style={{ '--i': 2 } as React.CSSProperties}
            >
              {d.hero.description}
            </p>
            <div className="hero-rise mt-8 flex flex-wrap gap-3" style={{ '--i': 3 } as React.CSSProperties}>
              <a href="#products" className="btn btn-primary">
                {d.hero.exploreProducts}
              </a>
              <a href="#contact" className="btn btn-on-dark">
                {d.hero.consultNeeds}
              </a>
            </div>
          </div>
        </div>

        {/* The crack edge: white road surface below, sealant bead along the crack. */}
        <svg
          className="absolute inset-x-0 -bottom-px w-full h-[60px] pointer-events-none"
          viewBox="0 0 1440 60"
          preserveAspectRatio="xMidYMax slice"
          aria-hidden="true"
          focusable="false"
        >
          <path d={`${CRACK} L1440 60 L0 60 Z`} fill="#ffffff" />
          {/* soft glow under the bead */}
          <path
            d={CRACK}
            className="hero-seal opacity-30"
            fill="none"
            stroke="#38bdf8"
            strokeWidth={14}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d={CRACK}
            className="hero-seal"
            fill="none"
            stroke="#38bdf8"
            strokeWidth={5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* the sealing nozzle travelling along the crack */}
          <g className="hero-nozzle" style={{ offsetPath: `path('${CRACK}')` } as React.CSSProperties}>
            <circle r={14} fill="#38bdf8" opacity={0.25} />
            <circle r={6} fill="#ffffff" stroke="#38bdf8" strokeWidth={3} />
          </g>
        </svg>
      </div>

      <div className="page-wrap">
        <dl className="grid grid-cols-2 lg:grid-cols-4 gap-y-8 py-10 md:py-12">
          {stats.map((s, i) => (
            <div
              key={s.label}
              className={`ps-5 sm:ps-6 border-s border-line ${i % 2 === 0 ? 'lg:border-s' : ''}`}
            >
              <dt className="text-sm text-slate-500">{s.label}</dt>
              <dd className="mt-1.5 flex items-baseline gap-1.5 text-night">
                <span className="font-sign font-semibold text-[2rem] sm:text-[2.5rem] leading-none">{s.value}</span>
                <span className="text-sm text-slate-500">{s.unit}</span>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
};
