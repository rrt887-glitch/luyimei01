import { savedLanguage } from './index';

/**
 * Messages shown when part of the page fails. They cannot rely on the language context (it may be
 * what failed), so they are kept here and picked by the visitor's saved language.
 */
const TEXT = {
  zh: {
    updatedTitle: '网站刚刚更新过',
    updatedBody: '请刷新页面以加载最新版本。',
    errorTitle: '页面出了点问题',
    errorBody: '请刷新重试。如果仍然打不开，可以直接通过电话、微信或邮件联系我们。',
    reload: '刷新页面',
    offline: '网络已断开，连上网络后再试。',
    dialogFailed: '窗口没能打开：网络不稳定或网站刚更新，请刷新页面后再试。'
  },
  en: {
    updatedTitle: 'The site has just been updated',
    updatedBody: 'Please reload the page to get the latest version.',
    errorTitle: 'Something went wrong',
    errorBody: 'Please reload and try again. If it still does not open, contact us by phone, WeChat or email.',
    reload: 'Reload page',
    offline: 'You are offline. Please try again once you are connected.',
    dialogFailed: 'That window could not open (unstable connection or the site was just updated). Please reload the page and try again.'
  },
  ar: {
    updatedTitle: 'تم تحديث الموقع للتو',
    updatedBody: 'يرجى إعادة تحميل الصفحة للحصول على أحدث إصدار.',
    errorTitle: 'حدث خطأ ما',
    errorBody: 'يرجى إعادة التحميل والمحاولة مرة أخرى. إذا استمرت المشكلة، تواصل معنا عبر الهاتف أو WeChat أو البريد.',
    reload: 'إعادة تحميل الصفحة',
    offline: 'لا يوجد اتصال بالإنترنت. حاول مرة أخرى بعد الاتصال.',
    dialogFailed: 'تعذّر فتح النافذة (اتصال غير مستقر أو تم تحديث الموقع). يرجى إعادة تحميل الصفحة والمحاولة مجددًا.'
  },
  ru: {
    updatedTitle: 'Сайт только что обновился',
    updatedBody: 'Обновите страницу, чтобы загрузить последнюю версию.',
    errorTitle: 'Что-то пошло не так',
    errorBody: 'Обновите страницу и попробуйте снова. Если не помогает, свяжитесь с нами по телефону, WeChat или email.',
    reload: 'Обновить страницу',
    offline: 'Нет подключения к интернету. Попробуйте снова после подключения.',
    dialogFailed: 'Окно не открылось (нестабильная связь или сайт только что обновился). Обновите страницу и попробуйте снова.'
  }
};

export const boundaryText = () => TEXT[savedLanguage()] || TEXT.zh;
