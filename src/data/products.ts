import { Product } from '../types';
import coldPatchImg from '../assets/images/cold_patch_asphalt_1792119559597.jpg';
import crackTapeImg from '../assets/images/asphalt_crack_tape_1792119561136.jpg';
import slottingMachineImg from '../assets/images/road_slotting_machine_1792119563470.jpg';
import crackSealerImg from '../assets/images/road_crack_sealer_1792119564714.jpg';
import heroRoadImg from '../assets/images/hero_road_sealing_1791786356470.jpg';
import labTestingImg from '../assets/images/materials_lab_testing_1791786380385.jpg';

export const initialProducts: Product[] = [
  {
    id: '0',
    nameKey: 'p1Name',
    type: 'material',
    catKey: 'p1Cat',
    model: 'LYM-CP-STD',
    descKey: 'p1Desc',
    price: '$390–$450',
    unitKey: 'p1Unit',
    specKey: 'p1Spec',
    inStock: true,
    year: 2026,
    brand: 'lym',
    condition: 'new',
    featured: true,
    videoThumbnail: coldPatchImg,
    images: [coldPatchImg, labTestingImg],
    tierPrices: [{ minQty: 20, priceUsd: '$370' }],
    supplySpecs: {
      leadTime: '现货 / 24-48小时发货',
      moq: '10桶 / 250kg',
      capacityStatus: 'ample',
      capacityLabel: '月产800吨 · 常备库存200吨',
      baseLocation: '广州黄埔智造基地',
      packaging: '25kg防潮抗撞密封桶 / 支持托盘海运'
    },
    // Shown when the site is in English / Arabic / Russian (Chinese is the fields above).
    translations: {
      en: {
        leadTime: 'In stock / ships in 24–48 h',
        moq: '10 drums / 250 kg',
        capacityLabel: '800 t/month · 200 t in stock',
        baseLocation: 'Huangpu manufacturing base, Guangzhou',
        packaging: '25 kg moisture-proof sealed drums / palletised sea freight'
      },
      ar: {
        leadTime: 'متوفر / الشحن خلال 24–48 ساعة',
        moq: '10 براميل / 250 كغ',
        capacityLabel: '800 طن شهريًا · مخزون دائم 200 طن',
        baseLocation: 'قاعدة التصنيع في هوانغبو، قوانغتشو',
        packaging: 'براميل محكمة مقاومة للرطوبة 25 كغ / شحن بحري على منصات'
      },
      ru: {
        leadTime: 'В наличии / отгрузка за 24–48 ч',
        moq: '10 бочек / 250 кг',
        capacityLabel: '800 т/мес · на складе 200 т',
        baseLocation: 'Производственная база Хуанпу, Гуанчжоу',
        packaging: 'Герметичные влагостойкие бочки 25 кг / морская отгрузка на паллетах'
      }
    }
  },
  {
    id: '1',
    nameKey: 'p2Name',
    type: 'material',
    catKey: 'p2Cat',
    model: '裂缝贴系列 (Crack Tape Pro)',
    descKey: 'p2Desc',
    price: '$2.50–$5.00',
    unitKey: 'p2Unit',
    specKey: 'p2Spec',
    inStock: true,
    year: 2026,
    brand: 'lym',
    condition: 'new',
    featured: true,
    videoThumbnail: crackTapeImg,
    images: [crackTapeImg, labTestingImg],
    tierPrices: [{ minQty: 50, priceUsd: '$2.20' }],
    supplySpecs: {
      leadTime: '现货 / 当日出库',
      moq: '50米 (试用箱)',
      capacityStatus: 'ample',
      capacityLabel: '日产20,000米 · 全规格备库',
      baseLocation: '广东东莞生产基地',
      packaging: '标准纸箱卷装 / 防粘隔离膜 / 支持OEM'
    },
    // Shown when the site is in English / Arabic / Russian (Chinese is the fields above).
    translations: {
      en: {
        leadTime: 'In stock / ships same day',
        moq: '50 m (trial box)',
        capacityLabel: '20,000 m/day · all sizes stocked',
        baseLocation: 'Dongguan production base, Guangdong',
        packaging: 'Rolls in standard cartons / release liner / OEM available'
      },
      ar: {
        leadTime: 'متوفر / الشحن في نفس اليوم',
        moq: '50 م (صندوق تجريبي)',
        capacityLabel: '20,000 م يوميًا · جميع المقاسات متوفرة',
        baseLocation: 'قاعدة الإنتاج في دونغقوان، قوانغدونغ',
        packaging: 'لفائف في كراتين قياسية / غشاء فاصل / يتوفر OEM'
      },
      ru: {
        leadTime: 'В наличии / отгрузка в день заказа',
        moq: '50 м (пробная коробка)',
        capacityLabel: '20 000 м/сутки · все размеры на складе',
        baseLocation: 'Производственная база Дунгуань, Гуандун',
        packaging: 'Рулоны в стандартных коробках / антиадгезионная плёнка / возможен OEM'
      }
    }
  },
  {
    id: '2',
    nameKey: 'p3Name',
    type: 'equipment',
    catKey: 'p3Cat',
    model: 'LYM-CUT-500',
    descKey: 'p3Desc',
    price: '$950–$1,350',
    unitKey: 'p3Unit',
    specKey: 'p3Spec',
    inStock: true,
    year: 2026,
    brand: 'lym',
    condition: 'new',
    featured: true,
    videoThumbnail: slottingMachineImg,
    images: [slottingMachineImg, heroRoadImg],
    tierPrices: [{ minQty: 5, priceUsd: '$880' }],
    supplySpecs: {
      leadTime: '3-5个工作日',
      moq: '1台起订',
      capacityStatus: 'moderate',
      capacityLabel: '周产30台 · 顺德备件库直发',
      baseLocation: '佛山顺德装备工厂',
      packaging: '免熏蒸出口木箱 / 配备金刚石刀头'
    },
    // Shown when the site is in English / Arabic / Russian (Chinese is the fields above).
    translations: {
      en: {
        leadTime: '3–5 working days',
        moq: 'From 1 unit',
        capacityLabel: '30 units/week · spare parts ship from Shunde',
        baseLocation: 'Shunde equipment plant, Foshan',
        packaging: 'Fumigation-free export crate / diamond blade included'
      },
      ar: {
        leadTime: '3–5 أيام عمل',
        moq: 'من وحدة واحدة',
        capacityLabel: '30 وحدة أسبوعيًا · قطع الغيار تُشحن من شوندي',
        baseLocation: 'مصنع المعدات في شوندي، فوشان',
        packaging: 'صندوق تصدير خشبي معفى من التبخير / شفرة ماسية مرفقة'
      },
      ru: {
        leadTime: '3–5 рабочих дней',
        moq: 'От 1 единицы',
        capacityLabel: '30 ед./нед · запчасти со склада в Шуньдэ',
        baseLocation: 'Завод оборудования Шуньдэ, Фошань',
        packaging: 'Экспортный ящик без фумигации / алмазный диск в комплекте'
      }
    }
  },
  {
    id: '3',
    nameKey: 'p4Name',
    type: 'equipment',
    catKey: 'p4Cat',
    model: 'LYM-SEAL-100 (成套装备系列)',
    descKey: 'p4Desc',
    price: '$3,900–$6,300',
    unitKey: 'p4Unit',
    specKey: 'p4Spec',
    inStock: true,
    year: 2026,
    brand: 'lym',
    condition: 'new',
    featured: true,
    videoThumbnail: crackSealerImg,
    images: [crackSealerImg, heroRoadImg],
    tierPrices: [{ minQty: 3, priceUsd: '$3,600' }],
    supplySpecs: {
      leadTime: '5-7个工作日',
      moq: '1台 (支持电压/动力定制)',
      capacityStatus: 'ample',
      capacityLabel: '年产能200台 · 出口型总装线',
      baseLocation: '广州番禺重工制造基地',
      packaging: '角钢框架防护木箱 / CE出口认证及商检'
    },
    // Shown when the site is in English / Arabic / Russian (Chinese is the fields above).
    translations: {
      en: {
        leadTime: '5–7 working days',
        moq: '1 unit (custom voltage/power available)',
        capacityLabel: '200 units/year · export assembly line',
        baseLocation: 'Panyu heavy-equipment base, Guangzhou',
        packaging: 'Steel-framed wooden crate / CE certified, export inspected'
      },
      ar: {
        leadTime: '5–7 أيام عمل',
        moq: 'وحدة واحدة (تخصيص الجهد/مصدر الطاقة متاح)',
        capacityLabel: '200 وحدة سنويًا · خط تجميع للتصدير',
        baseLocation: 'قاعدة المعدات الثقيلة في بانيو، قوانغتشو',
        packaging: 'صندوق خشبي بإطار فولاذي / شهادة CE وفحص التصدير'
      },
      ru: {
        leadTime: '5–7 рабочих дней',
        moq: '1 единица (напряжение/привод под заказ)',
        capacityLabel: '200 ед./год · экспортная сборочная линия',
        baseLocation: 'База тяжёлого машиностроения Паньюй, Гуанчжоу',
        packaging: 'Деревянный ящик со стальным каркасом / CE, экспортная инспекция'
      }
    }
  }
];
