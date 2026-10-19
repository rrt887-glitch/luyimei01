import React from 'react';
import { useI18n } from '../../i18n';
import { Check, ChevronRight } from 'lucide-react';
import labImage from '../../assets/images/materials_lab_testing_1791786380385.webp';
import labImageSmall from '../../assets/images/materials_lab_testing_1791786380385-sm.webp';
import { Reveal } from '../common/Motion';

export const EngineeringSection: React.FC = () => {
  const { d } = useI18n();
  const points = [d.engineering.point1, d.engineering.point2, d.engineering.point3];
  const [stampTitle, stampDesc] = d.engineering.patentStamp.split('\n');

  return (
    <section id="about" className="bg-concrete py-16 md:py-24">
      <div className="page-wrap grid gap-10 lg:gap-16 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] items-center">
        <Reveal as="figure" className="relative">
          <img
            src={labImage}
            srcSet={`${labImageSmall} 720w, ${labImage} 960w`}
            sizes="(min-width: 1024px) 55vw, 100vw"
            width={960}
            height={717}
            decoding="async"
            alt={d.misc.labAlt}
            className="w-full aspect-[4/3] lg:aspect-[5/4] object-cover rounded-2xl"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
          <figcaption className="absolute -bottom-6 start-5 sm:start-8 flex items-center gap-4 rounded-xl bg-night text-white px-5 py-4">
            <span className="font-sign font-semibold text-4xl leading-none text-sky">13</span>
            <span className="text-sm leading-snug">
              <strong className="block font-semibold">{stampTitle}</strong>
              {stampDesc && <span className="text-white/70">{stampDesc}</span>}
            </span>
          </figcaption>
        </Reveal>

        <div className="pt-6 lg:pt-0">
          <h2 className="section-title">
            {d.engineering.titleMain}
            <br />
            {d.engineering.titleSub}
          </h2>
          <p className="mt-5 text-[15px] sm:text-base text-slate-600 leading-[1.85] max-w-[36em]">{d.engineering.desc}</p>

          <ul className="mt-7 space-y-3.5">
            {points.map(p => (
              <li key={p} className="flex items-start gap-3 text-[15px] text-night">
                <span className="mt-0.5 inline-flex w-5 h-5 shrink-0 items-center justify-center rounded bg-sky text-night">
                  <Check className="w-3.5 h-3.5" strokeWidth={3} />
                </span>
                {p}
              </li>
            ))}
          </ul>

          <a href="#process" className="mt-8 inline-flex items-center gap-1 text-[15px] font-semibold text-sky-deep hover:underline">
            {d.engineering.learnServices}
            <ChevronRight className="w-4 h-4 rtl:rotate-180" />
          </a>
        </div>
      </div>
    </section>
  );
};
