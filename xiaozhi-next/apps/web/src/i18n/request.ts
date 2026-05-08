import { getRequestConfig } from 'next-intl/server';
import { cookies, headers } from 'next/headers';

export default getRequestConfig(async () => {
  // 语言检测：Cookie > Accept-Language Header > 默认 zh-CN
  const cookieStore = await cookies();
  const langCookie = cookieStore.get('userLanguage')?.value;
  
  const headerStore = await headers();
  const acceptLang = headerStore.get('accept-language') || '';

  let locale = langCookie || 'zh-CN';
  if (!langCookie && acceptLang) {
    const first = acceptLang.split(',')[0]?.split(';')[0]?.trim();
    if (first) locale = first;
  }

  // 标准化 locale
  const supportedLocales = ['zh-CN', 'zh-TW', 'en', 'de', 'vi', 'pt-BR'];
  if (!supportedLocales.includes(locale)) {
    locale = 'zh-CN';
  }

  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default,
  };
});
