import React from 'react';
import { useI18n } from '../../i18n';
import { ShieldCheck, Cog, Compass, ChevronRight } from 'lucide-react';
import { Reveal, useInViewOnce } from '../common/Motion';

interface ServicesSectionProps {
  onSelectCategory: (category: string) => void;
}

export const ServicesSection: React.FC<ServicesSectionProps> = ({ onSelectCategory }) => {
  const { d } = useI18n();
  const s = d.services;
  const [stepsRef, stepsIn] = useInViewOnce<HTMLOListElement>('0px 0px -20% 0px');

  const services = [
    { icon: ShieldCheck, title: s.s1Title, desc: s.s1Desc, link: s.s1Link, href: '#products', category: 'material' as const },
    { icon: Cog, title: s.s2Title, desc: s.s2Desc, link: s.s2Link, href: '#products', category: 'equipment' as const },
    { icon: Compass, title: s.s3Title, desc: s.s3Desc, link: s.s3Link, href: '#contact' }
  ];

  // A real sequence, so it is numbered.
  const steps = [
    { title: s.step1Title, desc: s.step1Desc },
    { title: s.step2Title, desc: s.step2Desc },
    { title: s.step3Title, desc: s.step3Desc },
    { title: s.step4Title, desc: s.step4Desc }
  ];

  return (
    <section id="process" className="py-16 md:py-24 bg-white">
      <div className="page-wrap">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-10 md:mb-14">
          <h2 className="section-title max-w-[18em]">{s.title}</h2>
          <a href="#contact" className="inline-flex items-center gap-1 text-[15px] font-semibold text-sky-deep hover:underline shrink-0">
            {s.discussNeed}
            <ChevronRight className="w-4 h-4 rtl:rotate-180" />
          </a>
        </div>

        <div className="grid gap-10 md:gap-8 md:grid-cols-3">
          {services.map(({ icon: Icon, title, desc, link, href, category }, i) => (
            <Reveal as="article" index={i} key={title} className="border-t-[3px] border-sky pt-6">
              <Icon className="w-6 h-6 text-sky-deep" strokeWidth={1.75} />
              <h3 className="mt-4 text-xl font-bold text-night">{title}</h3>
              <p className="mt-3 text-[15px] text-slate-600 leading-relaxed">{desc}</p>
              <a
                href={href}
                onClick={category ? () => onSelectCategory(category) : undefined}
                className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-night hover:text-sky-deep"
              >
                {link}
                <ChevronRight className="w-4 h-4 rtl:rotate-180" />
              </a>
            </Reveal>
          ))}
        </div>

        {/* The connecting line fills in step order when the strip scrolls into view. */}
        <ol ref={stepsRef} className={`steps relative mt-16 md:mt-20 grid gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6 ${stepsIn ? 'is-in' : ''}`}>
          <span className="hidden lg:block absolute top-[19px] inset-x-5 h-[3px] -translate-y-px rounded-full bg-concrete overflow-hidden" aria-hidden="true">
            <span className="steps-fill block h-full w-full bg-sky origin-left rtl:origin-right" />
          </span>
          {steps.map((step, i) => (
            <li key={step.title} className="relative flex lg:flex-col gap-4" style={{ '--d': i } as React.CSSProperties}>
              <span className="step-node relative z-10 inline-flex w-10 h-10 shrink-0 items-center justify-center rounded-full font-sign font-semibold">
                {i + 1}
              </span>
              <div>
                <h4 className="text-base font-bold text-night">{step.title}</h4>
                <p className="mt-1 text-sm text-slate-600">{step.desc}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
};
